// Same opt-in shim as run-unsandboxed.js, for running the e2e test without
// Docker Desktop installed/running.
process.env.ALLOW_UNSANDBOXED_EXECUTION = "true";
await import("./e2e-duel.js");
