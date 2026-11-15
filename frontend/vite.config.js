import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend (FastAPI, port 8000) is the only source of numbers.
// In development Vite proxies /api and /ws to it.
const target = process.env.LUMOX_API || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true },
      "/ws": { target: target.replace(/^http/, "ws"), ws: true, changeOrigin: true },
    },
  },
});
