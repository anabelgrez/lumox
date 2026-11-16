import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { STATIC } from "./api.js";
import "./styles.css";
import "./simple.css";
import "./premium.css";
import "./explorer.css";

// Aviso fijo en la demo estática (GitHub Pages): los datos son precalculados y simulados.
const Notice = () => (
  <div role="note" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9999, background: "#7a5200", color: "#fff",
    font: "500 12px/1.4 Inter, system-ui, sans-serif", padding: "5px 12px", textAlign: "center" }}>
    Demo con datos simulados y precalculados (sin motor de cálculo en vivo). Ejecutada en local, Lumox calcula todo en tiempo real con datos de JPL Horizons.
    {" · "}Demo with simulated, precomputed data. Run locally for the live engine.
  </div>
);

createRoot(document.getElementById("root")).render(<>{STATIC && <Notice />}<App /></>);
