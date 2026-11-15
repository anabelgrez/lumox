import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Ic } from "./icons.jsx";

// Escena 3D con Three.js. Todo lo que se ve sale del backend:
//  - el terreno es el parche del DEM LOLA (con la caída por curvatura ya aplicada);
//  - el Sol es una luz direccional en el vector que calculó el motor para esa hora,
//    y su intensidad es la fracción de disco visible que también calculó el motor;
//  - el anillo lejano es el perfil de horizonte (θ por azimut) de los 150 km que
//    no entran en el parche, así desde el módulo se ve lo mismo que en el panorama.
// Marco: x = este, y = arriba, z = −norte (metros).

export function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const SKY = 80000;       // radio de la cúpula donde dibujamos Sol y Tierra (solo visual)
const RING = 30000;      // radio del anillo de horizonte lejano

function dir(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

export default function Scene3D({ patch, result, hour, lang }) {
  const host = useRef(), compass = useRef(), sunLab = useRef(), earthLab = useRef(), siteLab = useRef();
  const R = useRef({});
  const [view, setView] = useState("orbit");
  const es = lang === "es";

  // armar la escena cuando llega el parche
  useEffect(() => {
    if (!patch || !host.current) return;
    const el = host.current;
    const W = el.clientWidth || 800, H = el.clientHeight || 480;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.querySelector("canvas")?.remove(); el.prepend(renderer.domElement);
    renderer.domElement.className = "canvas3d";
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020409);
    const camera = new THREE.PerspectiveCamera(50, W / H, 1, SKY * 3);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxDistance = 40000; controls.minDistance = 5; controls.maxPolarAngle = Math.PI * 0.495;

    // terreno: reducimos a 97×97 en el backend para que ande en cualquier compu
    const n = patch.n || 2, size = (patch.half_size_m || 12000) * 2;
    const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colors = [];
    const lo = patch.min_m ?? 0, hi = patch.max_m ?? 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const k = i * n + j;
      const hLocal = patch.available ? patch.heights_local_m[n - 1 - i][j] : 0;   // fila 0 de la malla = norte
      const hRel = patch.available ? patch.heights_m[n - 1 - i][j] : 0;
      pos.setY(k, hLocal);
      const c = 0.32 + 0.38 * ((hRel - lo) / Math.max(hi - lo, 1));                // gris según altura, como la leyenda
      colors.push(c, c, c * 1.03);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }));
    terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

    // anillo de horizonte lejano (θ del motor, de 0 a 360°)
    const hz = result.horizon, mast = result.spec.mast_m || 2;
    const rg = new THREE.BufferGeometry(), rv = [];
    for (let k = 0; k <= hz.azimuth.length; k++) {
      const a = hz.azimuth[k % hz.azimuth.length], th = hz.elevation[k % hz.azimuth.length];
      const d = dir(a, 0).multiplyScalar(RING);
      const top = mast + RING * Math.tan(THREE.MathUtils.degToRad(th));
      rv.push(d.x, -3000, d.z, d.x, top, d.z);
    }
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rv, 3));
    const idx = []; for (let k = 0; k < hz.azimuth.length; k++) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    rg.setIndex(idx); rg.computeVertexNormals();
    scene.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x1b1f27, side: THREE.DoubleSide })));

    // módulo: cuerpo, patas, mástil y panel (a la altura del mástil del escenario)
    const lander = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe6ebf4, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 2, 16), white); body.position.y = 1.6; body.castShadow = true; lander.add(body);
    for (let k = 0; k < 4; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2), white); const a = k * Math.PI / 2 + Math.PI / 4; leg.position.set(Math.cos(a) * 1.8, 0.8, Math.sin(a) * 1.8); leg.rotation.z = Math.cos(a) * 0.4; leg.rotation.x = -Math.sin(a) * 0.4; lander.add(leg); }
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, mast), new THREE.MeshStandardMaterial({ color: 0x9aa7bd })); m.position.y = 2.6 + mast / 2; lander.add(m);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 0.08), new THREE.MeshStandardMaterial({ color: 0x2f5fb3, emissive: 0x081a40, roughness: 0.3, metalness: 0.4 }));
    panel.position.y = 2.6 + mast; panel.castShadow = true; lander.add(panel);
    scene.add(lander);

    // marcador del sitio: anillo ámbar y poste, visibles desde lejos
    const ring = new THREE.Mesh(new THREE.RingGeometry(140, 180, 48), new THREE.MeshBasicMaterial({ color: 0xf5a623, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 4; scene.add(ring);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 600), new THREE.MeshBasicMaterial({ color: 0xf5a623 })); pole.position.y = 300; scene.add(pole);

    // grilla del vecindario (5×5 cada 2 km), apoyada sobre el terreno y coloreada con el margen en km
    const cells = result.margins?.km?.cells || [], sp = result.margins?.km?.spacing_m || 2000;
    const hAt = (north, east) => {
      if (!patch.available) return 0;
      const j = Math.round((east + size / 2) / size * (n - 1)), i = Math.round((north + size / 2) / size * (n - 1));
      return patch.heights_local_m[Math.max(0, Math.min(n - 1, i))]?.[Math.max(0, Math.min(n - 1, j))] ?? 0;
    };
    for (const c of cells) {
      const pts = [];
      const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]];
      for (const [a, b] of corners) for (let t = 0; t < 8; t++) {
        // subdividimos cada lado para que la línea siga el relieve
        const nxt = corners[(corners.findIndex((q) => q[0] === a && q[1] === b) + 1) % corners.length];
        const nn = c.north_m + (sp / 2) * (a + (nxt[0] - a) * t / 8), ee = c.east_m + (sp / 2) * (b + (nxt[1] - b) * t / 8);
        pts.push(new THREE.Vector3(ee, hAt(nn, ee) + 15, -nn));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c.viable ? 0x2ecc71 : 0xff5a52, transparent: true, opacity: 0.75 }));
      scene.add(line);
    }

    // luces: el Sol real con sombras y un relleno tenue para leer el relieve de noche
    const sun = new THREE.DirectionalLight(0xfff1d6, 3); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 30;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -size / 2; sc.right = sc.top = size / 2; sc.near = 100; sc.far = SKY * 2.2;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0x7d8aa8, 0x1a1d24, 0.6));
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(THREE.MathUtils.degToRad(0.27)) * 3, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffcf6b }));
    const earthBall = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(THREE.MathUtils.degToRad(0.95)), 32, 32), new THREE.MeshStandardMaterial({ color: 0x3b8cff, emissive: 0x123a7a, emissiveIntensity: 0.7 }));
    scene.add(sunBall, earthBall);
    const starPos = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(SKY * 2.5); v.y = Math.abs(v.y); starPos.set([v.x, v.y, v.z], i * 3); }
    const stars = new THREE.BufferGeometry(); stars.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false })));

    let raf;
    const tmp = new THREE.Vector3();
    const place = (obj, lab) => {
      if (!lab) return;
      tmp.copy(obj.position).project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      lab.style.display = vis ? "block" : "none";
      lab.style.left = `${(tmp.x * 0.5 + 0.5) * el.clientWidth}px`; lab.style.top = `${(-tmp.y * 0.5 + 0.5) * el.clientHeight}px`;
    };
    const sitePt = { position: new THREE.Vector3(0, 650, 0) };
    const loop = () => {
      controls.update(); renderer.render(scene, camera);
      // la brújula gira con la cámara para que el norte siempre apunte al norte
      const v = new THREE.Vector3(); camera.getWorldDirection(v);
      const heading = Math.atan2(v.x, -v.z);
      if (compass.current) compass.current.style.transform = `rotate(${-heading}rad)`;
      place(sunBall, sunLab.current); place(earthBall, earthLab.current); place(sitePt, siteLab.current);
      raf = requestAnimationFrame(loop);
    };
    loop();
    R.current = { renderer, camera, controls, sun, sunBall, earthBall, mast };
    const onResize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(onResize); ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); R.current = {}; };
  }, [patch, result?.trace_id]); // eslint-disable-line

  // Sol y Tierra en la hora elegida
  useEffect(() => {
    const r = R.current; if (!r.sun || !result) return;
    const s = result.series, i = Math.min(hour, s.time.length - 1);
    const dS = dir(s.sun_az[i], s.sun_el[i]), dE = dir(s.earth_az[i], s.earth_el[i]);
    r.sun.position.copy(dS).multiplyScalar(SKY); r.sun.target.position.set(0, 0, 0);
    r.sun.intensity = 0.05 + 3 * s.sun_fraction[i];
    r.sunBall.position.copy(dS).multiplyScalar(SKY); r.earthBall.position.copy(dE).multiplyScalar(SKY);
    if (view === "module") aimFromModule(r, s.sun_az[i]);
  }, [hour, result, patch, view]);

  // vistas de cámara
  useEffect(() => {
    const r = R.current; if (!r.camera || !result) return;
    const s = result.series, i = Math.min(hour, s.time.length - 1);
    if (view === "aerial") { r.camera.position.set(0, 26000, 1); r.controls.target.set(0, 0, 0); }
    else if (view === "module") aimFromModule(r, s.sun_az[i]);
    else { r.camera.position.set(5000, (patch?.max_m ?? 0) + 3000, 5000); r.controls.target.set(0, 0, 0); }
    r.controls.update();
  }, [view, patch]); // eslint-disable-line

  if (!result) return null;
  const s = result.series, i = Math.min(hour, s.time.length - 1);
  const views = [["orbit", es ? "Órbita" : "Orbit"], ["module", es ? "Desde el módulo" : "From lander"], ["aerial", es ? "Aérea" : "Aerial"]];
  return (
    <div ref={host} style={{ position: "relative", width: "100%", height: "clamp(360px, 52vh, 620px)" }}>
      {!patch && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      <div className="views seg" role="group" aria-label={es ? "Cámara" : "Camera"}>
        {views.map(([k, l]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}
      </div>
      <svg className="compass" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="34" fill="rgba(5,10,22,.7)" stroke="var(--border-hi)" />
        <g ref={compass} style={{ transformOrigin: "40px 40px" }}>
          <path d="M40 12 L46 40 L40 36 L34 40 Z" fill="var(--soft)" /><path d="M40 68 L46 40 L40 44 L34 40 Z" fill="var(--faint)" />
          <text x="40" y="10" textAnchor="middle" fontSize="11" fill="var(--text)" fontWeight="700">N</text>
          <text x="74" y="44" textAnchor="middle" fontSize="10" fill="var(--soft)">E</text>
        </g>
      </svg>
      <div ref={sunLab} className="label3d sun">☉ {es ? "Sol" : "Sun"} ({s.sun_el[i].toFixed(2)}°)</div>
      <div ref={earthLab} className="label3d earth">⊕ {es ? "Tierra" : "Earth"} ({s.earth_el[i].toFixed(2)}°)</div>
      <div ref={siteLab} className="label3d" style={{ color: "var(--text)" }}>{es ? "Sitio" : "Landing site"}</div>
      {patch?.available && (
        <div className="overlay elev-legend">
          <div className="bar" />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <b className="xs">{es ? "Elevación (m)" : "Elevation (m)"}</b>
            <span className="num">+{Math.round(patch.max_m)}</span><span className="num">0 {es ? "(sitio)" : "(site)"}</span><span className="num">{Math.round(patch.min_m)}</span>
          </div>
        </div>
      )}
      <div className="overlay scale-bar">
        <div className="num" style={{ display: "flex", justifyContent: "space-between", width: 160 }}><span>0</span><span>5</span><span>10 km</span></div>
        <div className="ruler" style={{ width: 160 }} />
      </div>
      <div className="overlay data-tag"><span className={"dot " + (patch?.available ? "ok" : "warn")} />{patch?.available ? `LOLA · ${patch.resolution_m} m/px` : (es ? "Sin relieve: plano" : "No terrain: flat")}</div>
    </div>
  );
}

function aimFromModule(r, sunAz) {
  // ojos a la altura del panel, mirando hacia donde está el Sol
  const eye = new THREE.Vector3(0, 2.6 + r.mast + 1, 0);
  const look = dir(sunAz, 0).multiplyScalar(1000).add(eye);
  r.camera.position.copy(eye); r.controls.target.copy(look); r.controls.update();
}
