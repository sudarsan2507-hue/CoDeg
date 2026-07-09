// Socket.IO event names shared by backend and frontend.
export const EVENTS = {
  // client → server
  QUEUE_JOIN: "queue:join",
  QUEUE_LEAVE: "queue:leave",
  DUEL_SUBMIT: "duel:submit",

  // server → client
  QUEUE_STATUS: "queue:status",
  DUEL_START: "duel:start",
  ROUND_START: "round:start",
  SUBMIT_RESULT: "submit:result",
  SUBMIT_REJECTED: "submit:rejected",
  COMBAT_EVENT: "combat:event",
  OPPONENT_EVENT: "opponent:event",
  ROUND_END: "round:end",
  DUEL_END: "duel:end"
};
