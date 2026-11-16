// Lectura de las grillas de terreno que manda el motor (parche grueso del DEM de 80 m y parche fino de 5 m).
// Acá no hay física: solo se interpola entre nodos para saber qué hay bajo el cursor o la cámara.
// Coordenadas locales: north_m / east_m (plano equidistante alrededor del sitio, como las del backend).
// Las filas de las grillas van de sur a norte (fila 0 = sur); las columnas, de oeste a este.

function bil(grid, n, half, step, north, east) {
  const fi = Math.min(Math.max((north + half) / step, 0), n - 1.0001);
  const fj = Math.min(Math.max((east + half) / step, 0), n - 1.0001);
  const i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j;
  const g = (r, c) => grid[r][c];
  return (g(i, j) * (1 - b) + g(i, j + 1) * b) * (1 - a) + (g(i + 1, j) * (1 - b) + g(i + 1, j + 1) * b) * a;
}

const inside = (p, north, east) => p && p.available !== false && p.n && Math.abs(north) <= p.half_size_m && Math.abs(east) <= p.half_size_m;

// Desnivel entre el DEM fino y el grueso en el sitio (el fino se apoya a la altura del grueso)
export const fineShift = (patch, fine) => (fine?.available && patch?.available ? fine.site_z_m - patch.site_z_m : 0);

// Altura del terreno en un punto: del parche fino si el punto cae adentro, si no del grueso.
export function sample(patch, fine, north, east) {
  if (!patch?.available) return { rel: 0, local: 0, lat: null, lon: null, elev: null, src: "plano" };
  const useFine = inside(fine, north, east) && fine.available;
  const p = useFine ? fine : patch;
  const rel = bil(p.heights_m, p.n, p.half_size_m, p.step_m, north, east) + (useFine ? fineShift(patch, fine) : 0);
  const local = bil(p.heights_local_m, p.n, p.half_size_m, p.step_m, north, east) + (useFine ? fineShift(patch, fine) : 0);
  const lat = p.lat_deg ? bil(p.lat_deg, p.n, p.half_size_m, p.step_m, north, east) : null;
  const lon = p.lon_deg ? bil(p.lon_deg, p.n, p.half_size_m, p.step_m, north, east) : null;
  return { rel, local, lat, lon, elev: patch.site_z_m + rel, src: useFine ? `LOLA ${fine.resolution_m} m` : `LOLA ${patch.resolution_m} m` };
}

// Perfil de elevación entre dos puntos (para la regla)
export function profile(patch, fine, a, b, steps = 90) {
  const out = [];
  const L = Math.hypot(b.north - a.north, b.east - a.east);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, n = a.north + (b.north - a.north) * t, e = a.east + (b.east - a.east) * t;
    out.push({ d: L * t, elev: sample(patch, fine, n, e).elev });
  }
  return { length_m: L, points: out };
}

export const clampPos = (patch, p) => {
  const lim = (patch?.half_size_m || 12000) - 150;
  return { north: Math.max(-lim, Math.min(lim, p.north)), east: Math.max(-lim, Math.min(lim, p.east)) };
};

export const fmtNum = (v, d = 1, lang = "es") => (typeof v === "number" && isFinite(v) ? (lang === "es" ? v.toFixed(d).replace(".", ",") : v.toFixed(d)) : "—");
export const fmtLat = (v, lang = "es") => (v == null ? "—" : `${Math.abs(v).toFixed(4)}° ${v < 0 ? "S" : "N"}`);
export const fmtLon = (v, lang = "es") => (v == null ? "—" : `${Math.abs(v).toFixed(4)}° ${v < 0 ? (lang === "es" ? "O" : "W") : "E"}`);
