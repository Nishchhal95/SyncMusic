# SyncMusic MVP 🎵

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green)](https://nodejs.org/) [![React](https://img.shields.io/badge/React-v18-blue)](https://reactjs.org/) [![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

**SyncMusic** is a web-based music synchronization app that allows multiple devices to join a room and play music in perfect sync. All connected devices act as a distributed speaker system. Users can upload their own tracks, and the host controls playback, seek, and volume.

---

## Features

- Create or join a music room
- Upload and play audio files (host only)
- Real-time synchronized playback across all devices
- Host controls: play, pause, seek, volume
- Track preloading and ready-check before playback
- Real-time participant count

---

## Folder Structure
```text
sync-music-app/
├── backend/      # Node.js server with Express and Socket.IO
├── frontend/     # React + TypeScript frontend
├── .gitignore
└── README.md
```
---

## Prerequisites

- Node.js v18+ and npm
- Git

---

## Backend Setup
1. Navigate to the backend folder:
   cd backend
   
2. Install dependencies:
npm install

3. Start the backend server:
 node index.js

## Frontend Setup
1. Navigate to the frontend folder:
   cd frontend
   
2. Install dependencies:
  npm install

3. Start the frontend development server:
 npm run dev
