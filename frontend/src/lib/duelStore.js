import { socket } from "./socket.js";
import { EVENTS } from "../../../shared/protocol.js";

// Tiny module store so duel payloads survive route changes
// (Home navigates to /duel after duel:start, Result reads the summary).
export const duelStore = {
  duel: null, //     last duel:start payload
  round: null, //   last round:start payload
  summary: null // last duel:end payload
};

socket.on(EVENTS.DUEL_START, (payload) => {
  duelStore.duel = payload;
  duelStore.round = null;
  duelStore.summary = null;
});

socket.on(EVENTS.ROUND_START, (payload) => {
  duelStore.round = payload;
});

socket.on(EVENTS.DUEL_END, (payload) => {
  duelStore.summary = payload;
});
