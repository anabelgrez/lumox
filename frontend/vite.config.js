import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El backend (FastAPI, puerto 8000) es la única fuente de números.
// En desarrollo Vite reenvía /api y /ws hacia él.
const target = process.env.LUMOX_API || "http://localhost:8000";

// Si el navegador corta un WebSocket a mitad de un cálculo (cambiar de escenario lo
// hace), el proxy recibe ECONNRESET. Sin este manejador, ese error tumbaba Vite.
const quiet = (proxy) => {
  proxy.on("error", (err, _req, res) => {
    if (res && "writeHead" in res && !res.headersSent) { res.writeHead(502); res.end("backend no disponible"); }
  });
  proxy.on("proxyReqWs", (_p, _req, socket) => socket.on("error", () => {}));
};

export default defineConfig({
  plugins: [react()],
  // GitHub Pages sirve bajo /<repo>/; el workflow define VITE_BASE (en local queda "/")
  base: process.env.VITE_BASE || "/",
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true, configure: quiet },
      "/ws": { target: target.replace(/^http/, "ws"), ws: true, changeOrigin: true, configure: quiet },
    },
  },
});
