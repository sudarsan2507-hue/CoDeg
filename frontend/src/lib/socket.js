import { io } from "socket.io-client";

// Same-origin connection: vite dev proxies /socket.io to the backend (see
// vite.config.js); the production build is served by the backend itself.
export const socket = io("/", { autoConnect: true });
