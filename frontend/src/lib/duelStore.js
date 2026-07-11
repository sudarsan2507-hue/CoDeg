import { socket } from "./socket.js";
import { EVENTS } from "../../../shared/protocol.js";

const STORAGE_KEY = "codeg-duel";

// Tiny module store so duel payloads survive route changes
// (Home navigates to /duel after duel:start, Result reads the summary).
export const duelStore = {
  duel: null, //     last duel:start payload
  round: null, //   last round:start payload
  summary: null // last duel:end payload
};

// Survives both a socket-level reconnect (network blip, tab stays open) and
// a full page refresh (sessionStorage, unlike this module's state, persists
// across reloads) so a dropped connection doesn't cost the match.
export function savePendingDuel({ duelId, token }) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ duelId, token }));
  } catch {
    // sessionStorage unavailable (private mode etc.) — reconnect just won't auto-resume
  }
}

export function loadPendingDuel() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingDuel() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

socket.on(EVENTS.DUEL_START, (payload) => {
  duelStore.duel = payload;
  duelStore.round = null;
  duelStore.summary = null;
  savePendingDuel({ duelId: payload.duelId, token: payload.you.token });
});

socket.on(EVENTS.ROUND_START, (payload) => {
  duelStore.round = payload;
});

socket.on(EVENTS.DUEL_END, (payload) => {
  duelStore.summary = payload;
  clearPendingDuel();
});

socket.on(EVENTS.REJOIN_REJECTED, () => {
  clearPendingDuel();
});

// Fires on the initial connect AND every socket.io auto-reconnect. If we
// remember a live duel, ask the server to re-attach this socket to it.
socket.on("connect", () => {
  const pending = loadPendingDuel();
  if (pending) socket.emit(EVENTS.DUEL_REJOIN, pending);
});
