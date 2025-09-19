import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";

const SERVER_URL = "http://172.30.33.148:3001";

type RoomInfo = { code: string; participants: number };

class AudioManager {
  private ctx: AudioContext | null = null;
  private _buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startTime: number = 0;
  private offset: number = 0;

  get buffer() { return this._buffer; }

  async ensureContext() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  async load(url: string) {
    await this.ensureContext();
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    this._buffer = await this.ctx!.decodeAudioData(arr);
  }

  playAt(delaySec = 0, offsetSec = 0) {
    if (!this.ctx || !this._buffer) return;
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this._buffer;
    src.connect(this.ctx.destination);
    src.start(this.ctx.currentTime + delaySec, offsetSec);
    this.source = src;
    this.startTime = this.ctx.currentTime + delaySec;
    this.offset = offsetSec;
  }

  seek(offsetSec: number) {
    if (!this.ctx || !this._buffer) return;
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this._buffer;
    src.connect(this.ctx.destination);
    src.start(this.ctx.currentTime, offsetSec);
    this.source = src;
    this.startTime = this.ctx.currentTime;
    this.offset = offsetSec;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch {}
      this.source.disconnect();
      this.source = null;
    }
  }

  getProgress() {
    if (!this.ctx || !this.source) return this.offset;
    return this.offset + (this.ctx.currentTime - this.startTime);
  }
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [trackUrl, setTrackUrl] = useState("");
  const [trackName, setTrackName] = useState("");
  const [readyCount, setReadyCount] = useState(0);
  const [trackProgress, setTrackProgress] = useState(0);

  const audioMgr = useRef(new AudioManager());
  const roomCodeRef = useRef(roomCode);
  const trackUrlRef = useRef(trackUrl);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);
  useEffect(() => { trackUrlRef.current = trackUrl; }, [trackUrl]);

useEffect(() => {
  const s = io(SERVER_URL);
  setSocket(s);

  s.on("connect", () => {
    console.log("Socket connected!", s.id);

    // Send initial ping to calculate clock offset
    const t0 = Date.now();
    s.emit("sync:ping", t0);
  });

  // Server responds with pong
  s.on("sync:pong", ({ clientSendTs, serverTs, serverEchoTs }) => {
    const t1 = Date.now(); // time we receive pong
    const rtt = t1 - clientSendTs; // network latency
    const offset = serverTs - (clientSendTs + rtt / 2);
    console.log("Clock offset (ms):", offset);
  });

  // Synchronous handlers
  s.on("room:info", (info: RoomInfo) => setRoomInfo(info));
  s.on("track:readyStatus", ({ ready }: { ready: number; total: number }) => setReadyCount(ready));
  s.on("pause", () => audioMgr.current.stop());

  // Async handlers wrapped in a function
  const handleTrackSet = async (data: { url: string; name: string }) => {
    setTrackUrl(data.url);
    setTrackName(data.name);
    await audioMgr.current.load(`${SERVER_URL}${data.url}`);
    s.emit("track:ready", roomCodeRef.current);
  };
  s.on("track:set", handleTrackSet);

    interface PlayEventData {
    url: string;
    startAtServerMs: number;
    mediaOffsetSec: number;
  }

  const handlePlay = async (data: PlayEventData) => {
    if (trackUrlRef.current !== data.url) {
      await audioMgr.current.load(`${SERVER_URL}${data.url}`);
    }
  
    console.log("Play at Time NOW " + Date.now());
    console.log("Play at Time in MS " + (Date.now() - data.startAtServerMs));
    // console.log("Play at Time in S " + mediaOffsetSec);
    audioMgr.current.playAt();
  };
  s.on("play", handlePlay);

  const handleSeek = async (data: { url: string; offsetSec: number }) => {
    if (trackUrlRef.current !== data.url) {
      await audioMgr.current.load(`${SERVER_URL}${data.url}`);
    }
    audioMgr.current.seek(data.offsetSec);
    setTrackProgress(data.offsetSec);
  };
  s.on("seek", handleSeek);

  // Cleanup on unmount
  return () => {
    s.off("track:set", handleTrackSet);
    s.off("play", handlePlay);
    s.off("seek", handleSeek);
    s.disconnect();
  };
}, []);


  useEffect(() => {
    const interval = setInterval(() => {
      if (audioMgr.current) setTrackProgress(audioMgr.current.getProgress());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const createRoom = () => socket?.emit("room:create", null, (code: string) => { setRoomCode(code); setIsHost(true); });
  const joinRoom = () => socket?.emit("room:join", roomCode, (ok: boolean) => { if (!ok) alert("Failed to join room"); });

  const uploadFile = async () => {
    if (!file || !socket || !isHost) return;
    const form = new FormData();
    form.append("audio", file);
    const res = await axios.post(`${SERVER_URL}/upload`, form);
    const url = res.data.url as string;
    setTrackUrl(url);
    setTrackName(file.name);
    socket.emit("host:setTrack", roomCode, url);
    await audioMgr.current.load(`${SERVER_URL}${url}`);
  };

  const play = () => {
    if (!socket || !roomCode) return;
    if (roomInfo && readyCount < roomInfo.participants) {
      alert("Waiting for all clients to be ready...");
      return;
    }
    socket.emit("host:play", roomCode);
    audioMgr.current.playAt();
  };

  const pause = () => { socket?.emit("host:pause", roomCode); audioMgr.current.stop(); };

  const seek = (offsetSec: number) => {
    if (!socket || !roomCode) return;
    audioMgr.current.seek(offsetSec);
    if (isHost) socket.emit("host:seek", roomCode, offsetSec);
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-6 bg-gray-50 rounded-lg shadow-lg mt-10">
      <h1 className="text-2xl font-bold text-center">SyncMusic MVP</h1>

      {!isHost && !roomInfo && (
        <div className="flex gap-2 justify-center">
          <button onClick={createRoom} className="px-4 py-2 bg-green-600 text-white rounded">Create Room</button>
          <input type="text" placeholder="Room Code" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} className="border p-2 rounded"/>
          <button onClick={joinRoom} disabled={roomCode.length < 1} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Join Room</button>
        </div>
      )}

      {(isHost || roomInfo) && (
        <div className="text-center space-y-1">
          <p className="font-mono text-lg">Room: {roomCode}</p>
          <p>Participants: {roomInfo ? roomInfo.participants : 1}</p>
          {isHost && trackUrl && <p>Ready: {readyCount} / {roomInfo ? roomInfo.participants : 1}</p>}
        </div>
      )}

      {isHost && (
        <div className="space-y-2">
          <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex gap-2 justify-center">
            <button onClick={uploadFile} className="px-4 py-2 bg-yellow-500 text-white rounded">Upload</button>
            <button onClick={play} disabled={!(roomInfo && readyCount >= roomInfo.participants)} className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50">Play</button>
            <button onClick={pause} className="px-4 py-2 bg-red-600 text-white rounded">Pause</button>
          </div>
        </div>
      )}

      {trackUrl && (
        <div className="text-center mt-2">
          <p>Track: {trackName}</p>
          <input type="range"
            min={0} 
            max={audioMgr.current.buffer ? Math.floor(audioMgr.current.buffer.duration) : 0}
            step={0.1}
            value={trackProgress}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-sm">
            <span>{Math.floor(trackProgress)}s / </span>
            <span>{audioMgr.current.buffer ? Math.floor(audioMgr.current.buffer.duration) : 0}s</span>
          </div>
        </div>
      )}
    </div>
  );
}
