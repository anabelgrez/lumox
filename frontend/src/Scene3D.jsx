import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { getTerrainFine } from "./api.js";

// Escena 3D. Todo lo que tiene una posición sale del motor:
//  - terreno grueso: parche del DEM LOLA de 80 m que usa el cálculo (24 km);
//  - terreno fino: DEM LOLA de 5 m del sitio (Barker et al. 2021), solo para ver, 3 km;
//  - anillo lejano: el perfil de horizonte θ(azimut) del motor, hasta 150 km;
//  - el Sol es la luz direccional en el vector del motor; su intensidad, la fracción
//    de disco visible; las líneas de vista se cortan en la loma que dio el motor.
// Marco: x = este, y = arriba, z = −norte (metros). Lo ilustrativo lleva rótulo.

export function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const SKY = 80000;     // radio de la cúpula donde se dibujan Sol y Tierra (solo visual)
const RING = 30000;    // radio del anillo de horizonte lejano
const LOS = 20000;     // largo de las líneas de vista que no chocan
const D2R = Math.PI / 180;
const reduceMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function dir(az, el) {
  const a = az * D2R, e = el * D2R;
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

// malla de terreno desde una grilla de alturas (fila 0 = sur en el parche del backend)
function terrainMesh(p, material) {
  const n = p.n, size = p.half_size_m * 2;
  const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = [];
  const lo = p.min_m, hi = p.max_m;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = i * n + j;
    pos.setY(k, p.heights_local_m[n - 1 - i][j]);           // fila 0 de la malla = norte
    const c = 0.42 + 0.30 * ((p.heights_m[n - 1 - i][j] - lo) / Math.max(hi - lo, 1));
    col.push(c, c, c * 1.02);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();                                  // normales suaves
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; m.castShadow = true;
  return m;
}

// Tierra con su fase: la ilumina la dirección real del Sol, sin depender de lo que tapa el relieve.
function earthMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN;
      void main(){ float l = max(dot(normalize(vN), normalize(sunDir)), 0.0); vec3 c = texture2D(map, vUv).rgb; gl_FragColor = vec4(c * (0.06 + 1.1 * l), 1.0); }`,
  });
}

export default function Scene3D({ patch, result, hour, lang }) {
  const host = useRef(), compass = useRef(), labs = useRef({});
  const R = useRef({});
  const es = lang === "es";
  const [cam, setCam] = useState("aerial");          // module | aerial | tour
  const [studio, setStudio] = useState(true);        // luz de estudio por defecto: la real casi no deja ver
  const [exag, setExag] = useState(1);
  const [fine, setFine] = useState(null);
  const [fps, setFps] = useState(null);
  const [loadMs, setLoadMs] = useState(null);

  useEffect(() => { if (result) getTerrainFine(result.site.lat, result.site.lon).then(setFine); }, [result?.site?.lat, result?.site?.lon]); // eslint-disable-line

  // ---------- armar la escena
  useEffect(() => {
    if (!patch || !host.current || !result) return;
    const t0 = performance.now();
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));   // 1.5 alcanza y cuida los 60 fps
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "canvas3d";
    el.querySelector("canvas")?.remove(); el.prepend(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x01030a);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 1, SKY * 3);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxDistance = 45000; controls.minDistance = 3;
    const world = new THREE.Group(); scene.add(world);       // lo que se exagera en altura
    const mast = result.spec.mast_m || 2;
    const loader = new THREE.TextureLoader();

    // terreno grueso (el del cálculo) y anillo lejano
    const matCoarse = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    if (patch.available) world.add(terrainMesh(patch, matCoarse));
    else { const g = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), matCoarse); g.receiveShadow = true; world.add(g); }
    const hz = result.horizon, rv = [], idx = [];
    for (let k = 0; k <= hz.azimuth.length; k++) {
      const a = hz.azimuth[k % hz.azimuth.length], th = hz.elevation[k % hz.azimuth.length], d = dir(a, 0).multiplyScalar(RING);
      rv.push(d.x, -4000, d.z, d.x, mast + RING * Math.tan(th * D2R), d.z);
    }
    for (let k = 0; k < hz.azimuth.length; k++) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.Float32BufferAttribute(rv, 3)); rg.setIndex(idx);
    world.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x15181f, side: THREE.DoubleSide })));

    // módulo: modelo de NASA 3D Resources (ilustrativo); mientras carga, uno simple
    const lander = new THREE.Group(); scene.add(lander);
    const simple = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 3, 12), new THREE.MeshStandardMaterial({ color: 0xd9dee8 })); simple.position.y = 1.5; simple.castShadow = true; lander.add(simple);
    new GLTFLoader().load("/assets/nasa/apollo_lunar_module.glb", (g) => {
      const obj = g.scene, box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3());
      const s = 7 / Math.max(sz.y, 1e-6);                     // ~7 m de alto, como el real
      obj.scale.setScalar(s); obj.position.y = -box.min.y * s;
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      lander.remove(simple); lander.add(obj); if (R.current) R.current.dirty = true;
    }, undefined, () => { /* si no carga, queda el modelo simple */ });
    const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, mast), new THREE.MeshStandardMaterial({ color: 0xb8c2d4 }));
    mastMesh.position.set(3, mast / 2, 0); lander.add(mastMesh);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.06), new THREE.MeshStandardMaterial({ color: 0x24508f, roughness: 0.35, metalness: 0.5 }));
    panel.position.set(3, mast, 0); panel.castShadow = true; lander.add(panel);
    const ring = new THREE.Mesh(new THREE.RingGeometry(60, 75, 48), new THREE.MeshBasicMaterial({ color: 0xf5a623, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 2; ring.renderOrder = 5; scene.add(ring);

    // grilla del vecindario sobre el terreno (colores = margen en km)
    const cells = result.margins?.km?.cells || [], sp = result.margins?.km?.spacing_m || 2000, size = 24000, n = patch.n || 2;
    const hAt = (north, east) => {
      if (!patch.available) return 0;
      const j = Math.round((east + size / 2) / size * (n - 1)), i = Math.round((north + size / 2) / size * (n - 1));
      return patch.heights_local_m[Math.max(0, Math.min(n - 1, i))]?.[Math.max(0, Math.min(n - 1, j))] ?? 0;
    };
    for (const c of cells) {
      const pts = [], cs = [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]];
      for (let q = 0; q < 4; q++) for (let t = 0; t <= 8; t++) {
        const a = cs[q], b = cs[q + 1], nn = c.north_m + (sp / 2) * (a[0] + (b[0] - a[0]) * t / 8), ee = c.east_m + (sp / 2) * (a[1] + (b[1] - a[1]) * t / 8);
        pts.push(new THREE.Vector3(ee, hAt(nn, ee) + 20, -nn));
      }
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c.viable ? 0x2ecc71 : 0xff5a52, transparent: true, opacity: 0.6 })));
    }

    // luces
    const sun = new THREE.DirectionalLight(0xfff3dc, 3.2); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 4;   // 3 m por texel en 6 km
    const sc = sun.shadow.camera; sc.left = sc.bottom = -3000; sc.right = sc.top = 3000; sc.near = 10; sc.far = SKY * 2.2;   // sombras nítidas cerca del módulo
    scene.add(sun, sun.target);
    const fill = new THREE.HemisphereLight(0x8fa0c4, 0x2a2d36, 0.9); scene.add(fill);

    // Sol (disco con halo) y Tierra (Blue Marble, con fase)
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(0.267 * D2R), 24, 24), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(), color: 0xffc46b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(SKY * 0.08); sunBall.add(glow);
    const eTex = loader.load("/assets/nasa/earth_blue_marble_5400.jpg"); eTex.colorSpace = THREE.SRGBColorSpace;
    const eMat = earthMaterial(eTex);
    const earthBall = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(0.95 * D2R), 48, 48), eMat);
    scene.add(sunBall, earthBall);
    const starPos = new Float32Array(2500 * 3);
    for (let i = 0; i < 2500; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(SKY * 2.6); starPos.set([v.x, Math.abs(v.y), v.z], i * 3); }
    const st = new THREE.BufferGeometry(); st.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(st, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false })));

    // líneas de vista (se rearman en cada hora)
    const losGroup = new THREE.Group(); scene.add(losGroup);

    // Luna de contexto (NASA SVS CGI Moon Kit), en un recuadro aparte
    const ctxScene = new THREE.Scene(), ctxCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const mTex = loader.load("/assets/nasa/lroc_color_2k.jpg"); mTex.colorSpace = THREE.SRGBColorSpace;
    const dTex = loader.load("/assets/nasa/ldem_3_8bit.jpg");
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), new THREE.MeshStandardMaterial({ map: mTex, displacementMap: dTex, displacementScale: 0.02, roughness: 1 }));
    ctxScene.add(moon, new THREE.AmbientLight(0xffffff, 0.25));
    const ctxSun = new THREE.DirectionalLight(0xffffff, 2.2); ctxScene.add(ctxSun);
    const site = result.site, pin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), new THREE.MeshBasicMaterial({ color: 0xf5a623 }));
    // posición del sitio en la esfera (u de la textura equirectangular = longitud)
    const la = site.lat * D2R, lo = site.lon * D2R;
    const sp3 = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
    pin.position.copy(sp3.clone().multiplyScalar(1.03)); moon.add(pin);
    // en el polo el sitio queda sobre el eje y: le damos otro "arriba" a la cámara para que no se trabe
    ctxCam.up.set(0, 0, -1);
    ctxCam.position.copy(sp3.clone().multiplyScalar(3.6)); ctxCam.lookAt(0, 0, 0);

    // ---------- bucle
    let raf, frames = 0, tFps = performance.now();
    const tmp = new THREE.Vector3(), camGoal = { pos: null, look: null };
    const place = (pos, lab) => {
      if (!lab) return;
      tmp.copy(pos).project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
      lab.style.display = vis ? "block" : "none";
      lab.style.left = `${(tmp.x * 0.5 + 0.5) * el.clientWidth}px`; lab.style.top = `${(-tmp.y * 0.5 + 0.5) * el.clientHeight}px`;
    };
    // Dibujamos solo cuando algo cambia (cámara, hora, interruptores): en reposo no gasta nada
    // y cuando se mueve tiene todo el presupuesto del cuadro.
    controls.addEventListener("change", () => { R.current.dirty = true; });
    const loop = () => {
      const r = R.current;
      if (r.tour) { r.tourA += 0.0015; camera.position.set(Math.sin(r.tourA) * 4500, 1800 + (r.hMax || 0), Math.cos(r.tourA) * 4500); controls.target.set(0, 0, 0); r.dirty = true; }
      else if (camGoal.pos) {
        // transición suave hacia la cámara elegida
        const k = reduceMotion() ? 1 : 0.1;
        camera.position.lerp(camGoal.pos, k); controls.target.lerp(camGoal.look, k);
        if (camera.position.distanceTo(camGoal.pos) < 0.5) { camera.position.copy(camGoal.pos); controls.target.copy(camGoal.look); camGoal.pos = null; }
        r.dirty = true;
      }
      controls.update();
      if (!r.dirty) { raf = requestAnimationFrame(loop); return; }
      r.dirty = false;
      const tr = performance.now();
      renderer.setScissorTest(false); renderer.setViewport(0, 0, el.clientWidth, el.clientHeight); renderer.render(scene, camera);
      // recuadro de contexto
      const w = Math.min(150, el.clientWidth * 0.22);
      renderer.setScissorTest(true); renderer.setScissor(el.clientWidth - w - 12, 64, w, w); renderer.setViewport(el.clientWidth - w - 12, 64, w, w);
      renderer.clearDepth(); renderer.render(ctxScene, ctxCam); renderer.setScissorTest(false);
      const v = new THREE.Vector3(); camera.getWorldDirection(v);
      if (compass.current) compass.current.style.transform = `rotate(${-Math.atan2(v.x, -v.z)}rad)`;
      const L = labs.current;
      place(sunBall.position, L.sun); place(earthBall.position, L.earth); place(new THREE.Vector3(0, 14 * (r.exag || 1) + mast, 0), L.lander);
      place(new THREE.Vector3(0, 60, -11000), L.north);
      if (r.blockSun) place(r.blockSun, L.blockSun); else if (L.blockSun) L.blockSun.style.display = "none";
      if (r.blockEarth) place(r.blockEarth, L.blockEarth); else if (L.blockEarth) L.blockEarth.style.display = "none";
      // costo real de un cuadro (lo que importa para llegar a 60 fps: < 16,7 ms)
      const ms = performance.now() - tr;
      r.msAvg = r.msAvg == null ? ms : r.msAvg * 0.9 + ms * 0.1;
      frames++; const now = performance.now();
      if (now - tFps > 1000) { R.current.fpsVal = Math.round(1000 / Math.max(r.msAvg, 1)); setFps(r.msAvg); frames = 0; tFps = now; }
      raf = requestAnimationFrame(loop);
    };
    R.current = { renderer, scene, camera, controls, sun, sunBall, earthBall, eMat, world, fill, losGroup, mast, camGoal, ctxSun, moon,
      siteRing: ring, hMax: patch.available ? patch.max_m : 0, exag: 1, tour: false, tourA: 0, dirty: true };
    // el GLB y las texturas llegan después: cuando terminan, hay que volver a dibujar
    THREE.DefaultLoadingManager.onLoad = () => { if (R.current) R.current.dirty = true; };
    window.__lumox3d = { get fps() { return R.current.fpsVal; } };   // para medir en las pruebas
    loop();
    setLoadMs(Math.round(performance.now() - t0));
    const ro = new ResizeObserver(() => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); }); ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); R.current = {}; };
  }, [patch, result?.trace_id, result?.site?.lat]); // eslint-disable-line

  // ---------- terreno fino (5 m) alrededor del módulo, cuando llega
  useEffect(() => {
    const r = R.current; if (!r.world || !fine?.available) return;
    const m = terrainMesh(fine, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    m.name = "fine"; r.world.add(m); r.dirty = true;
    return () => { r.world?.remove(m); m.geometry.dispose(); };
  }, [fine, patch, result?.trace_id]); // eslint-disable-line

  // ---------- exageración vertical y luz de estudio
  useEffect(() => { const r = R.current; if (!r.world) return; r.world.scale.y = exag; r.exag = exag; r.dirty = true; }, [exag, patch, result?.trace_id]);
  useEffect(() => { const r = R.current; if (!r.fill) return; r.fill.intensity = studio ? 0.9 : 0.02; r.dirty = true; }, [studio, patch, result?.trace_id]);

  // ---------- Sol, Tierra y líneas de vista en la hora elegida
  useEffect(() => {
    const r = R.current; if (!r.sun || !result) return;
    const s = result.series, i = Math.min(hour, s.time.length - 1);
    const dS = dir(s.sun_az[i], s.sun_el[i]), dE = dir(s.earth_az[i], s.earth_el[i]);
    r.sun.position.copy(dS).multiplyScalar(SKY); r.sun.target.position.set(0, 0, 0);
    r.sun.intensity = 3.2 * s.sun_fraction[i];                  // lo que tapa el relieve lejano lo dice el motor
    r.sunBall.position.copy(dS).multiplyScalar(SKY); r.earthBall.position.copy(dE).multiplyScalar(SKY);
    r.eMat.uniforms.sunDir.value.copy(dS);                       // fase de la Tierra
    r.ctxSun.position.copy(dir(s.sun_az[i], s.sun_el[i]).multiplyScalar(5));

    // líneas de vista: ámbar/azul si se ve; roja y cortada en la loma si no
    r.losGroup.clear(); r.blockSun = null; r.blockEarth = null;
    const eye = new THREE.Vector3(3, r.mast, 0);
    const addLine = (body, az, el, frac, blockM, hzDeg, color) => {
      const d = dir(az, el);
      if (frac > 0.001 && blockM == null) {
        r.losGroup.add(line([eye, eye.clone().add(d.multiplyScalar(LOS))], color, false));
        return null;
      }
      // punto de la loma: dirección del cuerpo, distancia y ángulo que dio el motor
      const dist = blockM ?? 1000, h = r.mast + dist * Math.tan((hzDeg ?? 0) * D2R);
      const p = new THREE.Vector3().copy(dir(az, 0)).multiplyScalar(dist).setY(h * (r.exag || 1));
      p.x += eye.x;
      r.losGroup.add(line([eye, p], frac > 0.001 ? color : 0xff5a52, false));
      r.losGroup.add(line([p, eye.clone().add(d.clone().multiplyScalar(LOS))], 0xff5a52, true));
      // marca de tamaño fijo en pantalla: se ve igual desde el módulo que desde el aire
      const mk = new THREE.Points(new THREE.BufferGeometry().setFromPoints([p]), new THREE.PointsMaterial({ color: 0xff5a52, size: 12, sizeAttenuation: false, depthTest: false }));
      mk.renderOrder = 6; r.losGroup.add(mk);
      return p;
    };
    r.blockSun = addLine("sun", s.sun_az[i], s.sun_el[i], s.sun_fraction[i], s.sun_block_m?.[i], s.sun_horizon_deg?.[i], 0xf5a623);
    r.blockEarth = addLine("earth", s.earth_az[i], s.earth_el[i], s.earth_fraction[i], s.earth_block_m?.[i], s.earth_horizon_deg?.[i], 0x3b8cff);
    r.dirty = true;
  }, [hour, result, patch, exag]);

  // ---------- cámaras con nombre
  useEffect(() => {
    const r = R.current; if (!r.camera || !result) return;
    const s = result.series, i = Math.min(hour, s.time.length - 1);
    r.tour = cam === "tour";
    if (r.siteRing) r.siteRing.visible = cam !== "module";     // desde el módulo el anillo del sitio estorba
    r.dirty = true;
    if (cam === "module") {
      const eye = new THREE.Vector3(3, r.mast + 1.6, 0);
      r.camGoal.pos = eye.clone().sub(dir(s.sun_az[i], 0).multiplyScalar(0.01));
      r.camGoal.look = eye.clone().add(dir(s.sun_az[i], 0).multiplyScalar(2));
    } else if (cam === "aerial") {
      r.camGoal.pos = new THREE.Vector3(2600, 1700 + (r.hMax || 0) * (r.exag || 1), 2600);
      r.camGoal.look = new THREE.Vector3(0, 0, 0);
    }
  }, [cam, patch, result?.trace_id]); // eslint-disable-line

  if (!result) return null;
  const s = result.series, i = Math.min(hour, s.time.length - 1);
  const N = (v, d = 1) => (es ? v.toFixed(d).replace(".", ",") : v.toFixed(d));
  const sunBlocked = s.sun_fraction[i] < 0.999, earthBlocked = s.earth_fraction[i] <= 0;
  const km = (m) => (m == null ? "" : m < 1000 ? `${Math.round(m)} m` : `${N(m / 1000)} km`);
  return (
    <div ref={host} className="scene3d" style={{ position: "relative", width: "100%", height: "clamp(380px, 56vh, 640px)" }}>
      {!patch && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      <div className="s3-controls">
        <div className="seg" role="group" aria-label={es ? "Cámara" : "Camera"}>
          {[["module", es ? "Desde el módulo" : "From the lander"], ["aerial", es ? "Vista aérea" : "Aerial view"], ["tour", es ? "Recorrido" : "Fly-around"]].map(([k, l]) =>
            <button key={k} className={cam === k ? "on" : ""} onClick={() => setCam(k)}>{l}</button>)}
        </div>
        <div className="seg" role="group" aria-label={es ? "Iluminación" : "Lighting"}>
          <button className={!studio ? "on" : ""} onClick={() => setStudio(false)}>{es ? "Luz real" : "Real light"}</button>
          <button className={studio ? "on" : ""} onClick={() => setStudio(true)}>{es ? "Luz de estudio" : "Studio light"}</button>
        </div>
        <div className="seg" role="group" aria-label={es ? "Exageración vertical" : "Vertical exaggeration"}>
          {[1, 3].map((x) => <button key={x} className={exag === x ? "on" : ""} onClick={() => setExag(x)}>×{x}</button>)}
        </div>
      </div>
      <div className="s3-badges">
        {studio && <span className="badge warn">{es ? "Iluminación ilustrativa" : "Illustrative lighting"}</span>}
        {exag !== 1 && <span className="badge warn">{es ? `Relieve exagerado ×${exag}` : `Terrain exaggerated ×${exag}`}</span>}
        {!patch?.available && <span className="badge bad">{es ? "Sin relieve: plano" : "No terrain: flat"}</span>}
      </div>
      <svg className="compass" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="34" fill="rgba(5,10,22,.75)" stroke="var(--border-hi)" />
        <g ref={compass} style={{ transformOrigin: "40px 40px" }}>
          <path d="M40 12 L46 40 L40 36 L34 40 Z" fill="var(--bad)" /><path d="M40 68 L46 40 L40 44 L34 40 Z" fill="var(--faint)" />
          <text x="40" y="10" textAnchor="middle" fontSize="13" fill="var(--text)" fontWeight="700">N</text>
        </g>
      </svg>
      <div ref={(e) => (labs.current.sun = e)} className="label3d sun">☉ {es ? "Sol" : "Sun"} · {N(s.sun_el[i], 2)}°</div>
      <div ref={(e) => (labs.current.earth = e)} className="label3d earth">⊕ {es ? "Tierra" : "Earth"} · {N(s.earth_el[i], 2)}°</div>
      <div ref={(e) => (labs.current.lander = e)} className="label3d">{es ? "Módulo" : "Lander"} · {es ? "mástil" : "mast"} {result.spec.mast_m} m</div>
      <div ref={(e) => (labs.current.north = e)} className="label3d north">N</div>
      <div ref={(e) => (labs.current.blockSun = e)} className="label3d blocked">{sunBlocked ? (es ? `El Sol queda tapado por esta loma (a ${km(s.sun_block_m?.[i])})` : `The Sun is blocked by this ridge (${km(s.sun_block_m?.[i])} away)`) : ""}</div>
      <div ref={(e) => (labs.current.blockEarth = e)} className="label3d blocked">{earthBlocked ? (es ? `La Tierra queda tapada por esta loma (a ${km(s.earth_block_m?.[i])})` : `Earth is blocked by this ridge (${km(s.earth_block_m?.[i])} away)`) : ""}</div>
      <div className="overlay ctx-label">{es ? "Luna: NASA SVS / LRO" : "Moon: NASA SVS / LRO"}</div>
      {patch?.available && (
        <div className="overlay elev-legend">
          <div className="bar" />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <b>{es ? "Altura (m)" : "Height (m)"}</b>
            <span className="num">+{Math.round(patch.max_m)}</span><span className="num">0 = {es ? "sitio" : "site"}</span><span className="num">{Math.round(patch.min_m)}</span>
          </div>
        </div>
      )}
      <div className="overlay scale-bar">
        <div className="num" style={{ display: "flex", justifyContent: "space-between", width: 160 }}><span>0</span><span>1</span><span>2 km</span></div>
        <div className="ruler" style={{ width: 160 }} />
        <div className="mute" style={{ marginTop: 4 }}>{es ? "a la distancia del módulo" : "at the lander's distance"}</div>
      </div>
      <div className="overlay data-tag">
        <span className={"dot " + (patch?.available ? "ok" : "warn")} />
        {patch?.available ? `LOLA ${patch.resolution_m} m` : (es ? "sin relieve" : "no terrain")}{fine?.available ? ` + ${fine.resolution_m} m ${es ? "cerca (solo visual)" : "near (visual only)"}` : ""}
        {fps != null && <span className="mute"> · {fps.toFixed(1)} ms/{es ? "cuadro" : "frame"}{loadMs != null ? ` · ${es ? "carga" : "load"} ${loadMs} ms` : ""}</span>}
      </div>
      <div className="overlay lm-credit">{es ? "Módulo: modelo ilustrativo (NASA 3D Resources)" : "Lander: illustrative model (NASA 3D Resources)"}</div>
    </div>
  );
}

function line(pts, color, dashed) {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 120, gapSize: 90, transparent: true, opacity: 0.55, depthTest: false })
    : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
  const l = new THREE.Line(g, m); if (dashed) l.computeLineDistances(); l.renderOrder = 5; return l;
}

let _radial;
function radialTex() {
  if (_radial) return _radial;
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,220,150,.5)"); gr.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); _radial = new THREE.CanvasTexture(c); return _radial;
}
