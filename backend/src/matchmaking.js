import { EVENTS } from "../../shared/protocol.js";
import { Duel } from "./duel.js";

// Simple FIFO matchmaking: first waiting player pairs with the next joiner.
export function createMatchmaking() {
  let waiting = null; // { socket, name }
  const duelsBySocket = new Map();

  function join(socket, rawName) {
    if (duelsBySocket.has(socket.id)) {
      return socket.emit(EVENTS.QUEUE_STATUS, { error: "Already in a duel" });
    }
    const name = String(rawName || "").trim().slice(0, 20) || `coder_${socket.id.slice(0, 4)}`;

    if (waiting && waiting.socket.id === socket.id) {
      return socket.emit(EVENTS.QUEUE_STATUS, { waiting: true });
    }
    if (!waiting || !waiting.socket.connected) {
      waiting = { socket, name };
      return socket.emit(EVENTS.QUEUE_STATUS, { waiting: true });
    }

    const players = [waiting, { socket, name }];
    waiting = null;
    const duel = new Duel(players, (ended) => {
      for (const f of ended.fighters.values()) duelsBySocket.delete(f.id);
    });
    for (const p of players) duelsBySocket.set(p.socket.id, duel);
    duel.start();
  }

  function leave(socket) {
    if (waiting?.socket.id === socket.id) waiting = null;
    socket.emit(EVENTS.QUEUE_STATUS, { waiting: false });
  }

  function disconnect(socket) {
    if (waiting?.socket.id === socket.id) waiting = null;
    duelsBySocket.get(socket.id)?.handleDisconnect(socket.id);
    duelsBySocket.delete(socket.id);
  }

  function submit(socket, code) {
    const duel = duelsBySocket.get(socket.id);
    if (!duel) {
      return socket.emit(EVENTS.SUBMIT_REJECTED, { reason: "Not in a duel" });
    }
    duel.handleSubmit(socket.id, code);
  }

  return { join, leave, disconnect, submit };
}
