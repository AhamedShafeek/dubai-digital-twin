/* Downtown landscape: Burj Khalifa Lake and pools as animated water, the Dubai Fountain (jets on the real OSM
 * layout of arcs and rings, with a choreographed show), the Fountain Boardwalk, footbridges and the enclosed
 * Metro Link, gardens, every mapped tree plus palms and lamp standards along the boulevards. */
(function () {
  'use strict';

  DT.MODEL_DEFS['downtown-landscape'] = {
    district: 'downtown',
    title: 'The Dubai Fountain',
    eyebrow: 'Detailed 3D model · Landmark',
    desc: 'The world\'s largest choreographed fountain: 275 m of arcs and rings in Burj Khalifa Lake, shooting water up to 150 m. Shows run every 30 minutes in the evening.',
    facts: [
      ['Length', '275 m'], ['Jet height', 'up to 150 m'], ['Lights', '6,600 lights and 25 colour projectors'],
      ['Designer', 'WET Design'], ['Opened', '2009'],
    ],
    height: 150,
    ground: 400,

    build(K, T, D, ctx) {
      const group = new T.Group();
      const env = D.env;
      const rng = K.rng(2009);
      const WATER_Y = 0.12;

      // ---------------------------------------------------------- water
      const normalTex = K.texture(K.canvas(512, 512, (c, w, h) => {
        // tileable ripple normal map from summed sine waves
        const img = c.createImageData(w, h), d = img.data;
        const waves = Array.from({ length: 9 }, (_, i) => ({ kx: Math.round(Math.cos(i * 2.4) * (2 + i)), ky: Math.round(Math.sin(i * 2.4) * (2 + i)), a: 1 / (1 + i * 0.6), p: i * 1.7 }));
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let gx = 0, gy = 0;
          waves.forEach((wv) => { const ph = (2 * Math.PI * (wv.kx * x + wv.ky * y)) / w + wv.p, c2 = Math.cos(ph) * wv.a; gx += c2 * wv.kx; gy += c2 * wv.ky; });
          const nx = -gx * 0.05, ny = -gy * 0.05, nz = 1, l = Math.hypot(nx, ny, nz), o = (y * w + x) * 4;
          d[o] = (nx / l * 0.5 + 0.5) * 255; d[o + 1] = (ny / l * 0.5 + 0.5) * 255; d[o + 2] = (nz / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
        }
        c.putImageData(img, 0, 0);
      }), { color: false, anisotropy: ctx.aniso });
      normalTex.repeat.set(1 / 18, 1 / 18);
      const water = new T.MeshStandardMaterial({ color: 0x2a7f96, roughness: 0.06, metalness: 0.15, normalMap: normalTex, normalScale: new T.Vector2(0.35, 0.35), envMapIntensity: 1.6, emissive: 0x05202c, emissiveIntensity: 0 });
      const waterG = [], kerbG = [];
      env.water.forEach((w) => w.polys.forEach((poly) => {
        const outer = K.ccw(K.dedupe(poly[0]));
        if (outer.length < 3 || K.area(outer) < 20) return;
        const holes = poly.slice(1).map((h2) => K.dedupe(h2));
        waterG.push(K.capPoly([outer, ...holes], WATER_Y, 1));
        if (K.area(outer) > 300) {
          // stone quay edge
          kerbG.push(K.prism(K.offsetRing(outer, 0.7), 0, 0.55, { cap: false, uScale: 3, vScale: 3 }).walls);
          kerbG.push(K.capPoly([K.offsetRing(outer, 0.7), outer.slice().reverse()], 0.55, 3));
        }
      }));
      const waterMesh = new T.Mesh(K.merge(waterG), water);
      waterMesh.userData.noShadow = true;
      group.add(waterMesh);
      const stoneMat = new T.MeshStandardMaterial({ color: 0xe2d8c4, roughness: 0.85 });
      if (kerbG.length) group.add(new T.Mesh(K.merge(kerbG), stoneMat));

      // ---------------------------------------------------------- the Dubai Fountain
      const fountain = env.fountains.find((f) => f.name === 'Dubai Fountain');
      const jets = [];
      if (fountain) {
        fountain.polys.forEach((poly, gi) => {
          const ring = K.dedupe(poly[0]), per = K.perimeter(ring), area = K.area(ring);
          const kind = area / per < 2.5 ? 'arc' : 'ring';
          const step = kind === 'arc' ? 3.2 : 2.6, n = Math.max(6, Math.floor(per / step));
          let acc = 0, k = 0;
          for (let i = 0; i < ring.length && k < n; i++) {
            const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
            while (acc + L >= k * (per / n) && k < n) {
              const t = (k * (per / n) - acc) / L;
              jets.push({ x: p[0] + (q[0] - p[0]) * t, z: p[1] + (q[1] - p[1]) * t, s: k / n, g: gi, kind, h: 0 });
              k++;
            }
            acc += L;
          }
          if (kind === 'ring') { const c = K.interiorPoint(ring).point; jets.push({ x: c[0], z: c[1], s: 0.5, g: gi, kind: 'centre', h: 0 }); }
        });
      }
      const jetAlpha = K.texture(K.canvas(64, 256, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.12, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,1)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        const r = K.rng(3);
        for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.35})`; c.fillRect(r() * w, r() * h, 2 + r() * 4, 6 + r() * 20); }
      }), { color: false, repeat: false });
      const jetGeo = new T.CylinderGeometry(1, 0.12, 1, 10, 1, true); jetGeo.translate(0, 0.5, 0);
      const mistGeo = new T.IcosahedronGeometry(1, 1);
      const jetMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.62, alphaMap: jetAlpha, depthWrite: false, emissive: 0xffffff, emissiveIntensity: 0.15, side: T.DoubleSide });
      const mistMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.22, depthWrite: false, emissive: 0xffffff, emissiveIntensity: 0.1 });
      const jetMesh = new T.InstancedMesh(jetGeo, jetMat, Math.max(1, jets.length));
      const mistMesh = new T.InstancedMesh(mistGeo, mistMat, Math.max(1, jets.length));
      [jetMesh, mistMesh].forEach((m) => { m.userData.noShadow = true; m.frustumCulled = false; group.add(m); });
      // jets move every frame: give raycasting a fixed bound that covers the tallest shot
      if (jets.length) {
        const cx = jets.reduce((a, j) => a + j.x, 0) / jets.length, cz = jets.reduce((a, j) => a + j.z, 0) / jets.length;
        jetMesh.boundingSphere = new T.Sphere(new T.Vector3(cx, 75, cz), 220);
      }
      const M4 = new T.Matrix4(), Q = new T.Quaternion(), Vp = new T.Vector3(), Vs = new T.Vector3();
      // A 120 s cycle: a 72 s show of eight movements, then the lake settles.
      const SHOW = 72, CYCLE = 120;
      const choreography = (j, t) => {
        if (t > SHOW) return 0;
        const m = Math.floor(t / 9), u = (t % 9) / 9, ramp = Math.min(1, u * 6, (1 - u) * 6);
        const wave = (k, sp) => 0.5 + 0.5 * Math.sin(2 * Math.PI * (j.s * k - t * sp));
        let h;
        switch (m) {
          case 0: h = j.kind === 'arc' ? 40 * wave(3, 0.5) : 8; break;                                   // rolling wave along the arcs
          case 1: h = j.kind === 'ring' ? 30 + 25 * wave(2, 0.8) : j.kind === 'centre' ? 70 : 12; break;   // rings swirl, centres rise
          case 2: h = (Math.floor(j.s * 40) % 2 === Math.floor(t * 2) % 2) ? 55 : 6; break;               // alternating staccato
          case 3: h = 25 + 60 * Math.max(0, Math.sin(Math.PI * (t * 0.9 - j.s * 4))) ** 6; break;          // chasing shooters
          case 4: h = j.kind === 'centre' ? 120 * ramp : 20 + 20 * wave(6, 1.2); break;
          case 5: h = 15 + 45 * wave(1, 0.25) * (j.kind === 'arc' ? 1 : 0.6); break;
          case 6: h = (t * 3 + j.g) % 4 < 1.2 ? 90 : 10; break;                                            // bursts by group
          default: h = 40 + 100 * u * (j.kind === 'arc' ? 1 : 0.8); break;                                  // finale to 140 m
        }
        return h * ramp;
      };

      // ---------------------------------------------------------- boardwalk, bridges, metro link
      const deckTex = K.texture(K.canvas(256, 256, (c, w, h) => {
        const r = K.rng(5);
        for (let y = 0; y < h; y += 16) { c.fillStyle = `rgb(${120 + r() * 30 | 0},${82 + r() * 20 | 0},${52 + r() * 15 | 0})`; c.fillRect(0, y, w, 14); c.fillStyle = '#3d2a1a'; c.fillRect(0, y + 14, w, 2); }
      }), { anisotropy: ctx.aniso });
      const deckMat = new T.MeshStandardMaterial({ map: deckTex, roughness: 0.8 });
      const steel = new T.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.35, metalness: 0.8 });
      const railGlass = new T.MeshStandardMaterial({ color: 0xa8cde0, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide });
      const tubeGlass = new T.MeshStandardMaterial({ color: 0x9fbfd2, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55, envMapIntensity: 1.4, side: T.DoubleSide, emissive: 0xfff0d8, emissiveIntensity: 0 });
      const deckG = [], railG = [], steelG = [], tubeG = [], parapetG = [];
      const posts = [];
      env.piers.forEach((p) => {
        if (!p.polys) return;
        p.polys.forEach((poly) => {
          const outer = K.ccw(K.dedupe(poly[0]));
          const s = K.prismPoly([outer], 0.9, 1.3, { uScale: 4, vScale: 4 });
          deckG.push(s.walls, s.cap);
          railG.push(K.prism(K.offsetRing(outer, -0.15), 1.3, 2.4, { cap: false, uScale: 4, vScale: 4 }).walls);
          steelG.push(K.prism(K.offsetRing(outer, -0.1), 2.35, 2.45, { cap: false, uScale: 4, vScale: 4 }).walls);
          for (let i = 0; i < outer.length; i++) posts.push([outer[i][0], 0.5, outer[i][1], 0, 0.3, 1, 0.3]);
        });
      });
      env.bridges.filter((b) => b.layer === 1).forEach((b) => b.polys.forEach((poly) => {
        const outer = K.ccw(K.dedupe(poly[0])), s = K.prismPoly([outer], 2.2, 3.2, { uScale: 4, vScale: 4 });
        deckG.push(s.cap); steelG.push(s.walls, K.capPoly([outer], 2.2, 4, true));
        parapetG.push(K.prism(K.offsetRing(outer, -0.1), 3.2, 4.3, { cap: false, uScale: 3, vScale: 3 }).walls);
      }));
      const pathWidth = 4.2;
      env.footbridges.forEach((fb) => {
        const pts = fb.pts, enclosed = /metro link/i.test(fb.name || ''), y = enclosed ? 8.5 : 6 + (fb.layer - 1) * 4;
        const W = enclosed ? 6.5 : pathWidth;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
          if (L < 0.5) continue;
          const nx = -dz / L * W / 2, nz = dx / L * W / 2;
          const quad = [[a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]];
          const s = K.prism(quad, y - 0.6, y, { uScale: 4, vScale: 4 });
          steelG.push(s.walls, K.capPoly([K.ccw(quad)], y - 0.6, 4, true)); deckG.push(s.cap);
          if (enclosed) {
            // glazed, air-conditioned tube with a curved roof
            tubeG.push(K.prism(quad, y, y + 3.6, { cap: false, uScale: 4, vScale: 4 }).walls);
            const roof = [];
            for (let k = 0; k <= 8; k++) { const ang = Math.PI * k / 8; roof.push([a, b].map((pp) => new T.Vector3(pp[0] + nx * Math.cos(ang), y + 3.6 + Math.sin(ang) * 1.6, pp[1] + nz * Math.cos(ang)))); }
            tubeG.push(K.gridSurface(roof));
            for (let s2 = 0; s2 < L; s2 += 4) {
              const x = a[0] + dx * s2 / L, z = a[1] + dz * s2 / L;
              const arch = []; for (let k = 0; k <= 8; k++) { const ang = Math.PI * k / 8; arch.push(new T.Vector3(x + nx * Math.cos(ang), y + 3.6 + Math.sin(ang) * 1.6, z + nz * Math.cos(ang))); }
              steelG.push(K.tube([new T.Vector3(x - nx, y, z - nz), ...arch, new T.Vector3(x + nx, y, z + nz)], 0.07, 12, 4));
            }
          } else {
            railG.push(K.wall([a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], y, y + 1.1), K.wall([b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz], y, y + 1.1));
          }
          for (let s2 = 0; s2 < L; s2 += 26) posts.push([a[0] + dx * s2 / L, (y - 0.6) / 2, a[1] + dz * s2 / L, Math.atan2(-dz, dx), 1.1, y - 0.6, 1.1]);
        }
      });
      const addMesh = (geoms, mat, noShadow = false) => { const g = K.merge(geoms); if (!g) return null; const m = new T.Mesh(g, mat); if (noShadow) m.userData.noShadow = true; group.add(m); return m; };
      addMesh(deckG, deckMat); addMesh(steelG, steel); addMesh(railG, railGlass, true); addMesh(tubeG, tubeGlass, true);
      addMesh(parapetG, stoneMat);
      const unit = new T.BoxGeometry(1, 1, 1);
      const postMesh = K.instances(unit, new T.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.8 }), posts);
      if (postMesh) group.add(postMesh);

      // ---------------------------------------------------------- gardens
      const grassTex = K.texture(K.canvas(256, 256, (c, w, h) => {
        c.fillStyle = '#6f9f45'; c.fillRect(0, 0, w, h);
        const r = K.rng(8);
        for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${60 + r() * 50 | 0},${120 + r() * 60 | 0},${40 + r() * 25 | 0},0.5)`; c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
      }), { anisotropy: ctx.aniso });
      grassTex.repeat.set(1 / 6, 1 / 6);
      const grassMat = new T.MeshStandardMaterial({ map: grassTex, roughness: 0.95 });
      const gardenG = [], edgeG = [];
      env.gardens.forEach((g) => g.polys.forEach((poly) => {
        const outer = K.ccw(K.dedupe(poly[0]));
        if (outer.length < 3 || K.area(outer) < 8) return;
        gardenG.push(K.capPoly([outer, ...poly.slice(1).map((h2) => K.dedupe(h2))], 0.28, 1));
        edgeG.push(K.prism(outer, 0, 0.32, { cap: false, uScale: 2, vScale: 2 }).walls);
      }));
      const gardenMesh = addMesh(gardenG, grassMat, true);
      const gardenEdge = addMesh(edgeG, stoneMat, true);

      // ---------------------------------------------------------- trees and palms
      const boxed = (r) => { let a = Infinity, b2 = Infinity, c = -Infinity, d = -Infinity; r.forEach(([x, z]) => { a = Math.min(a, x); c = Math.max(c, x); b2 = Math.min(b2, z); d = Math.max(d, z); }); return { r, a, b: b2, c, d }; };
      const buildingRings = D.buildings.filter((b) => !b.container).map((b) => boxed(b.polys[0][0]));
      const lakeRing = env.water.find((w) => w.name === 'Burj Khalifa Lake')?.polys[0][0];
      // 40 m grid index over building footprints so placement tests stay local
      const CELL = 40, grid = new Map(), key = (i, j) => i * 100003 + j;
      buildingRings.forEach((o) => {
        for (let i = Math.floor(o.a / CELL); i <= Math.floor(o.c / CELL); i++) for (let j = Math.floor(o.b / CELL); j <= Math.floor(o.d / CELL); j++) {
          const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
        }
      });
      const lakeBox = lakeRing ? boxed(lakeRing) : null;
      const blocked = (x, z) => (grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []).some((o) => x >= o.a && x <= o.c && z >= o.b && z <= o.d && K.pointInRing([x, z], o.r))
        || (lakeBox && x >= lakeBox.a && x <= lakeBox.c && z >= lakeBox.b && z <= lakeBox.d && K.pointInRing([x, z], lakeRing));
      const palms = [], broad = [];
      env.trees.forEach(([x, z, leaf]) => (leaf ? broad : palms).push([x, z]));
      env.treeRows.forEach((row) => {
        for (let i = 0; i < row.length - 1; i++) {
          const a = row[i], b = row[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let s = 0; s < L; s += 9) palms.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]);
        }
      });
      // boulevard planting and lamp standards along the main streets
      const lamps = [];
      const lampGrid = new Set(), palmGrid = new Set();
      const free = (set, x, z, cell) => { const k = `${Math.round(x / cell)}:${Math.round(z / cell)}`; if (set.has(k)) return false; set.add(k); return true; };
      D.streets.forEach((s) => {
        const blvd = /boulevard/i.test(s.name || ''), main = ['primary', 'secondary', 'tertiary', 'trunk'].includes(s.cls);
        if (!blvd && !main) return;
        const pts = s.pts, off = s.width / 2 + 2.2;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
          if (L < 0.1) continue;
          const nx = -dz / L, nz = dx / L;
          for (let d = 0; d < L; d += 4) {
            const x = a[0] + dx * d / L, z = a[1] + dz * d / L, k = Math.round((d + i * 1000) / 4);
            [-1, 1].forEach((side) => {
              const px = x + nx * off * side, pz = z + nz * off * side;
              if (s.bridge || s.tunnel || blocked(px, pz)) return;
              if (k % 7 === 0 && free(lampGrid, px, pz, 14)) lamps.push([px, pz, Math.atan2(nx * -side, nz * -side)]);
              else if (blvd && k % 3 === 1 && free(palmGrid, px, pz, 7)) palms.push([px, pz]);
            });
          }
        }
      });
      const palmGeo = K.palmLite();
      const trunkMat = new T.MeshStandardMaterial({ color: 0x8b7152, roughness: 0.95 });
      const frondMat = new T.MeshStandardMaterial({ color: 0x4a7230, roughness: 0.75, side: T.DoubleSide });
      const palmRows = palms.filter(([x, z]) => !lakeRing || !K.pointInRing([x, z], lakeRing)).map(([x, z]) => [x, 0.25, z, rng() * 6.3, 0.85 + rng() * 0.5]);
      const trunks = K.instances(palmGeo.trunk, trunkMat, palmRows.map(([x, y, z, r, s]) => [x, y, z, r, s, s, s]));
      const crowns = K.instances(palmGeo.fronds, frondMat, palmRows.map(([x, y, z, r, s]) => [x, y, z, r, s, s, s]));
      [trunks, crowns].forEach((m) => m && group.add(m));
      const broadGeo = (() => {
        const t = new T.CylinderGeometry(0.14, 0.24, 3.4, 6); t.translate(0, 1.7, 0);
        const r = K.rng(31), blobs = [];
        for (let k = 0; k < 7; k++) {
          const g = new T.IcosahedronGeometry(1.1 + r() * 0.7, 0);
          const p = g.getAttribute('position');
          for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + r() * 0.3), p.getY(i) * (0.75 + r() * 0.3), p.getZ(i) * (0.85 + r() * 0.3));
          const a = r() * Math.PI * 2, d = k ? 0.9 + r() * 0.8 : 0;
          g.translate(Math.cos(a) * d, 4.2 + r() * 1.4, Math.sin(a) * d);
          blobs.push(g);
        }
        const canopy = K.merge(blobs); canopy.computeVertexNormals();
        return { trunk: t, canopy };
      })();
      const broadRows = broad.map(([x, z]) => { const s = 0.75 + rng() * 0.5; return [x, 0.25, z, rng() * 6.3, s, s, s]; });
      const leafMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
      const bt = K.instances(broadGeo.trunk, trunkMat, broadRows), bc = K.instances(broadGeo.canopy, leafMat, broadRows);
      if (bc) { const cc = new T.Color(); broadRows.forEach((_, i) => bc.setColorAt(i, cc.setHSL(0.25 + rng() * 0.05, 0.42 + rng() * 0.15, 0.15 + rng() * 0.07))); bc.instanceColor.needsUpdate = true; }
      [bt, bc].forEach((m) => m && group.add(m));

      // lamp standards: tapered pole, twin arms, lantern heads that glow at night
      const lampPole = (() => { const g = new T.CylinderGeometry(0.09, 0.16, 9, 8); g.translate(0, 4.5, 0); const arm = new T.BoxGeometry(2.6, 0.12, 0.12); arm.translate(0, 8.6, 0); return K.merge([g, arm]); })();
      const lampHead = (() => { const a = new T.BoxGeometry(0.7, 0.22, 0.4); a.translate(-1.2, 8.45, 0); const b = new T.BoxGeometry(0.7, 0.22, 0.4); b.translate(1.2, 8.45, 0); return K.merge([a, b]); })();
      const lampMat = new T.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.6 });
      const headMat = new T.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.4, emissive: 0xffd8a0, emissiveIntensity: 0 });
      const lampRows = lamps.map(([x, z, r]) => [x, 0, z, r, 1, 1, 1]);
      const lp = K.instances(lampPole, lampMat, lampRows), lh = K.instances(lampHead, headMat, lampRows, { shadow: false });
      [lp, lh].forEach((m) => m && group.add(m));
      console.log(`[twin] downtown landscape: ${jets.length} fountain jets, ${palmRows.length} palms, ${broadRows.length} trees, ${lamps.length} lamps`);

      const fc = fountain ? K.interiorPoint(fountain.polys[4]?.[0] || fountain.polys[0][0]).point : [0, 0];
      // invisible click volume over the fountain's arcs and rings (the jets themselves are too thin to hit)
      const hitG = fountain ? fountain.polys.map((poly) => K.prism(K.offsetRing(K.dedupe(poly[0]), 3), 0, 30, { uScale: 10, vScale: 10 })).flatMap((p) => [p.walls, p.cap]) : [];
      const hit = hitG.length ? new T.Mesh(K.merge(hitG), new T.MeshBasicMaterial()) : null;
      if (hit) { hit.visible = false; group.add(hit); }
      return {
        group,
        pickables: hit ? [jetMesh, hit] : [jetMesh],
        center: fc,
        setTheme(theme) {
          const night = theme === 'night', dusk = theme === 'dusk';
          // the aerial photo already shows the real planting in Realistic mode
          [gardenMesh, gardenEdge].forEach((m) => { if (m) m.visible = theme !== 'satellite'; });
          water.color.set(night ? 0x0c2f3d : dusk ? 0x2c5a6e : 0x2a7f96);
          water.emissiveIntensity = night ? 1 : 0;
          headMat.emissiveIntensity = night ? 2.2 : dusk ? 0.6 : 0;
          tubeGlass.emissiveIntensity = night ? 0.5 : 0;
          jetMat.emissive.set(night ? 0xfff2d6 : 0xffffff);
          jetMat.emissiveIntensity = night ? 1.4 : dusk ? 0.5 : 0.15;
          mistMat.emissiveIntensity = night ? 0.8 : 0.1;
        },
        animate(t) {
          normalTex.offset.set((t * 0.004) % 1, (t * 0.0027) % 1);
          const tc = t % CYCLE;
          for (let i = 0; i < jets.length; i++) {
            const j = jets[i];
            const target = choreography(j, tc);
            j.h += (target - j.h) * 0.12;             // water has inertia: heights ease towards the score
            const h = Math.max(0.01, j.h), w = 0.18 + h * 0.011;
            M4.compose(Vp.set(j.x, WATER_Y, j.z), Q, Vs.set(w, h, w));
            jetMesh.setMatrixAt(i, M4);
            const m = h > 2 ? 0.9 + h * 0.045 : 0.01;
            M4.compose(Vp.set(j.x, WATER_Y + h * 0.96, j.z), Q, Vs.set(m, m * 0.7, m));
            mistMesh.setMatrixAt(i, M4);
          }
          jetMesh.instanceMatrix.needsUpdate = true;
          mistMesh.instanceMatrix.needsUpdate = true;
          return true;
        },
      };
    },
  };
})();
