import { createServer } from "./server.js";
import { detectRunner } from "../../execution-engine/index.js";

const PORT = Number(process.env.PORT) || 4000;

const { httpServer } = createServer();

detectRunner().then((mode) => {
  httpServer.listen(PORT, () => {
    console.log(`[codeg] backend on http://localhost:${PORT} (runner: ${mode})`);
    console.log("[codeg] open two browser tabs and hit Find Match in both to duel yourself");
  });
});
