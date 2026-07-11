// Convenience entry point for solo local play without Docker Desktop
// running. Sets the opt-in flag in code (not shell syntax) so it works
// identically on PowerShell, bash, etc. NEVER use this to run a server
// reachable by anyone other than you — see execution-engine/index.js.
process.env.ALLOW_UNSANDBOXED_EXECUTION = "true";
await import("../src/index.js");
