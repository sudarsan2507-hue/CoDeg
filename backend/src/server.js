import express from "express";
import { createServer as createHttpServer } from "node:http";
import { Server } from "socket.io";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENTS } from "../../shared/protocol.js";
import { currentRunnerMode } from "../../execution-engine/index.js";
import { createMatchmaking } from "./matchmaking.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../../frontend/dist");

export function createServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: { origin: true } // local dev convenience; tighten before hosting
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, runner: currentRunnerMode() });
  });

  // Serve the built frontend when it exists, so `npm start` is a full game server.
  if (existsSync(path.join(DIST_DIR, "index.html"))) {
    app.use(express.static(DIST_DIR));
    app.get("*", (_req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
  }

  const matchmaking = createMatchmaking();
  io.on("connection", (socket) => {
    socket.on(EVENTS.QUEUE_JOIN, (payload) => matchmaking.join(socket, payload?.name));
    socket.on(EVENTS.QUEUE_LEAVE, () => matchmaking.leave(socket));
    socket.on(EVENTS.DUEL_SUBMIT, (payload) => matchmaking.submit(socket, payload?.code));
    socket.on("disconnect", () => matchmaking.disconnect(socket));
  });

  return { app, httpServer, io };
}
