import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getJSON } from "./api.js";

// Escena 3D con Three.js: el terreno real (parche del DEM que manda el backend),
// el módulo con su mástil en el centro, el Sol como luz direccional puesta en su
// azimut/elevación real de la hora elegida, y la Tierra como esfera en el cielo.
// Las sombras sobre el relieve salen de la posición real del Sol: no hay nada
// inventado acá, solo se dibuja lo que el motor calculó.
// Sin DEM se muestra un plano liso y un cartel que lo dice.

const SKY_R = 60000;   // radio de la "cúpula" donde ponemos Sol y Tierra (m, solo visual)

function dirFrom(azDeg, elDeg) {
  // azimut desde el norte hacia el este; en Three usamos x = este, y = arriba, z = -norte
  const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
}

export default function Scene3D({ result, hour, t, lang }) {
  const mount = useRef();
  const refs = useRef({});
  const [patch, setPatch] = useState(null);
  const [err, setErr] = useState(null);
  const es = lang === "es";
  const siteKey = result ? `${result.site.lat},${result.site.lon}` : "";

  // 1) pedir el parche de terreno al backend cuando cambia el sitio
  useEffect(() => {
    if (!result) return;
    setPatch(null); setErr(null);
    getJSON(`/api/terrain?lat=${result.site.lat}&lon=${result.site.lon}&half_size_m=12000&n=97`).then(setPatch).catch((e) => setErr(String(e.message || e)));
  }, [siteKey]); // eslint-disable-line

  // 2) armar la escena una vez que hay parche (o aviso de que no hay DEM)
  useEffect(() => {
    if (!patch || !mount.current) return;
    const el = mount.current;
    const W = el.clientWidth, H = Math.max(320, Math.round(W * 0.55));
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.innerHTML = ""; el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02040a);
    // la cámara arranca por encima del punto más alto del parche: si no, queda enterrada
    const hMax = patch.available ? Math.max(...patch.heights_m.flat()) : 0;
    const camera = new THREE.PerspectiveCamera(50, W / H, 1, SKY_R * 3);
    camera.position.set(4000, hMax + 2500, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0); controls.maxDistance = 30000; controls.minDistance = 20; controls.enableDamping = true;

    // terreno: grilla de alturas → PlaneGeometry; x = este, z = -norte, y = altura
    const n = patch.n, size = patch.half_size_m * 2;
    const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      // PlaneGeometry recorre filas de +z a -z después de rotar; fila 0 = norte (−z en nuestro marco)
      const idx = i * n + j;
      const h = patch.available ? patch.heights_m[n - 1 - i][j] : 0;
      pos.setY(idx, h);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8d8f94, roughness: 0.95, metalness: 0.0, flatShading: false });
    const terrain = new THREE.Mesh(geo, mat); terrain.receiveShadow = true; terrain.castShadow = true;
    scene.add(terrain);

    // módulo: caja + mástil + panel, a la altura del mástil del escenario
    const lander = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), new THREE.MeshStandardMaterial({ color: 0xe9eef7 }));
    body.position.y = 1.5; body.castShadow = true; lander.add(body);
    const mastH = result.spec.mast_m || 2;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, mastH, 8), new THREE.MeshStandardMaterial({ color: 0x9aa7bd }));
    mast.position.y = 2.5 + mastH / 2; lander.add(mast);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x3f8cff, emissive: 0x0a1a40 }));
    panel.position.y = 2.5 + mastH; panel.castShadow = true; lander.add(panel);
    scene.add(lander);

    // luces: Sol direccional con sombras + un poco de ambiente (la Tierra ilumina algo)
    const sun = new THREE.DirectionalLight(0xfff2d0, 2.4); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -size / 2; sc.right = sc.top = size / 2; sc.near = 1; sc.far = SKY_R * 2.5;
    scene.add(sun); scene.add(sun.target);
    // luz de relleno fija: en la Luna no existe, pero sin ella de noche no se ve nada.
    // Es solo para que el relieve sea legible; las sombras duras siguen siendo del Sol real.
    scene.add(new THREE.HemisphereLight(0x8899bb, 0x222733, 0.9));
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 0.0047, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
    scene.add(sunBall);
    const earthBall = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 0.0165, 32, 32), new THREE.MeshStandardMaterial({ color: 0x3f8cff, emissive: 0x1a3f80, emissiveIntensity: 0.6 }));
    scene.add(earthBall);

    // estrellas
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(SKY_R * 2); if (v.y < 0) v.y = -v.y; sp.set([v.x, v.y, v.z], i * 3); }
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 120 })));

    // brújula
    const axes = new THREE.Group();
    const mk = (txt, x, z, color) => { const s = new THREE.Mesh(new THREE.SphereGeometry(60, 8, 8), new THREE.MeshBasicMaterial({ color })); s.position.set(x, 50, z); axes.add(s); };
    mk("N", 0, -size / 2 * 0.95, 0xff5f57); mk("E", size / 2 * 0.95, 0, 0x37d37f); scene.add(axes);

    let raf; const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); }; loop();
    refs.current = { renderer, scene, camera, sun, sunBall, earthBall, controls, lander };
    const onResize = () => { const w = el.clientWidth, h = Math.max(320, Math.round(w * 0.55)); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); renderer.dispose(); controls.dispose(); el.innerHTML = ""; refs.current = {}; };
  }, [patch]); // eslint-disable-line

  // 3) mover Sol y Tierra a la hora elegida (datos del motor)
  useEffect(() => {
    const r = refs.current; if (!r.sun || !result) return;
    const s = result.series, i = Math.min(hour, s.time.length - 1);
    const dS = dirFrom(s.sun_az[i], s.sun_el[i]), dE = dirFrom(s.earth_az[i], s.earth_el[i]);
    r.sun.position.copy(dS.clone().multiplyScalar(SKY_R)); r.sun.target.position.set(0, 0, 0);
    // la luz del Sol escala con la fracción de disco visible que calculó el motor
    r.sun.intensity = 0.1 + 2.6 * s.sun_fraction[i];
    r.sunBall.position.copy(dS.clone().multiplyScalar(SKY_R * 1.4));
    r.earthBall.position.copy(dE.clone().multiplyScalar(SKY_R * 1.4));
    r.earthBall.visible = s.earth_el[i] > -8;
  }, [hour, result, patch]);

  if (!result) return null;
  const i = Math.min(hour, result.series.time.length - 1);
  return (
    <div className="panel">
      <h2>{es ? "Escena 3D (Three.js)" : "3D scene (Three.js)"}
        <span className="right small num">{result.series.time[i].replace("T", " ").slice(0, 16)} UTC · ☉ {result.series.sun_el[i].toFixed(2)}° · ⊕ {result.series.earth_el[i].toFixed(2)}°</span></h2>
      {err && <div className="errbox">{err}</div>}
      {patch && !patch.available && <div className="warnbox" style={{ marginBottom: 8 }}>{es ? "Sin relieve LOLA para este sitio: se muestra un plano liso." : "No LOLA terrain for this site: showing a flat plane."}</div>}
      <div ref={mount} style={{ width: "100%", borderRadius: 10, overflow: "hidden", minHeight: 320, background: "#02040a" }} />
      <p className="small mute" style={{ marginTop: 6 }}>
        {es ? `Terreno real del DEM ${patch?.dem || ""} (${patch?.resolution_m || "—"} m/px), parche de ${patch ? patch.half_size_m / 500 : "—"} km de lado, sin exagerar alturas. El Sol y la Tierra están donde el motor dice para esa hora; las sombras salen de ahí. Arrastrá para girar, rueda para acercar.`
          : `Real terrain from DEM ${patch?.dem || ""} (${patch?.resolution_m || "—"} m/px), ${patch ? patch.half_size_m / 500 : "—"} km patch, no vertical exaggeration. Sun and Earth sit where the engine says for that hour; shadows follow. Drag to orbit, wheel to zoom.`}
      </p>
    </div>
  );
}
