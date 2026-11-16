import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { fineShift, sample } from "./geo.js";

// Escena 3D de Lumox. La vista principal es en primera persona: alguien parado junto al módulo, con la
// cámara a la altura del mástil elegido, sobre el relieve LOLA real. Todo lo que tiene una posición sale
// del motor:
//  - terreno grueso: DEM LOLA de 80 m (el del cálculo), 24 km; terreno fino: DEM de 5 m, 3 km, solo visual;
//  - anillo lejano: el perfil de horizonte θ(azimut) del motor, hasta 150 km;
//  - el Sol es la luz direccional en el vector del motor; su intensidad es la fracción de disco visible;
//  - las líneas de vista se cortan en la loma que dio el motor, con el rasgo nombrado (IAU/USGS) si hay uno.
// Marco: x = este, y = arriba, z = −norte (metros). Lo ilustrativo (luz de estudio, textura de detalle,
// exageración vertical) lleva rótulo visible.

export function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const SKY = 80000, RING = 30000, LOS = 20000, MAST_X = 3;   // el mástil está 3 m al este del módulo
const D2R = Math.PI / 180;
const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const dirv = (az, el) => { const a = az * D2R, e = el * D2R; return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)); };
const norm360 = (x) => ((x % 360) + 360) % 360;

// ---------- recursos compartidos (se cargan una sola vez)
let _lm;
const loadLander = () => (_lm ??= new Promise((res) => new GLTFLoader().load("/assets/nasa/apollo_lunar_module.glb", (g) => res(g.scene), undefined, () => res(null))));
let _glow, _detail;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,220,150,.5)"); gr.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return (_glow = new THREE.CanvasTexture(c));
}
// Textura de detalle ILUSTRATIVA: ruido fractal sin costuras, solo para que el suelo no se vea liso de cerca.
function detailTex() {
  if (_detail) return _detail;
  const N = 256, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d"), img = g.createImageData(N, N);
  const rnd = (i, j, s) => { const x = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return x - Math.floor(x); };
  const noise = (x, y, per, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const f = (t) => t * t * (3 - 2 * t);
    const a = rnd(xi % per, yi % per, s), b = rnd((xi + 1) % per, yi % per, s), c2 = rnd(xi % per, (yi + 1) % per, s), d = rnd((xi + 1) % per, (yi + 1) % per, s);
    return (a * (1 - f(xf)) + b * f(xf)) * (1 - f(yf)) + (c2 * (1 - f(xf)) + d * f(xf)) * f(yf); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, amp = 0.5, per = 4;
    for (let o = 0; o < 5; o++) { v += amp * noise((x / N) * per, (y / N) * per, per, o); amp *= 0.5; per *= 2; }
    const k = (y * N + x) * 4, s = Math.round(150 + (v - 0.5) * 150); img.data[k] = img.data[k + 1] = img.data[k + 2] = s; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return (_detail = t);
}
function earthMat(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: "varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){ float l = max(dot(normalize(vN), normalize(sunDir)), 0.0); vec3 c = texture2D(map, vUv).rgb; gl_FragColor = vec4(c * (0.06 + 1.1 * l), 1.0); }",
  });
}

function terrainMesh(p, material, shift = 0, uvRepeat = 1) {
  const n = p.n, size = p.half_size_m * 2;
  const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv, col = [];
  const lo = p.min_m, hi = p.max_m;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = i * n + j;                                          // fila 0 de la malla = norte
    pos.setY(k, p.heights_local_m[n - 1 - i][j] + shift);
    const c = 0.42 + 0.30 * ((p.heights_m[n - 1 - i][j] - lo) / Math.max(hi - lo, 1));
    col.push(c, c, c * 1.02);
    uv.setXY(k, (j / (n - 1)) * uvRepeat, (1 - i / (n - 1)) * uvRepeat);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();                                     // normales suaves
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; m.castShadow = true; return m;
}

const lineOf = (pts, color, dashed, opacity = 0.95) => {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 120, gapSize: 90, transparent: true, opacity: 0.6, depthTest: false })
    : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity });
  const l = new THREE.Line(g, m); if (dashed) l.computeLineDistances(); l.renderOrder = 5; return l;
};

// recorta un contorno a un cuadrado (Sutherland–Hodgman) para dibujar sombras que se salen del parche
function clipRing(ring, lim) {
  const edges = [[(p) => p[0] <= lim, (a, b) => { const t = (lim - a[0]) / (b[0] - a[0]); return [lim, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[0] >= -lim, (a, b) => { const t = (-lim - a[0]) / (b[0] - a[0]); return [-lim, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[1] <= lim, (a, b) => { const t = (lim - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, lim]; }],
    [(p) => p[1] >= -lim, (a, b) => { const t = (-lim - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, -lim]; }]];
  let out = ring;
  for (const [inside, cut] of edges) {
    const inp = out; out = []; if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur); } else if (inside(prev)) out.push(cut(prev, cur));
    }
  }
  return out;
}

const Scene3D = forwardRef(function Scene3D({ patch, fine, result, hour, lang, features, layers, pos, apos, onPos, cam, studio, exag, mast, onHover, onPick, rulerPts, minimal = false }, ref) {
  const host = useRef(), strip = useRef(), labelLayer = useRef();
  const R = useRef({ yaw: 0, pitch: 2, fov: 60, pn: 0, pe: 0, an: 0, ae: 0, keys: new Set(), dirty: true, mode: cam, tourA: 0, trans: null });
  const [info, setInfo] = useState({ ms: null, load: null });
  const es = lang === "es";
  const props = useRef({}); props.current = { patch, fine, result, hour, lang, features, layers, onPos, onHover, onPick, mast, exag, cam, studio, rulerPts };

  // ---------------------------------------------------------------- 1) escena base (una sola vez)
  useEffect(() => {
    const el = host.current, t0 = performance.now(), S = R.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "canvas3d"; renderer.domElement.style.touchAction = "none";
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x01030a);
    const camera = new THREE.PerspectiveCamera(S.fov, el.clientWidth / Math.max(el.clientHeight, 1), 1, SKY * 3);
    camera.rotation.order = "YXZ";
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true; orbit.maxDistance = 45000; orbit.minDistance = 5; orbit.enabled = false;
    orbit.addEventListener("change", () => { S.dirty = true; });

    const world = new THREE.Group(), overlays = new THREE.Group(), pt = new THREE.Group();   // pt = punto analizado
    world.add(overlays); scene.add(world, pt);
    const horizonGroup = new THREE.Group(), landerGroup = new THREE.Group(), losGroup = new THREE.Group(), idealGroup = new THREE.Group();
    pt.add(horizonGroup, landerGroup, losGroup, idealGroup);

    const sun = new THREE.DirectionalLight(0xfff3dc, 3.2); sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 4;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -3000; sc.right = 3000; sc.top = 3000; sc.bottom = -6000; sc.near = 10; sc.far = SKY * 2.2;
    scene.add(sun, sun.target);
    const fill = new THREE.HemisphereLight(0x8fa0c4, 0x2a2d36, 0.9); scene.add(fill);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffc46b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sunBall.add(glow);
    const eTex = new THREE.TextureLoader().load("/assets/nasa/earth_blue_marble_5400.jpg", () => { S.dirty = true; }); eTex.colorSpace = THREE.SRGBColorSpace;
    const eMat = earthMat(eTex);
    const earthBall = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), eMat);
    scene.add(sunBall, earthBall);
    const sp = new Float32Array(2500 * 3);
    for (let i = 0; i < 2500; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(SKY * 2.6); sp.set([v.x, Math.abs(v.y), v.z], i * 3); }
    const stars = new THREE.BufferGeometry(); stars.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false })));

    // Luna de contexto (NASA SVS CGI Moon Kit) en un recuadro
    const ctxScene = new THREE.Scene(), ctxCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const tl = new THREE.TextureLoader();
    const mTex = tl.load("/assets/nasa/lroc_color_2k.jpg", () => { S.dirty = true; }); mTex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), new THREE.MeshStandardMaterial({ map: mTex, displacementMap: tl.load("/assets/nasa/ldem_3_8bit.jpg"), displacementScale: 0.02, roughness: 1 }));
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), new THREE.MeshBasicMaterial({ color: 0xe3a24a })); moon.add(pin);
    const ctxSun = new THREE.DirectionalLight(0xffffff, 2.2); ctxScene.add(moon, new THREE.AmbientLight(0xffffff, 0.25), ctxSun);
    ctxCam.up.set(0, 0, -1);

    Object.assign(S, { renderer, scene, camera, orbit, world, overlays, pt, horizonGroup, landerGroup, losGroup, idealGroup, sun, fill, sunBall, earthBall, eMat, moon, pin, ctxCam, ctxSun, ctxScene, meshes: [], labelEls: new Map(), blockSun: null, blockEarth: null });

    // ---- helpers que dependen de las props más recientes
    const P = () => props.current;
    const groundLocal = (n, e) => sample(P().patch, P().fine, n, e).local;
    S.groundLocal = groundLocal;
    // la cámara está donde camina la persona (pn, pe) a la altura del mástil; el módulo y el horizonte lejano, en el punto analizado (an, ae)
    const eyeWorld = () => {
      const { exag: ex = 1, mast: m } = P(); const mm = m ?? P().result?.spec?.mast_m ?? 2;
      return new THREE.Vector3(S.pe + MAST_X, groundLocal(S.pn, S.pe + MAST_X) * ex + mm, -S.pn);
    };
    S.eyeWorld = eyeWorld;
    const pointWorld = () => new THREE.Vector3(S.ae, groundLocal(S.an, S.ae) * (P().exag ?? 1), -S.an);        // punto analizado
    const camPointWorld = () => new THREE.Vector3(S.pe, groundLocal(S.pn, S.pe) * (P().exag ?? 1), -S.pn);     // donde está parada la cámara
    S.pointWorld = pointWorld; S.camPointWorld = camPointWorld;
    const tmpObj = new THREE.Object3D();
    const poseFor = (mode) => {
      const p = camPointWorld(), q = new THREE.Quaternion(), pos3 = new THREE.Vector3(), look = p.clone();
      if (mode === "module") {
        pos3.copy(eyeWorld()); const eu = new THREE.Euler(S.pitch * D2R, -S.yaw * D2R, 0, "YXZ"); q.setFromEuler(eu);
      } else {
        const hMax = P().patch?.available ? P().patch.max_m * (P().exag ?? 1) : 0;
        if (mode === "tour") pos3.set(p.x + Math.sin(S.tourA) * 4500, p.y + 1800 + hMax * 0.2, p.z + Math.cos(S.tourA) * 4500);
        else pos3.set(p.x + 2600, p.y + 1700 + hMax * 0.25, p.z + 2600);
        tmpObj.position.copy(pos3); tmpObj.lookAt(look); q.copy(tmpObj.quaternion);
      }
      return { pos: pos3, q, look };
    };
    S.poseFor = poseFor;
    S.goMode = (mode, instant) => {
      S.mode = mode; orbit.enabled = false;
      const to = poseFor(mode), dur = instant || reduce() ? 0 : 750;
      S.trans = { t0: performance.now(), dur, from: { p: camera.position.clone(), q: camera.quaternion.clone() }, to, mode };
      S.dirty = true;
    };

    // ---- bucle de dibujo (solo cuando algo cambia)
    let raf, last = performance.now(), tFps = last, frames = 0;
    const v3 = new THREE.Vector3(), proj = new THREE.Vector3();
    const place = (pos, el2, offY = 0) => {
      if (!el2) return false;
      proj.copy(pos).project(camera);
      const vis = proj.z < 1 && proj.z > -1 && Math.abs(proj.x) < 1.04 && Math.abs(proj.y) < 1.04;
      el2.style.display = vis ? "block" : "none";
      if (vis) { el2.style.left = `${(proj.x * 0.5 + 0.5) * el.clientWidth}px`; el2.style.top = `${(-proj.y * 0.5 + 0.5) * el.clientHeight + offY}px`; }
      return vis;
    };
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      // movimiento con el teclado (primera persona)
      if (S.mode === "module" && !S.trans && S.keys.size) {
        const fast = S.keys.has("shift") ? 10 : 1, sp2 = 40 * fast * dt, h = S.yaw * D2R;
        let f = 0, r = 0;
        if (S.keys.has("w")) f += 1; if (S.keys.has("s")) f -= 1;
        if (S.keys.has("d")) r += 1; if (S.keys.has("a")) r -= 1;
        if (f || r) {
          const dn = (Math.cos(h) * f + Math.sin(h) * r) * sp2, de = (Math.sin(h) * f - Math.cos(h) * r) * sp2;
          const lim = (P().patch?.half_size_m || 12000) - 150;
          S.pn = Math.max(-lim, Math.min(lim, S.pn + dn)); S.pe = Math.max(-lim, Math.min(lim, S.pe + de)); S.moved = true; S.dirty = true;
        }
        const turn = 90 * dt;
        if (S.keys.has("arrowleft")) { S.yaw -= turn; S.dirty = true; } if (S.keys.has("arrowright")) { S.yaw += turn; S.dirty = true; }
        if (S.keys.has("arrowup")) { S.pitch = Math.min(85, S.pitch + turn); S.dirty = true; } if (S.keys.has("arrowdown")) { S.pitch = Math.max(-85, S.pitch - turn); S.dirty = true; }
        if (S.moved && now - (S.lastCommit || 0) > 250) { S.lastCommit = now; P().onPos?.({ north: S.pn, east: S.pe }); }
      }
      if (S.mode === "tour" && !S.trans) { S.tourA += (reduce() ? 0 : 0.0016); const to = poseFor("tour"); camera.position.copy(to.pos); camera.quaternion.copy(to.q); S.dirty = true; }
      if (S.trans) {
        const T = S.trans, k = T.dur ? Math.min((now - T.t0) / T.dur, 1) : 1, e2 = k * k * (3 - 2 * k);
        T.to = poseFor(T.mode);                                     // el destino puede moverse (la cámara en primera persona, el recorrido)
        camera.position.lerpVectors(T.from.p, T.to.pos, e2); camera.quaternion.slerpQuaternions(T.from.q, T.to.q, e2);
        S.dirty = true;
        if (k >= 1) {
          S.trans = null;
          if (T.mode === "aerial") { orbit.target.copy(T.to.look); orbit.enabled = true; orbit.update(); }
        }
      } else if (S.mode === "aerial") { orbit.update(); }
      else if (S.mode === "module") { const to = poseFor("module"); camera.position.copy(to.pos); camera.quaternion.copy(to.q); if (camera.fov !== S.fov) { camera.fov = S.fov; camera.updateProjectionMatrix(); S.dirty = true; } }
      if (S.mode !== "module" && camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
      if (S.dirty) {
        S.dirty = false; const tr = performance.now();
        // la luz y su sombra siguen al punto
        const cw = camPointWorld(), pw = pointWorld(); sun.target.position.copy(cw); sun.position.copy(cw).add(S.sunDir || new THREE.Vector3(0, 0.01, -1));
        if (S.dS) { S.sunBall.position.copy(cw).addScaledVector(S.dS, SKY); S.earthBall.position.copy(cw).addScaledVector(S.dE, SKY); }
        renderer.setScissorTest(false); renderer.setViewport(0, 0, el.clientWidth, el.clientHeight); renderer.render(scene, camera);
        const w = Math.min(150, el.clientWidth * 0.2), vx = el.clientWidth - w - 14, vy = 72;
        renderer.setScissorTest(true); renderer.setScissor(vx, vy, w, w); renderer.setViewport(vx, vy, w, w);
        renderer.clearDepth(); renderer.render(ctxScene, ctxCam); renderer.setScissorTest(false);
        // franja de rumbo
        camera.getWorldDirection(v3); const heading = norm360(Math.atan2(v3.x, -v3.z) / D2R);
        S.heading = heading;
        if (strip.current) strip.current.style.transform = `translateX(${-(heading + 360) * 4}px)`;
        S.headingEl?.(heading);
        // etiquetas
        const L = S.labels || {};
        place(S.sunBall.position, L.sun); place(S.earthBall.position, L.earth);
        place(new THREE.Vector3(pw.x, pw.y + (P().mast ?? 2) + 6, pw.z), L.lander);
        if (S.blockSun) place(S.blockSun, L.blockSun); else if (L.blockSun) L.blockSun.style.display = "none";
        if (S.blockEarth) place(S.blockEarth, L.blockEarth, 30); else if (L.blockEarth) L.blockEarth.style.display = "none";
        S.placeFeatures?.(place);
        const ms = performance.now() - tr; frames++; S.nFrames = (S.nFrames || 0) + 1;
        // los primeros cuadros compilan shaders y cargan texturas: no cuentan. Después, mediana de los últimos 30.
        if (S.nFrames > 4) { (S.win ||= []).push(ms); if (S.win.length > 30) S.win.shift(); }
        const med = S.win?.length ? [...S.win].sort((a, b) => a - b)[Math.floor(S.win.length / 2)] : null;
        S.msAvg = med;
        if (now - tFps > 1000) { setInfo((s) => ({ ...s, ms: med })); tFps = now; frames = 0; }
        window.__lumox3d = { ms: med, first: S.firstMs, frames: S.nFrames, get fps() { return med ? Math.round(1000 / Math.max(med, 1)) : null; } };
        if (S.nFrames === 1) S.firstMs = ms;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // ---- entrada: mirar arrastrando, zoom con la rueda, clic para moverse, teclado
    const dom = renderer.domElement;
    let down = null;
    const hit = (cx, cy) => {
      const r = dom.getBoundingClientRect(), ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
      const h = rc.intersectObjects(S.meshes, false)[0];
      return h ? { north: -h.point.z, east: h.point.x, y: h.point.y } : null;
    };
    const onDown = (ev) => { dom.setPointerCapture?.(ev.pointerId); el.focus({ preventScroll: true }); down = { x: ev.clientX, y: ev.clientY, moved: false, lx: ev.clientX, ly: ev.clientY }; };
    const onMove = (ev) => {
      if (down) {
        const dx = ev.clientX - down.lx, dy = ev.clientY - down.ly; down.lx = ev.clientX; down.ly = ev.clientY;
        if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) down.moved = true;
        if (S.mode === "module" && down.moved && !S.trans) { const k = 0.2 * (S.fov / 60); S.yaw = norm360(S.yaw - dx * k); S.pitch = Math.max(-85, Math.min(85, S.pitch + dy * k)); S.dirty = true; }
      }
      const now = performance.now();
      if (now - (S.lastHover || 0) > 80 && !down?.moved) {
        S.lastHover = now; const h = hit(ev.clientX, ev.clientY);
        if (h) P().onHover?.({ north: h.north, east: h.east });
      }
    };
    const onUp = (ev) => {
      const d = down; down = null; dom.releasePointerCapture?.(ev.pointerId);
      if (d && !d.moved) { const h = hit(ev.clientX, ev.clientY); if (h) P().onPick?.({ north: h.north, east: h.east }); }
    };
    const onWheel = (ev) => { if (S.mode !== "module") return; ev.preventDefault(); S.fov = Math.max(8, Math.min(90, S.fov * (ev.deltaY > 0 ? 1.1 : 0.9))); S.dirty = true; };
    const kd = (ev) => {
      const k = ev.key.toLowerCase();
      if (["w", "a", "s", "d", "shift", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) { S.keys.add(k); ev.preventDefault(); }
      else if (k === "+" || k === "=") { S.fov = Math.max(8, S.fov * 0.9); S.dirty = true; }
      else if (k === "-") { S.fov = Math.min(90, S.fov * 1.1); S.dirty = true; }
      else if (k === "home") { S.yaw = 0; S.dirty = true; }
    };
    const ku = (ev) => { S.keys.delete(ev.key.toLowerCase()); if (ev.key === "Shift") S.keys.delete("shift"); if (S.moved && !S.keys.size) { S.moved = false; P().onPos?.({ north: S.pn, east: S.pe }); } };
    dom.addEventListener("pointerdown", onDown); dom.addEventListener("pointermove", onMove); dom.addEventListener("pointerup", onUp); dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false }); el.addEventListener("keydown", kd); el.addEventListener("keyup", ku);
    el.addEventListener("blur", () => S.keys.clear());
    const ro = new ResizeObserver(() => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1); camera.updateProjectionMatrix(); S.dirty = true; });
    ro.observe(el);
    setInfo((s) => ({ ...s, load: Math.round(performance.now() - t0) }));
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); orbit.dispose(); renderer.dispose();
      dom.removeEventListener("pointerdown", onDown); dom.removeEventListener("pointermove", onMove); dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("wheel", onWheel); el.removeEventListener("keydown", kd); el.removeEventListener("keyup", ku);
      dom.remove(); Object.keys(S).forEach((k) => { if (!["yaw", "pitch", "fov", "pn", "pe", "keys", "dirty", "mode", "tourA", "trans"].includes(k)) delete S[k]; });
    };
  }, []); // eslint-disable-line

  // ---------------------------------------------------------------- 2) terreno (grueso + fino) y marco de la luna
  useEffect(() => {
    const S = R.current; if (!S.world || !patch) return;
    const meshes = [];
    const dt = detailTex();
    const coarseMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: dt, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    let coarse;
    if (patch.available) { dt.repeat.set(1, 1); coarse = terrainMesh(patch, coarseMat, 0, patch.half_size_m / 30); }
    else { coarse = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x66686e, roughness: 1 })); coarse.receiveShadow = true; }
    S.world.add(coarse); meshes.push(coarse);
    let fineMesh;
    if (fine?.available && patch.available) {
      fineMesh = terrainMesh(fine, new THREE.MeshStandardMaterial({ vertexColors: true, map: dt, roughness: 1, metalness: 0 }), fineShift(patch, fine), fine.half_size_m / 8);
      S.world.add(fineMesh); meshes.push(fineMesh);
    }
    S.meshes = meshes;
    // posición del pin del sitio en la Luna de contexto (u de la textura equirectangular = longitud)
    if (result?.site) {
      const la = result.site.lat * D2R, lo = result.site.lon * D2R, v = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      S.pin.position.copy(v.clone().multiplyScalar(1.03)); S.ctxCam.position.copy(v.clone().multiplyScalar(3.6)); S.ctxCam.lookAt(0, 0, 0);
    }
    S.dirty = true;
    return () => { S.world?.remove(coarse); coarse.geometry.dispose(); coarseMat.dispose(); if (fineMesh) { S.world?.remove(fineMesh); fineMesh.geometry.dispose(); } S.meshes = []; };
  }, [patch, fine, result?.site?.lat]); // eslint-disable-line

  // ---------------------------------------------------------------- 3) capas dibujadas sobre el terreno: cráteres, sombras permanentes, grilla
  useEffect(() => {
    const S = R.current; if (!S.overlays || !patch?.available) return;
    const g = S.overlays; while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose(); }
    const gl = (n, e) => S.groundLocal(n, e);
    const lim = patch.half_size_m - 20;
    const vis = layers || {};
    if (vis.craters && features?.features) {
      for (const f of features.features) {
        const Rm = f.diameter_km * 500, cn = f.north_m, ce = f.east_m;
        if (Math.hypot(cn, ce) - Rm > patch.half_size_m * 1.45) continue;
        const pts = [];
        for (let k = 0; k <= 180; k++) {
          const t = (k / 180) * Math.PI * 2, n = cn + Rm * Math.cos(t), e = ce + Rm * Math.sin(t);
          if (Math.abs(n) > lim || Math.abs(e) > lim) { if (pts.length > 1) g.add(lineOf(pts.splice(0), 0x6cc3d1, false, 0.85)); pts.length = 0; continue; }
          pts.push(new THREE.Vector3(e, gl(n, e) + 4, -n));
        }
        if (pts.length > 1) g.add(lineOf(pts, 0x6cc3d1, false, 0.85));
      }
    }
    if (vis.psr && features?.psr) {
      for (const poly of features.psr) {
        const rings = poly.rings.map((r) => clipRing(r, lim)).filter((r) => r.length >= 3);
        if (!rings.length) continue;
        const area = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;
        const sign = Math.sign(area(rings.reduce((a, b) => (Math.abs(area(a)) >= Math.abs(area(b)) ? a : b))));
        const outers = rings.filter((r) => Math.sign(area(r)) === sign), holes = rings.filter((r) => Math.sign(area(r)) !== sign);
        for (const o of outers) {
          const c2 = o.map((p) => new THREE.Vector2(p[1], -p[0]));
          const h2 = holes.map((h) => h.map((p) => new THREE.Vector2(p[1], -p[0])));
          let tris; try { tris = THREE.ShapeUtils.triangulateShape(c2, h2); } catch { continue; }
          const all = c2.concat(...h2), verts = [];
          for (const v of all) { const n = -v.y, e = v.x; verts.push(e, gl(n, e) + 3, -n); }
          const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
          geo.setIndex(tris.flat()); geo.computeVertexNormals();
          const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3b6fd6, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
          m.renderOrder = 2; g.add(m);
        }
        for (const r of rings) {
          const pts = []; for (let i = 0; i <= r.length; i++) { const p = r[i % r.length]; if (Math.abs(p[0]) >= lim - 1 || Math.abs(p[1]) >= lim - 1) { if (pts.length > 1) g.add(lineOf(pts.splice(0), 0x5a94da, false, 0.9)); pts.length = 0; continue; } pts.push(new THREE.Vector3(p[1], gl(p[0], p[1]) + 5, -p[0])); }
          if (pts.length > 1) g.add(lineOf(pts, 0x5a94da, false, 0.9));
        }
      }
    }
    if (vis.grid && result?.margins?.km) {
      const sp = result.margins.km.spacing_m, bn = S.an, be = S.ae;
      for (const c of result.margins.km.cells) {
        const pts = [], cs = [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]];
        for (let q = 0; q < 4; q++) for (let t = 0; t <= 8; t++) {
          const a = cs[q], b = cs[q + 1], nn = bn + c.north_m + (sp / 2) * (a[0] + (b[0] - a[0]) * t / 8), ee = be + c.east_m + (sp / 2) * (a[1] + (b[1] - a[1]) * t / 8);
          pts.push(new THREE.Vector3(ee, gl(nn, ee) + 15, -nn));
        }
        g.add(lineOf(pts, c.viable ? 0x2ecc71 : 0xff5a52, false, 0.6));
      }
    }
    S.dirty = true;
  }, [features, layers?.craters, layers?.psr, layers?.grid, patch, fine, result?.trace_id, apos?.north, apos?.east]); // eslint-disable-line

  // ---------------------------------------------------------------- 4) lo que pertenece al punto analizado: horizonte lejano, módulo, horizonte ideal
  useEffect(() => {
    const S = R.current; if (!S.pt || !result) return;
    const clear = (g) => { while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose(); } };
    clear(S.horizonGroup); clear(S.landerGroup); clear(S.idealGroup);
    const mm = result.spec.mast_m || 2, hz = result.horizon, rv = [], idx = [];
    for (let k = 0; k <= hz.azimuth.length; k++) {
      const a = hz.azimuth[k % hz.azimuth.length], th = hz.elevation[k % hz.azimuth.length], d = dirv(a, 0).multiplyScalar(RING);
      rv.push(d.x, -4000, d.z, d.x, mm + RING * Math.tan(th * D2R), d.z);
    }
    for (let k = 0; k < hz.azimuth.length; k++) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.Float32BufferAttribute(rv, 3)); rg.setIndex(idx);
    S.horizonGroup.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x161a22, side: THREE.DoubleSide })));
    // horizonte IDEAL: el plano horizontal a la altura del mástil (θ = 0), para compararlo con el real
    const ideal = []; for (let k = 0; k <= 180; k++) { const d = dirv(k * 2, 0).multiplyScalar(RING * 0.98); ideal.push(new THREE.Vector3(d.x, mm, d.z)); }
    S.idealGroup.add(lineOf(ideal, 0xece7de, true)); S.idealGroup.children[0].material.opacity = 0.7;
    // módulo (modelo ilustrativo de NASA 3D Resources) con su mástil y panel a la altura elegida
    const white = new THREE.MeshStandardMaterial({ color: 0xe6ebf4, roughness: 0.5 });
    const simple = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 3, 12), white); simple.position.y = 1.5; simple.castShadow = true; S.landerGroup.add(simple);
    loadLander().then((src) => {
      if (!src || !S.landerGroup) return;
      const obj = src.clone(true), box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3()), s = 7 / Math.max(sz.y, 1e-6);
      obj.scale.setScalar(s); obj.position.y = -box.min.y * s; obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      S.landerGroup.remove(simple); S.landerGroup.add(obj); S.dirty = true;
    });
    const mastM = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, mm), new THREE.MeshStandardMaterial({ color: 0xb8c2d4 })); mastM.position.set(MAST_X, mm / 2, 0); mastM.castShadow = true; S.landerGroup.add(mastM);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.06), new THREE.MeshStandardMaterial({ color: 0x24508f, roughness: 0.35, metalness: 0.5 })); panel.position.set(MAST_X, mm, 0); panel.castShadow = true; S.landerGroup.add(panel);
    const ring = new THREE.Mesh(new THREE.RingGeometry(60, 75, 48), new THREE.MeshBasicMaterial({ color: 0xe3a24a, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 2; ring.renderOrder = 5; S.landerGroup.add(ring); S.siteRing = ring;
    S.dirty = true;
  }, [result?.trace_id]); // eslint-disable-line

  // ---------------------------------------------------------------- 5) posición del punto/cámara, exageración, luz, capas, modo
  useEffect(() => {
    const S = R.current; if (!S.pt) return;
    if (pos && (pos.north !== S.pn || pos.east !== S.pe)) { S.pn = pos.north; S.pe = pos.east; }
    if (apos && (apos.north !== S.an || apos.east !== S.ae)) { S.an = apos.north; S.ae = apos.east; }
    S.dirty = true;
  }, [pos?.north, pos?.east, apos?.north, apos?.east]); // eslint-disable-line
  useEffect(() => {
    const S = R.current; if (!S.world) return;
    S.world.scale.y = exag || 1;
    const p = S.pointWorld(); S.pt.position.set(p.x, p.y, p.z);          // el punto analizado queda sobre el terreno (exagerado o no)
    S.dirty = true;
  }, [exag, patch, fine, apos?.north, apos?.east, result?.trace_id]); // eslint-disable-line
  useEffect(() => { const S = R.current; if (!S.fill) return; S.fill.intensity = studio ? 0.9 : 0.02; S.dirty = true; }, [studio]);
  useEffect(() => {
    const S = R.current; if (!S.sun) return;
    S.sun.castShadow = layers?.shadows !== false; S.losGroup.visible = layers?.los !== false; S.idealGroup.visible = layers?.ideal !== false;
    S.dirty = true;
  }, [layers?.shadows, layers?.los, layers?.ideal, result?.trace_id]);
  useEffect(() => {
    const S = R.current; if (!S.camera) return;
    if (S.siteRing) S.siteRing.visible = cam !== "module";
    S.landerGroup && (S.landerGroup.visible = true);
    const changed = S.lastCam !== cam; S.lastCam = cam;
    // al entrar en primera persona, mirar hacia el Sol si está sobre el horizonte
    if (changed && cam === "module" && result) { const i = Math.min(hour, result.series.time.length - 1); if (result.series.sun_el[i] > -1) S.yaw = result.series.sun_az[i]; }
    if (changed || !S.trans) S.goMode(cam, !changed);
  }, [cam, patch, result?.trace_id]); // eslint-disable-line
  useEffect(() => { const S = R.current; if (S.camera && S.mode === "module") { S.dirty = true; } }, [mast]);

  // ---------------------------------------------------------------- 6) Sol, Tierra y líneas de vista a la hora elegida
  useEffect(() => {
    const S = R.current; if (!S.sun || !result) return;
    const s = result.series, i = Math.min(hour, s.time.length - 1), hz = result.horizon;
    const dS = dirv(s.sun_az[i], s.sun_el[i]), dE = dirv(s.earth_az[i], s.earth_el[i]);
    S.sunDir = dS.clone().multiplyScalar(SKY); S.sun.intensity = 3.2 * s.sun_fraction[i];
    S.dS = dS; S.dE = dE;
    S.sunBall.scale.setScalar(SKY * Math.tan(s.sun_rho_deg[i] * D2R)); S.earthBall.scale.setScalar(SKY * Math.tan(s.earth_rho_deg[i] * D2R));   // tamaño aparente real de cada hora
    S.sunBall.children[0].scale.setScalar(7);
    S.eMat.uniforms.sunDir.value.copy(dS);                                  // fase de la Tierra
    S.ctxSun.position.copy(dS.clone().multiplyScalar(5));
    // líneas de vista: ámbar/azul si se ve; roja y cortada en la loma si no
    const g = S.losGroup; while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose(); }
    S.blockSun = null; S.blockEarth = null;
    const mm = result.spec.mast_m || 2, eye = new THREE.Vector3(MAST_X, mm - 0.4, 0);
    const names = (az) => hz.feature?.[Math.round(norm360(az) / 360 * hz.azimuth.length) % hz.azimuth.length] || null;
    const mk = (az, el, frac, blockM, hzDeg, color) => {
      const d = dirv(az, el);
      if (frac > 0.001 && blockM == null) { g.add(lineOf([eye, eye.clone().addScaledVector(d, LOS)], color, false)); return null; }
      const dist = blockM ?? 1000, h = mm + dist * Math.tan((hzDeg ?? 0) * D2R);
      const p = dirv(az, 0).multiplyScalar(dist).setY(h); p.x += eye.x;
      g.add(lineOf([eye, p], frac > 0.001 ? color : 0xff5a52, false));
      g.add(lineOf([p, eye.clone().addScaledVector(d, LOS)], 0xff5a52, true));
      const pts = new THREE.Points(new THREE.BufferGeometry().setFromPoints([p]), new THREE.PointsMaterial({ color: 0xff5a52, size: 12, sizeAttenuation: false, depthTest: false })); pts.renderOrder = 6; g.add(pts);
      return new THREE.Vector3().copy(p).add(S.pt.position);
    };
    S.blockSun = mk(s.sun_az[i], s.sun_el[i], s.sun_fraction[i], s.sun_block_m?.[i], s.sun_horizon_deg?.[i], 0xe3a24a);
    S.blockEarth = mk(s.earth_az[i], s.earth_el[i], s.earth_fraction[i], s.earth_block_m?.[i], s.earth_horizon_deg?.[i], 0x5a94da);
    S.featSun = names(s.sun_az[i]); S.featEarth = names(s.earth_az[i]);
    S.dirty = true; setInfo((x) => ({ ...x, tick: i }));
  }, [hour, result?.trace_id, apos?.north, apos?.east]); // eslint-disable-line

  // ---------------------------------------------------------------- 7) etiquetas de rasgos nombrados (flotan sobre el rasgo, o sobre el horizonte en primera persona)
  useEffect(() => {
    const S = R.current, layer = labelLayer.current; if (!S.camera || !layer) return;
    const els = S.labelEls; els.forEach((v) => v.remove()); els.clear();
    S.placeFeatures = null;
    if (!layers?.craters || !features?.features?.length) { S.dirty = true; return; }
    const list = features.features.slice(0, 24).map((f) => {
      const e = document.createElement("div"); e.className = "label3d feat";
      layer.appendChild(e); els.set(f.name, e); return { f, e };
    });
    const nm = (v, d = 1) => (es ? v.toFixed(d).replace(".", ",") : v.toFixed(d));
    S.placeFeatures = (place) => {
      const hz = result?.horizon, taken = [];
      const blocking = new Set([S.featSun?.name, S.featEarth?.name].filter(Boolean));
      for (const { f, e } of list) {
        // distancia y rumbo desde la posición actual (plano local; ±0,1 % a estas distancias)
        const dn = f.north_m - S.pn, de = f.east_m - S.pe, dist = Math.hypot(dn, de), brg = norm360(Math.atan2(de, dn) / D2R);
        e.textContent = `${f.name} · Ø ${nm(f.diameter_km)} km · ${nm(dist / 1000)} km · ${Math.round(brg)}°`;
        e.classList.toggle("blocking", blocking.has(f.name));
        let wp;
        if (S.mode === "module" || S.mode === "tour") {
          // sobre el horizonte, en su dirección: a la altura del perfil del motor + un poco
          const th = hz ? hz.elevation[Math.round(brg / 360 * hz.azimuth.length) % hz.azimuth.length] : 0;
          const d = Math.min(dist, RING * 0.9); wp = dirv(brg, th + 1.6).multiplyScalar(d).add(S.pt.position); wp.y += (result?.spec.mast_m || 2);
        } else {
          if (Math.abs(f.north_m) > (patch?.half_size_m || 12000) || Math.abs(f.east_m) > (patch?.half_size_m || 12000)) { e.style.display = "none"; continue; }
          wp = new THREE.Vector3(f.east_m, S.groundLocal(f.north_m, f.east_m) * (S.world.scale.y || 1) + 30, -f.north_m);
        }
        if (!place(wp, e)) continue;
        const x = parseFloat(e.style.left), y = parseFloat(e.style.top);
        if (!blocking.has(f.name) && taken.some((t) => Math.abs(t[0] - x) < 150 && Math.abs(t[1] - y) < 24)) e.style.display = "none"; else taken.push([x, y]);
      }
    };
    S.dirty = true;
    return () => { els.forEach((v) => v.remove()); els.clear(); S.placeFeatures = null; };
  }, [features, layers?.craters, result?.trace_id, lang, patch]); // eslint-disable-line

  // ---------------------------------------------------------------- 8) regla: marcadores de los dos puntos
  useEffect(() => {
    const S = R.current; if (!S.scene) return;
    if (S.rulerObj) { S.scene.remove(S.rulerObj); S.rulerObj.traverse((c) => c.geometry?.dispose()); S.rulerObj = null; }
    if (rulerPts?.length) {
      const g = new THREE.Group(); const pts = rulerPts.map((p) => new THREE.Vector3(p.east, S.groundLocal(p.north, p.east) * (S.world.scale.y || 1) + 6, -p.north));
      pts.forEach((p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(18, 12, 12), new THREE.MeshBasicMaterial({ color: 0xece7de, depthTest: false })); m.position.copy(p); m.renderOrder = 7; g.add(m); });
      if (pts.length === 2) {
        const seg = []; for (let k = 0; k <= 60; k++) { const t = k / 60, n = rulerPts[0].north + (rulerPts[1].north - rulerPts[0].north) * t, e = rulerPts[0].east + (rulerPts[1].east - rulerPts[0].east) * t; seg.push(new THREE.Vector3(e, S.groundLocal(n, e) * (S.world.scale.y || 1) + 8, -n)); }
        g.add(lineOf(seg, 0xece7de, false));
      }
      S.scene.add(g); S.rulerObj = g;
    }
    S.dirty = true;
  }, [rulerPts, exag, patch, fine]); // eslint-disable-line

  // ---------------------------------------------------------------- control remoto (brújula del visor)
  useImperativeHandle(ref, () => ({
    yawBy: (d) => { const S = R.current; if (S.mode === "module") S.yaw = norm360(S.yaw + d); else S.orbit?.rotateLeft?.(d * D2R); S.dirty = true; },
    pitchBy: (d) => { const S = R.current; if (S.mode === "module") S.pitch = Math.max(-85, Math.min(85, S.pitch + d)); S.dirty = true; },
    zoomBy: (k) => { const S = R.current; if (S.mode === "module") S.fov = Math.max(8, Math.min(90, S.fov * k)); else { S.camera.position.sub(S.orbit.target).multiplyScalar(k).add(S.orbit.target); } S.dirty = true; },
    north: () => { const S = R.current; S.yaw = 0; if (S.mode !== "module") S.goMode(S.mode, false); S.dirty = true; },
    reset: () => { const S = R.current; S.yaw = result ? (result.series.sun_el[Math.min(hour, result.series.time.length - 1)] > -1 ? result.series.sun_az[Math.min(hour, result.series.time.length - 1)] : 0) : 0; S.pitch = 2; S.fov = 60; S.goMode(S.mode); },
    focus: () => { R.current.el?.focus(); },
    heading: () => R.current.heading || 0,
    state: () => ({ yaw: R.current.yaw, pitch: R.current.pitch, fov: R.current.fov, mode: R.current.mode }),
    setHeadingListener: (fn) => { R.current.headingEl = fn; },
    setLabels: (l) => { R.current.labels = l; },
  }), [result, hour]);

  // ---------------------------------------------------------------- 9) etiquetas fijas (React) y franja de rumbo
  const lab = (k) => (e) => { const S = R.current; S.labels = { ...(S.labels || {}), [k]: e }; };
  const s0 = result?.series, i0 = result ? Math.min(hour, s0.time.length - 1) : 0;
  const nm1 = (v, d = 2) => (es ? v.toFixed(d).replace(".", ",") : v.toFixed(d));
  const km = (m) => (m == null ? "" : m < 1000 ? `${Math.round(m)} m` : `${nm1(m / 1000, 1)} km`);
  const why = (f, who, m) => {
    const body = es ? (who === "sun" ? "El Sol" : "La Tierra") : (who === "sun" ? "The Sun" : "Earth");
    if (!f) return es ? `${body} queda tapado por relieve sin nombre (a ${km(m)})` : `${body} is blocked by unnamed terrain (${km(m)} away)`;
    const rel = es ? { rim: "detrás del borde de", on: "detrás de la ladera de", inside: "detrás del relieve interior de" }[f.relation] : { rim: "behind the rim of", on: "behind the slope of", inside: "behind the inner terrain of" }[f.relation];
    return `${body} ${es ? "queda" : "is"} ${rel} ${f.name} (${km(m)})`;
  };
  const sunBlocked = result && s0.sun_fraction[i0] < 0.999, earthBlocked = result && s0.earth_fraction[i0] <= 0;
  const fS = R.current.featSun, fE = R.current.featEarth;
  const ticks = [];
  for (let d = 0; d <= 720; d += 5) {
    const a = d % 360, card = { 0: es ? "N" : "N", 90: "E", 180: "S", 270: es ? "O" : "W" }[a];
    ticks.push(<div key={d} className={"hs-tick" + (d % 15 === 0 ? " big" : "")} style={{ left: d * 4 }}>{card ? <b>{card}</b> : d % 30 === 0 ? <span>{a}°</span> : null}</div>);
  }
  return (
    <div ref={host} className="scene3d" tabIndex={0} role="application" aria-label={es ? "Vista 3D del sitio. Flechas: mirar. W A S D: moverse. Más y menos: zoom." : "3D site view. Arrows: look. W A S D: move. Plus and minus: zoom."}
      style={{ position: "relative", width: "100%", height: "100%", minHeight: 260, outline: "none" }}>
      {!patch && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      {!minimal && <div className="heading-strip" aria-hidden="true"><div className="hs-inner" ref={strip}>{ticks}</div><div className="hs-mark" /></div>}
      <div ref={labelLayer} className="label-layer" aria-hidden="true" />
      <div ref={lab("sun")} className="label3d sun">☉ {es ? "Sol" : "Sun"} · {result ? nm1(s0.sun_el[i0]) : ""}°</div>
      <div ref={lab("earth")} className="label3d earth">⊕ {es ? "Tierra" : "Earth"} · {result ? nm1(s0.earth_el[i0]) : ""}°</div>
      <div ref={lab("lander")} className="label3d">{es ? "Módulo" : "Lander"} · {es ? "mástil" : "mast"} {mast ?? result?.spec.mast_m} m</div>
      <div ref={lab("blockSun")} className="label3d blocked">{sunBlocked ? why(fS, "sun", s0.sun_block_m?.[i0]) : ""}</div>
      <div ref={lab("blockEarth")} className="label3d blocked">{earthBlocked ? why(fE, "earth", s0.earth_block_m?.[i0]) : ""}</div>
      <div className="s3-badges">
        {studio && <span className="badge warn">{es ? "Iluminación ilustrativa" : "Illustrative lighting"}</span>}
        {(exag || 1) !== 1 && <span className="badge warn">{es ? `Relieve exagerado ×${exag}` : `Terrain exaggerated ×${exag}`}</span>}
        {patch?.available && <span className="badge info">{es ? "Textura de detalle ilustrativa" : "Illustrative detail texture"}</span>}
        {patch && !patch.available && <span className="badge bad">{es ? "Sin relieve: plano" : "No terrain: flat"}</span>}
      </div>
      <div className="overlay ctx-label">{es ? "Luna: NASA SVS / LRO" : "Moon: NASA SVS / LRO"}</div>
      <div className="overlay lm-credit">{es ? "Módulo: modelo ilustrativo (NASA 3D Resources)" : "Lander: illustrative model (NASA 3D Resources)"}</div>
      <div className="overlay perf-tag mono">{info.ms != null ? `${info.ms.toFixed(1)} ms/${es ? "cuadro (CPU)" : "frame (CPU)"}` : ""}{info.load != null ? ` · ${es ? "carga" : "load"} ${info.load} ms` : ""}</div>
    </div>
  );
});

export default Scene3D;
