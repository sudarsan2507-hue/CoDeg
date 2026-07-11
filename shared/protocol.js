// Socket.IO event names shared by backend and frontend.
export const EVENTS = {
  // client → server
  QUEUE_JOIN: "queue:join",
  QUEUE_LEAVE: "queue:leave",
  DUEL_SUBMIT: "duel:submit",
  DUEL_REJOIN: "duel:rejoin",

  // server → client
  QUEUE_STATUS: "queue:status",
  DUEL_START: "duel:start",
  REJOIN_REJECTED: "duel:rejoin-rejected",
  ROUND_START: "round:start",
  SUBMIT_RESULT: "submit:result",
  SUBMIT_REJECTED: "submit:rejected",
  COMBAT_EVENT: "combat:event",
  OPPONENT_EVENT: "opponent:event", //    kind: submitted | disconnected | reconnected
  ROUND_END: "round:end",
  DUEL_END: "duel:end"
};
