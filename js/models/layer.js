/* MapLibre custom 3D layer that renders the detailed models with three.js in the map's WebGL context.
 *
 * Scenes: every model def with `district: '<name>'` is built into that district's shared scene (one sun, one
 * shadow map, so towers shade each other); any other def with data in D.landmarkModels gets its own scene.
 * Local frame everywhere: metres, x east, y up, z south, origin at the scene origin. */
(function () {
  'use strict';

  const K = DT.kit;
  // Sun per map theme: compass azimuth and elevation in degrees.
  const LIGHT = {
    day: { az: 150, el: 57, color: 0xfff1de, sun: 3.1, sky: 0xd4e6ff, ground: 0xd8c6a3, hemi: 1.05, env: 1, shadow: 0.34, exposure: 1 },
    dusk: { az: 252, el: 11, color: 0xffad66, sun: 2.7, sky: 0x8d8fc4, ground: 0xc58e66, hemi: 0.75, env: 0.85, shadow: 0.4, exposure: 1.05 },
    night: { az: 70, el: 38, color: 0x9db0ff, sun: 0.32, sky: 0x26365c, ground: 0x10141e, hemi: 0.4, env: 0.45, shadow: 0, exposure: 1 },
  };
  // Realistic (aerial imagery) mode: warm late-morning sun from the south-east, like the reference photogrammetry
  LIGHT.satellite = { az: 128, el: 46, color: 0xffeccf, sun: 3.0, sky: 0xbcd3ec, ground: 0xc9b088, hemi: 0.55, env: 0.7, shadow: 0.5, exposure: 0.96 };

  const EARTH_CIRC = 2 * Math.PI * 6371008.8;
  const mercX = (lon) => (180 + lon) / 360;
  const mercY = (lat) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
  // lon/lat -> local metres around `origin` (identical maths to scripts/build-data.mjs)
  const toLocal = ([lon, lat], [lon0, lat0]) => {
    const k = EARTH_CIRC * Math.cos((lat0 * Math.PI) / 180);
    return [(mercX(lon) - mercX(lon0)) * k, (mercY(lat) - mercY(lat0)) * k];
  };
  const toLonLat = ([x, z], [lon0, lat0]) => {
    const k = EARTH_CIRC * Math.cos((lat0 * Math.PI) / 180), my = mercY(lat0) + z / k;
    return [lon0 + (x / k) * 360, (360 / Math.PI) * Math.atan(Math.exp(((180 - my * 360) * Math.PI) / 180)) - 90];
  };

  DT.createLandmarkModels = async function (map, D, opts) {
    const T = await K.whenReady();
    await K.fontsReady();
    const state = { theme: opts.theme, enabled: opts.enabled !== false };
    const camera = new T.Camera();
    const P = new T.Matrix4(), M = new T.Matrix4(), inv = new T.Matrix4(), v4 = new T.Vector4(), frustum = new T.Frustum();
    const raycaster = new T.Raycaster();
    let renderer, pmrem, envRT = null;

    // ------------------------------------------------------------------ which scenes exist
    const specs = [];
    const districts = {};
    for (const [key, def] of Object.entries(DT.MODEL_DEFS)) {
      if (def.district) {
        const dd = D[def.district];
        if (!dd) continue;
        if (!districts[def.district]) {
          districts[def.district] = { key: def.district, origin: dd.origin, members: [], district: dd };
          specs.push(districts[def.district]);
        }
        districts[def.district].members.push({ key, def, data: D.landmarkModels?.[key] || dd });
      } else if (D.landmarkModels?.[key]) {
        specs.push({ key, origin: D.landmarkModels[key].origin, members: [{ key, def, data: D.landmarkModels[key] }] });
      }
    }

    const placement = (origin) => {
      const mc = maplibregl.MercatorCoordinate.fromLngLat(origin, 0);
      const s = mc.meterInMercatorCoordinateUnits();
      // local (x east, y up, z south) metres -> mercator (x east, y south, z up)
      return new T.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new T.Vector3(s, -s, s)).multiply(new T.Matrix4().makeRotationX(Math.PI / 2));
    };
    const sunDirection = (L) => {
      const az = L.az * Math.PI / 180, el = L.el * Math.PI / 180;
      return new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    };

    function buildScene(spec) {
      const scene = new T.Scene();
      const sun = new T.DirectionalLight(0xffffff, 3);
      sun.castShadow = true;
      sun.shadow.autoUpdate = false;
      const small = window.innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory < 4);
      const mapSize = Math.min(small ? 2048 : 4096, renderer.capabilities.maxTextureSize, Math.max(...spec.members.map((m) => m.def.shadow?.mapSize || 2048)));
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.6;
      const hemi = new T.HemisphereLight(0xffffff, 0x888888, 1);
      scene.add(sun, sun.target, hemi);

      // Aerial imagery atlases for district roofs: z18 (~0.5 m/px) over the core, z17 (~1 m/px) over the rest.
      let ortho = [];
      if (spec.district && DT.orthoAtlas) {
        const small = window.innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory < 4) || renderer.capabilities.maxTextureSize < 8192;
        const ex = spec.district.extent, mid = ex ? [(ex[0][0] + ex[2][0]) / 2, (ex[0][1] + ex[2][1]) / 2] : [0, 0];
        if (!small) ortho.push(DT.orthoAtlas(T, { origin: spec.origin, centre: [270, 260], zoom: 18, size: 4096, onProgress: () => map.triggerRepaint() }));
        ortho.push(DT.orthoAtlas(T, { origin: spec.origin, centre: mid, zoom: 17, size: small ? 2048 : 4096, onProgress: () => map.triggerRepaint() }));
        Promise.all(ortho.map((a) => a.ready)).then((r) => console.log('[twin] aerial roof imagery loaded', r));
      }
      // Signature models first so they can claim OSM buildings; the district fabric builds last and skips them.
      const members = spec.members.slice().sort((a, b) => (a.def.fabric ? 1 : 0) - (b.def.fabric ? 1 : 0));
      const replaced = new Set();
      const built = [];
      for (const m of members) {
        const offset = m.data.origin ? toLocal(m.data.origin, spec.origin) : [0, 0];
        const ctx = {
          aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()), replaced, district: spec.district || null, ortho,
          offset, toLonLat: (x, z) => toLonLat([x, z], spec.origin), toLocal: (ll) => toLocal(ll, spec.origin),
          building: (id) => spec.district?.buildings.find((b) => b.id === id) || null,
        };
        let b;
        const tb = performance.now();
        try { b = m.def.build(K, T, m.data, ctx); } catch (err) { console.error(`[twin] model ${m.key} failed`, err); continue; }
        if (performance.now() - tb > 150) console.log(`[twin]   ${m.key}: ${Math.round(performance.now() - tb)} ms`);
        const claims = typeof m.def.replaces === 'function' ? m.def.replaces(m.data) : m.def.replaces || [];
        claims.forEach((id) => replaced.add(id));
        b.group.position.set(offset[0], 0, offset[1]);
        b.group.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = true; } });
        scene.add(b.group);
        built.push({ key: m.key, def: m.def, data: m.data, built: b, offset, own: !!D.landmarkModels?.[m.key] });
      }

      const box = new T.Box3().setFromObject(scene);
      const sphere = box.getBoundingSphere(new T.Sphere());
      const ground = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShadowMaterial({ opacity: 0.3, transparent: true, depthWrite: false }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0.15;
      ground.receiveShadow = true;
      ground.userData.noShadow = true;
      scene.add(ground);
      const hidden = spec.district ? spec.district.buildings.map((b) => b.tile) : [];
      built.forEach((b) => hidden.push(...(b.data.hide || []), ...(b.built.hide || [])));
      return {
        key: spec.key, origin: spec.origin, isDistrict: !!spec.district, scene, sun, hemi, ground, built, sphere,
        height: box.max.y, L: placement(spec.origin), lastM: null, eye: new T.Vector3(), focus: null, hidden,
      };
    }

    // Shadow frustum: whole model for single scenes; for districts, fitted around the current view so
    // shadows stay crisp when zoomed in (recomputed when the camera settles).
    function fitShadow(s, L) {
      const dir = sunDirection(L);
      let cx = s.sphere.center.x, cz = s.sphere.center.z, size = Math.max(s.sphere.radius * 2.1, 200);
      if (s.isDistrict) {
        const c = map.getCenter();
        const [x, z] = toLocal([c.lng, c.lat], s.origin);
        const mpp = (EARTH_CIRC * Math.cos(c.lat * Math.PI / 180)) / (512 * 2 ** map.getZoom());
        const canvas = map.getCanvas();
        size = Math.min(s.sphere.radius * 2.1, Math.max(300, mpp * Math.hypot(canvas.clientWidth, canvas.clientHeight) * (1 + map.getPitch() / 30)));
        cx = Math.max(s.sphere.center.x - s.sphere.radius, Math.min(s.sphere.center.x + s.sphere.radius, x));
        cz = Math.max(s.sphere.center.z - s.sphere.radius, Math.min(s.sphere.center.z + s.sphere.radius, z));
      }
      const h = s.height;
      s.sun.target.position.set(cx, Math.min(h * 0.3, 120), cz);
      s.sun.position.copy(s.sun.target.position).addScaledVector(dir, 3000);
      const cam = s.sun.shadow.camera;
      cam.left = cam.bottom = -size / 2; cam.right = cam.top = size / 2;
      cam.near = 10;
      cam.far = 3000 + Math.min(16000, h / Math.tan(Math.max(L.el, 4) * Math.PI / 180) + size);
      cam.updateProjectionMatrix();
      s.sun.shadow.needsUpdate = true;
      const reach = Math.min(16000, Math.max(...s.built.map((b) => b.def.ground || 600), 2.4 * h / Math.tan(Math.max(L.el, 4) * Math.PI / 180)));
      s.ground.scale.set(reach * 2 + s.sphere.radius * 2, reach * 2 + s.sphere.radius * 2, 1);
      s.ground.position.x = s.sphere.center.x; s.ground.position.z = s.sphere.center.z;
    }

    function applyLighting() {
      const L = LIGHT[state.theme] || LIGHT.day;
      const dir = sunDirection(L);
      const sky = new T.CanvasTexture(K.sky(state.theme, dir));
      sky.mapping = T.EquirectangularReflectionMapping;
      sky.colorSpace = T.SRGBColorSpace;
      const nextRT = pmrem.fromEquirectangular(sky);
      sky.dispose();
      if (envRT) envRT.dispose();
      envRT = nextRT;
      renderer.toneMappingExposure = L.exposure;
      for (const s of scenes) {
        s.sun.color.set(L.color);
        s.sun.intensity = L.sun;
        s.sun.castShadow = L.shadow > 0;
        fitShadow(s, L);
        s.ground.material.opacity = L.shadow;
        s.ground.visible = L.shadow > 0;
        s.hemi.color.set(L.sky); s.hemi.groundColor.set(L.ground); s.hemi.intensity = L.hemi;
        s.scene.environment = envRT.texture;
        s.scene.environmentIntensity = L.env;
        s.built.forEach((b) => b.built.setTheme && b.built.setTheme(state.theme));
      }
    }

    const scenes = [];
    const layer = {
      id: 'landmark-models',
      type: 'custom',
      renderingMode: '3d',
      onAdd(_map, gl) {
        renderer = new T.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        pmrem = new T.PMREMGenerator(renderer);
        const t0 = performance.now();
        specs.forEach((spec) => scenes.push(buildScene(spec)));
        let tris = 0, instTris = 0, bytes = 0;
        scenes.forEach((sc) => sc.scene.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry, n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
          if (o.isInstancedMesh) instTris += n * o.count; else tris += n;
          Object.values(g.attributes).forEach((a) => { bytes += a.array.byteLength; });
        }));
        console.log(`[twin] 3D models built in ${Math.round(performance.now() - t0)} ms: ${(tris / 1e6).toFixed(2)}M triangles + ${(instTris / 1e6).toFixed(2)}M instanced, ${(bytes / 1048576).toFixed(0)} MB of vertex data`);
        applyLighting();
      },
      render(gl, args) {
        if (!state.enabled) return;
        const matrix = args && args.defaultProjectionData ? args.defaultProjectionData.mainMatrix : (args && args.modelViewProjectionMatrix) || args;
        P.fromArray(matrix);
        renderer.resetState();
        renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        const t = performance.now() / 1000;
        let animating = false;
        for (const s of scenes) {
          M.multiplyMatrices(P, s.L);
          frustum.setFromProjectionMatrix(M);
          if (!frustum.intersectsSphere(s.sphere)) { s.lastM = null; continue; }
          // Recover the eye position in model metres so lighting, specular and reflections are physically placed.
          inv.copy(M).invert();
          v4.set(0, 0, 1, 0).applyMatrix4(inv);
          camera.position.set(v4.x / v4.w, v4.y / v4.w, v4.z / v4.w);
          camera.updateMatrixWorld(true);
          camera.projectionMatrix.multiplyMatrices(M, camera.matrixWorld);
          camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
          s.lastM = M.clone();
          s.eye.copy(camera.position);
          for (const b of s.built) if (b.built.animate && b.built.animate(t, state.theme, s.eye)) animating = true;
          renderer.render(s.scene, camera);
        }
        if (animating) map.triggerRepaint();
      },
    };
    map.addLayer(layer, opts.beforeId);
    map.on('moveend', () => {
      const L = LIGHT[state.theme] || LIGHT.day;
      scenes.filter((s) => s.isDistrict).forEach((s) => fitShadow(s, L));
      map.triggerRepaint();
    });

    return {
      // Tile feature ids are osmId * 10 + a type digit that differs between OpenFreeMap builds, so every variant
      // of each replaced building is hidden.
      get hiddenIds() {
        const out = new Set();
        scenes.forEach((s) => s.hidden.forEach((id) => { const base = Math.floor(id / 10) * 10; for (let k = 0; k < 4; k++) out.add(base + k); }));
        return [...out];
      },
      setTheme(theme) { state.theme = theme; if (renderer) applyLighting(); map.triggerRepaint(); },
      setEnabled(on) { state.enabled = on; map.triggerRepaint(); },
      // Ray-pick the models under a screen point (CSS pixels); returns what was hit, nearest first.
      pick(point) {
        if (!state.enabled) return null;
        const canvas = map.getCanvas();
        const ndcX = (point.x / canvas.clientWidth) * 2 - 1, ndcY = 1 - (point.y / canvas.clientHeight) * 2;
        let best = null;
        for (const s of scenes) {
          if (!s.lastM) continue;
          const far = new T.Vector4(ndcX, ndcY, 1, 1).applyMatrix4(inv.copy(s.lastM).invert());
          const dir = new T.Vector3(far.x / far.w, far.y / far.w, far.z / far.w).sub(s.eye).normalize();
          raycaster.set(s.eye, dir);
          for (const b of s.built) {
            const hit = raycaster.intersectObjects(b.built.pickables || [], false)[0];
            if (hit && (!best || hit.distance < best.distance)) best = { distance: hit.distance, s, b, hit };
          }
        }
        if (!best) return null;
        const { s, b, hit } = best;
        const info = b.built.pick ? b.built.pick(hit) : null;
        const local = info?.local || b.built.center || null;
        let origin;
        if (local) origin = toLonLat([local[0] + b.offset[0], local[1] + b.offset[1]], s.origin);
        else if (b.own) origin = b.data.origin;
        else origin = toLonLat([hit.point.x, hit.point.z], s.origin);
        return { key: b.key, def: b.def, origin, height: info?.height || (b.def.height ?? s.height), info };
      },
    };
  };
})();
