const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = "http://172.30.33.148:5173";

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));

// Socket Events
const CONNECTION = "connection";
const CREATE_ROOM = "room:create";
const JOIN_ROOM = "room:join";

const rooms = new Map();
const readyClients = new Map();

//#region Setup Upload Directory
const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });
//#endregion

//#region End Points
app.use("/uploads", express.static(uploadDir));
app.get("/time", (_req, res) => {
  res.json({ now: Date.now() });
});
app.post("/upload", upload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});
//#endregion

//#region Socket Setup and Callbacks
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: FRONTEND_ORIGIN, methods: ["GET", "POST"] }
});

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.on("room:create", (_, cb) => {
    const roomCode = genRoomCode();
    rooms.set(roomCode, { hostSocketId: socket.id });
    socket.join(roomCode);
    updateRoomCount(roomCode);
    cb && cb(roomCode);
  });

  socket.on("room:join", (roomCode, cb) => {
    if (!rooms.has(roomCode)) return cb && cb(false, "Room not found");
    socket.join(roomCode);
    updateRoomCount(roomCode);
    cb && cb(true);
  });

  // simple NTP-like ping
  socket.on("sync:ping", (clientSendTs) => {
    const serverTs = Date.now();
    socket.emit("sync:pong", { clientSendTs, serverTs, serverEchoTs: Date.now() });
  });

  socket.on("host:setTrack", (roomCode, url) => {
    const r = rooms.get(roomCode);
    if (!r || r.hostSocketId !== socket.id) return;
    r.currentTrackUrl = url;
    // Reset ready clients for this room
    readyClients.set(roomCode, new Set());
    io.to(roomCode).emit("track:set", { url, name: path.basename(url) });
  });

  socket.on("host:play", (roomCode, mediaOffsetSec = 0) => {
    const r = rooms.get(roomCode);
    if (!r || r.hostSocketId !== socket.id || !r.currentTrackUrl) return;
    //const startAtServerMs = Date.now() + 3000; // 3s buffer
    const startAtServerMs = Date.now();
    console.log("Play at Time in MS " + startAtServerMs);
    console.log("Play at Time in S " + (startAtServerMs / 1000));
    io.to(roomCode).emit("play", {
      url: r.currentTrackUrl,
      startAtServerMs,
      mediaOffsetSec
    });
  });

  socket.on("host:pause", (roomCode) => {
    const r = rooms.get(roomCode);
    if (!r || r.hostSocketId !== socket.id) return;
    io.to(roomCode).emit("pause");
  });

   // Host seeks
  socket.on("host:seek", (roomCode, offsetSec) => {
    const r = rooms.get(roomCode);
    if (!r || r.hostSocketId !== socket.id || !r.currentTrackUrl) return;
    io.to(roomCode).emit("seek", { url: r.currentTrackUrl, offsetSec });
  });

  socket.on("disconnect", () => {
    // if host left, end room
    for (const [code, r] of rooms.entries()) {
      if (r.hostSocketId === socket.id) {
        io.to(code).emit("room:ended");
        rooms.delete(code);
        if (roomCode) 
          {
            updateRoomCount(roomCode);
          }
      }
    }
  });

  socket.on("track:ready", function(roomCode) {
    // Initialize set if it doesn't exist
    if (!readyClients.has(roomCode)) {
      readyClients.set(roomCode, new Set());
    }

    // Add this socket to the ready set
    readyClients.get(roomCode).add(socket.id);

    // Get total participants in the room
    const room = io.sockets.adapter.rooms.get(roomCode);
    const total = room ? room.size : 0;
    const ready = readyClients.get(roomCode).size;

    // Notify the host about ready status
    const roomData = rooms.get(roomCode);
    if (roomData && roomData.hostSocketId) {
      io.to(roomData.hostSocketId).emit("track:readyStatus", { ready, total });
    }
  });

    //#region Functions
    function genRoomCode() {
      return Math.random().toString(36).slice(2, 7).toUpperCase();
    }

    function updateRoomCount(roomCode) {
    const room = io.sockets.adapter.rooms.get(roomCode);
    const participants = room ? room.size : 0;
    if (!room) return;
    io.to(roomCode).emit("room:info", {
      code: roomCode,
      participants: participants,
    });
  }
  //#endregion

});
//#endregion

server.listen(3001, "0.0.0.0", () => console.log("Server running on port 3001"));