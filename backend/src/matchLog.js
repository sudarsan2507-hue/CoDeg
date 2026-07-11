import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.resolve(__dirname, "../../database/matches.log.jsonl");

// Best-effort durability for completed matches: in-memory duel/matchmaking
// state still vanishes on restart (see database/README.md), but a record of
// who played and who won survives it. One JSON object per line, append-only.
export async function appendMatch(record) {
  try {
    await mkdir(path.dirname(LOG_FILE), { recursive: true });
    await appendFile(LOG_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("[matchLog] failed to append match record:", err.message);
  }
}
