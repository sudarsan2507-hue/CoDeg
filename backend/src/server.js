import express from "express";
import { createServer as createHttpServer } from "node:http";
import { Server } from "socket.io";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENTS } from "../../shared/protocol.js";
import { currentRunnerMode } from "../../execution-engine/index.js";
import { createMatchmaking } from "./matchmaking.js";
import { createRateLimiter } from "./rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../../frontend/dist");

// Comma-separated list of allowed origins, e.g. "https://codeg.example.com".
// Defaults to the local Vite dev server — NOT a wildcard — so a random site
// can't open sockets against this backend. Set ALLOWED_ORIGIN=* to disable
// (only for trusted/internal deployments).
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";
const corsOrigin = ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",").map((o) => o.trim());

// Connections and queue joins are cheap to spam; cap both per IP.
const connectLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const joinLimiter = createRateLimiter({ windowMs: 10_000, max: 5 });

export function createServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin }
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

  io.use((socket, next) => {
    const ip = socket.handshake.address;
    if (!connectLimiter.allow(ip)) {
      return next(new Error("rate_limited"));
    }
    next();
  });

  io.on("connection", (socket) => {
    const ip = socket.handshake.address;
    socket.on(EVENTS.QUEUE_JOIN, (payload) => {
      if (!joinLimiter.allow(ip)) {
        return socket.emit(EVENTS.QUEUE_STATUS, { error: "Too many attempts — slow down" });
      }
      matchmaking.join(socket, payload?.name);
    });
    socket.on(EVENTS.QUEUE_LEAVE, () => matchmaking.leave(socket));
    socket.on(EVENTS.DUEL_SUBMIT, (payload) => matchmaking.submit(socket, payload?.code));
    socket.on(EVENTS.DUEL_REJOIN, (payload) => matchmaking.rejoin(socket, payload?.duelId, payload?.token));
    socket.on("disconnect", () => matchmaking.disconnect(socket));
  });

  return { app, httpServer, io };
}
