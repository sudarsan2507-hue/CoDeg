import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true
      }
    },
    fs: {
      // allow importing ../shared (protocol + combat formulas)
      allow: [".."]
    }
  }
});
