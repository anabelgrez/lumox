// LaTeX del motor → texto legible, sin cargar una librería de fórmulas.
// Solo cambia la forma de escribir: la fórmula completa sigue en el title y en la traza.
const SYM = {
  theta: "θ", rho: "ρ", psi: "ψ", eta: "η", Delta: "Δ", delta: "δ", phi: "φ", varphi: "φ", lambda: "λ", pi: "π",
  odot: "☉", oplus: "⊕", cdot: "·", times: "×", le: "≤", ge: "≥", sum: "Σ", iint: "∬", int: "∫", wedge: "∧",
  neg: "¬", iff: "⇔", sqrt: "√", infty: "∞", to: "→",
};
export const pretty = (s = "") => s
  .replace(/\\(left|right|bigl|bigr|Big|big)(?![A-Za-z])/g, "")
  .replace(/\\[,;!]/g, " ").replace(/\\quad/g, " ")
  .replace(/\\(mathrm|text|mathbf|operatorname)\{([^}]*)\}/g, "$2")
  .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
  // primero los comandos comunes (si no, "\hat u" convertido en "û" se pega a "\cdot")
  .replace(/\\(?!vec|hat)([A-Za-z]+)/g, (_, w) => SYM[w] ?? w)
  .replace(/\\vec\s*\{?(\w)\}?/g, "$1⃗").replace(/\\hat\s*\{?(\w)\}?/g, "$1̂")
  .replace(/\\([%_ ])/g, "$1")
  .replace(/\^2(?![0-9])/g, "²").replace(/\^\{([^}]*)\}/g, "^$1")
  .replace(/_\{([^}]*)\}/g, "$1").replace(/_([A-Za-z0-9])/g, "$1")
  .replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
