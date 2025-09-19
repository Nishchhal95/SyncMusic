import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import axios from "axios";

const socket = io("http://localhost:3001"); // backend URL

export default function App() {
  const [roomCode, setRoomCode] = useState("");
  const [file, setFile] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState("");

  // Create Room
  const createRoom = () => {
    socket.emit("room:create", null, (code) => {
      setRoomCode(code);
    });
  };

  // Join Room
  const joinRoom = () => {
    socket.emit("room:join", roomCode, (ok) => {
      if (!ok) alert("Room not found");
    });
  };

  // Upload File
  const uploadFile = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("audio", file);
    const res = await axios.post("http://localhost:3001/upload", formData);
    setUploadedUrl(res.data.url);
  };

  // Play / Pause
  const play = () => {
    socket.emit("host:play", roomCode, 0);
  };

  const pause = () => {
    socket.emit("host:pause", roomCode);
  };

  return (
    <div className="p-6 space-y-4 text-center">
      <h1 className="text-2xl font-bold">SyncMusic MVP</h1>

      <div className="space-x-2">
        <button onClick={createRoom} className="px-4 py-2 bg-green-500 text-white rounded">
          Create Room
        </button>
        <input
          type="text"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          placeholder="Room Code"
          className="border px-2 py-1"
        />
        <button onClick={joinRoom} className="px-4 py-2 bg-blue-500 text-white rounded">
          Join Room
        </button>
      </div>

      <div className="space-x-2">
        <input type="file" onChange={(e) => setFile(e.target.files[0])} />
        <button onClick={uploadFile} className="px-4 py-2 bg-yellow-500 text-white rounded">
          Upload File
        </button>
      </div>

      {uploadedUrl && (
        <div>
          <p>Uploaded: {uploadedUrl}</p>
          <audio src={`http://localhost:3001${uploadedUrl}`} controls />
        </div>
      )}

      <div className="space-x-2">
        <button onClick={play} className="px-4 py-2 bg-purple-500 text-white rounded">
          Play
        </button>
        <button onClick={pause} className="px-4 py-2 bg-red-500 text-white rounded">
          Pause
        </button>
      </div>
    </div>
  );
}
