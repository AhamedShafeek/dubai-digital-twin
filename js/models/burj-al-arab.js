/* Burj Al Arab: V-shaped plan fitted to the OpenStreetMap footprint (spine at the sharp corner, sail on the arc).
 * Elevation profiles (arch truss, sail, roof, helipad, mast) are measured from a side photograph and scaled to
 * the published heights: roof ~206 m, helipad 210 m, arch/spine junction ~276 m, mast tip 321 m.
 * Canonical frame while building: spine at the origin, +X forward along the V's bisector towards the sail. */
(function () {
  'use strict';

  DT.MODEL_DEFS['burj-al-arab'] = {
    title: 'Burj Al Arab',
    eyebrow: 'Detailed 3D model · Hotel',
    desc: 'A dhow\'s sail on its own island: two wings in a V around a 180 m atrium, closed by a double-skin fabric sail and braced by a white steel exoskeleton.',
    facts: [
      ['Height', '321 m (mast tip)'],
      ['Floors', '56, top floor at 197.5 m'],
      ['Atrium', '180 m tall'],
      ['Sail', '12 tensioned PTFE-coated glass-fibre panels, ~15,000 m², ~200 m high'],
      ['Helipad', 'Inverted steel cone at 210 m'],
      ['Al Muntaha', 'Restaurant cantilevered 27 m from the mast'],
      ['Island', 'Reclaimed, ~280 m offshore of Jumeirah Beach'],
      ['Architect', 'Tom Wright, WS Atkins'],
      ['Opened', '1 December 1999'],
    ],
    shadow: { mapSize: 4096 },
    ground: 1800,

    build(K, T, data, ctx) {
      const group = new T.Group();
      const [d1, d2] = data.wings;
      const bis = [d1[0] + d2[0], d1[1] + d2[1]], bl = Math.hypot(...bis);
      const half = Math.acos(d1[0] * d2[0] + d1[1] * d2[1]) / 2;
      const inner = new T.Group();
      inner.rotation.y = Math.atan2(-bis[1] / bl, bis[0] / bl);
      group.add(inner);
      const k = data.radius / 108.4; // scale the measured profiles to the OSM footprint

      const archR = K.profile([[0, 66], [40, 66.5], [80, 65.5], [120, 63], [150, 60.5], [180, 56.5], [200, 52], [215, 47], [230, 39],
        [245, 29.5], [258, 19], [268, 9.5], [275, 2.5], [276.5, 0]].map(([y, r]) => [y, r * k]));
      const sailR = K.profile([[0, 92], [6, 93], [30, 97], [60, 99], [100, 98.5], [130, 96], [160, 90.5], [185, 84], [200, 78.5], [209, 74]].map(([y, r]) => [y, r * k]));
      const ROOF = 206, SAIL_BASE = 4, SAIL_TOP = 209, PANELS = 12, SPINE_TOP = 276.5, MAST_TOP = 321;
      const panelH = (SAIL_TOP - SAIL_BASE) / PANELS;
      const BETA = half - 4 * Math.PI / 180;

      const V = (x, y, z) => new T.Vector3(x, y, z);
      const wing = (s) => V(Math.cos(half), 0, s * Math.sin(half));
      const out = (s) => V(-Math.sin(half), 0, s * Math.cos(half));           // outward normal of wing wall s
      const P = (s, y) => wing(s).multiplyScalar(archR(Math.min(y, ROOF))).setY(y); // front edge of the outer wall
      const Q = (s, y) => { const a = archR(Math.min(y, ROOF)), r = a + 0.35 * (sailR(y) - a); return V(r * Math.cos(BETA), y, s * r * Math.sin(BETA)); };
      const sailPoint = (t, y) => {
        const q1 = Q(1, y), q2 = Q(-1, y), f = V(sailR(y), y, 0);
        const c = f.clone().multiplyScalar(2).sub(q1.clone().add(q2).multiplyScalar(0.5));
        return q1.clone().multiplyScalar((1 - t) ** 2).add(c.multiplyScalar(2 * t * (1 - t))).add(q2.clone().multiplyScalar(t * t));
      };
      const orient = (g, expected) => {
        const n = g.getAttribute('normal');
        let sx = 0, sy = 0, sz = 0;
        for (let i = 0; i < n.count; i++) { sx += n.getX(i); sy += n.getY(i); sz += n.getZ(i); }
        if (sx * expected.x + sy * expected.y + sz * expected.z < 0) {
          const idx = g.index.array;
          for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
          g.index.needsUpdate = true; g.computeVertexNormals();
        }
        return g;
      };
      const ys = (a, b, step) => { const r = []; for (let y = a; y < b; y += step) r.push(y); r.push(b); return r; };

      // ---------------------------------------------------------- materials
      const glassTex = K.baaGlass(ctx.aniso), sailTex = K.baaSail(ctx.aniso);
      const glass = new T.MeshStandardMaterial({ map: glassTex.map, roughnessMap: glassTex.rm, metalnessMap: glassTex.rm, roughness: 1, metalness: 1, emissiveMap: glassTex.emissive, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.2 });
      const sail = new T.MeshStandardMaterial({ map: sailTex.map, color: 0xffffff, roughness: 0.62, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.06, side: T.DoubleSide });
      const white = new T.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.42, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0 });
      const darkGlass = new T.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.3, emissive: 0xffc98a, emissiveIntensity: 0 });
      const roofMat = new T.MeshStandardMaterial({ color: 0xd9d9d4, roughness: 0.8 });
      const stone = new T.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.9 });
      const helipadTop = new T.MeshStandardMaterial({ map: K.helipad(), roughness: 0.7 });

      // ---------------------------------------------------------- wing walls (blue glass, duplex floors)
      const glassGeoms = [];
      [1, -1].forEach((s) => {
        const rows = ys(0, ROOF, 3.45).map((y) => [wing(s).multiplyScalar(1.5).setY(y), P(s, y)]);
        glassGeoms.push(orient(K.gridSurface(rows, { uv: (i, j) => [rows[j][i].clone().setY(0).length() / 9, rows[j][i].y / 6.9] }), out(s)));
        const front = ys(0, ROOF, 3.45).map((y) => [P(s, y), Q(s, y)]);
        glassGeoms.push(orient(K.gridSurface(front, { uv: (i, j) => [i * front[j][0].distanceTo(front[j][1]) / 9, front[j][0].y / 6.9] }), V(1, 0, s * 0.6)));
      });
      const glassMesh = new T.Mesh(K.merge(glassGeoms), glass);

      // ---------------------------------------------------------- sail: 12 scalloped membrane panels
      const COLS = 40, sailRows = [];
      ys(SAIL_BASE, SAIL_TOP, panelH / 8).forEach((y) => {
        const f = ((y - SAIL_BASE) / panelH) % 1;
        sailRows.push(Array.from({ length: COLS + 1 }, (_, i) => {
          const t = i / COLS, p = sailPoint(t, y);
          const radial = V(p.x, 0, p.z).normalize();
          return p.add(radial.multiplyScalar(1.7 * Math.sin(Math.PI * f) * Math.sin(Math.PI * t)));
        }));
      });
      const sailGeo = orient(K.gridSurface(sailRows, { uv: (i, j) => [i / COLS * 3, (sailRows[j][0].y - SAIL_BASE) / panelH] }), V(1, 0, 0));
      const sailMesh = new T.Mesh(sailGeo, sail);
      const arches = [];
      for (let p = 0; p <= PANELS; p++) {
        const y = SAIL_BASE + p * panelH;
        arches.push(K.tube(Array.from({ length: 17 }, (_, i) => sailPoint(i / 16, y)), 0.55, 48, 6));
      }

      // ---------------------------------------------------------- roof, spine, mast
      // spine -> wing wall -> sail (from Q+ to Q-) -> other wing wall
      const roofRing = [V(-2, 0, 0), P(1, ROOF), ...Array.from({ length: 21 }, (_, i) => sailPoint(i / 20, ROOF)), P(-1, ROOF)].map((v) => [v.x, v.z]);
      const roofCap = K.prism(roofRing, ROOF - 1.5, ROOF, { uScale: 8, vScale: 8 });
      const spineRing = [[6, 0], [3, 4.6], [-1.5, 5.4], [-5.5, 4.2], [-8, 1.8], [-8.6, 0], [-8, -1.8], [-5.5, -4.2], [-1.5, -5.4], [3, -4.6]];
      const spineLow = K.prism(spineRing, 0, ROOF + 4, { uScale: 6, vScale: 6 });
      const spineHigh = K.prism(K.scaleRing(spineRing, 0.78, [-1.5, 0]), ROOF + 4, SPINE_TOP + 2, { uScale: 6, vScale: 6 });
      const mast = new T.ConeGeometry(2.7, MAST_TOP - SPINE_TOP - 2, 10);
      mast.translate(-1.8, (MAST_TOP + SPINE_TOP + 2) / 2, 0);
      const backStrip = K.prism([[-8.4, 1.6], [-9.3, 1.1], [-9.3, -1.1], [-8.4, -1.6]], 22, 196, { uScale: 3, vScale: 6 });

      // ---------------------------------------------------------- exoskeleton
      const whiteGeoms = [spineLow.walls, spineLow.cap, spineHigh.walls, spineHigh.cap, mast, ...arches];
      [1, -1].forEach((s) => {
        const o = out(s);
        // great arch truss along the front edge, rising into the spine at ~276 m
        const lift = (y) => 2.6 * (1 - K.smoothstep(225, SPINE_TOP, y));
        const chord1 = ys(0, SPINE_TOP, 9).map((y) => wing(s).multiplyScalar(archR(y) + 1.2).add(o.clone().multiplyScalar(lift(y))).setY(y));
        const chord2 = ys(0, 250, 9).map((y) => wing(s).multiplyScalar(Math.max(archR(y) - 3.6, 2)).add(o.clone().multiplyScalar(lift(y))).setY(y));
        whiteGeoms.push(K.tube(chord1, 1.9, 120, 12), K.tube(chord2, 0.9, 90, 8));
        for (let i = 0; i < chord2.length - 1; i++) whiteGeoms.push(K.strut(chord1[i], chord2[i + 1], 0.45), K.strut(chord1[i + 1], chord2[i + 1], 0.4));
        // horizontal truss bands at the three structural levels
        [64, 134, 204].forEach((y) => {
          const a = Array.from({ length: 9 }, (_, i) => wing(s).multiplyScalar(4 + i / 8 * (archR(y) - 6)).add(o.clone().multiplyScalar(2.2)).setY(y));
          const b = a.map((p) => p.clone().setY(y - 2.6));
          whiteGeoms.push(K.lattice(a, b, { r: 1.05, web: 0.42 }));
        });
        // three diagonal lattice braces between the bands, rising from the spine towards the arch
        [[4, 64], [64, 134], [134, 204]].forEach(([y0, y1]) => {
          const a0 = wing(s).multiplyScalar(7).setY(y0 + 4), a1 = wing(s).multiplyScalar(archR(y1) - 6).setY(y1 - 4);
          const dir = a1.clone().sub(a0).normalize(), perp = o.clone().cross(dir).normalize().multiplyScalar(2.6);
          const A = Array.from({ length: 11 }, (_, i) => a0.clone().lerp(a1, i / 10).add(o.clone().multiplyScalar(2)));
          whiteGeoms.push(K.lattice(A, A.map((p) => p.clone().add(perp)), { r: 0.75, web: 0.32 }));
        });
      });
      const whiteMesh = new T.Mesh(K.merge(whiteGeoms), white);

      // ---------------------------------------------------------- helipad (inverted cone) and Al Muntaha
      const HX = 70 * k, HY = 212;
      const pad = new T.Mesh(new T.CylinderGeometry(12, 12, 1.3, 64), [white, helipadTop, white]);
      pad.position.set(HX, HY, 0);
      const cone = new T.CylinderGeometry(10.6, 1.8, 10, 40, 1, true);
      cone.translate(HX, HY - 5.65, 0);
      const rim = new T.TorusGeometry(12.3, 0.28, 8, 64); rim.rotateX(Math.PI / 2); rim.translate(HX, HY + 0.9, 0);
      const stem = K.strut(V(HX, HY - 10.5, 0), V(sailR(SAIL_TOP) - 6, SAIL_TOP - 4, 0), 1.6, 10);
      const muntaha = new T.SphereGeometry(1, 40, 20); muntaha.scale(21, 5.2, 9.5); muntaha.translate(-14.5, 199, 0);
      const visor = new T.SphereGeometry(1, 40, 12); visor.scale(21.3, 1.5, 9.8); visor.translate(-14.5, 199.6, 0);
      const extras = new T.Mesh(K.merge([cone, rim, stem, muntaha]), white);
      const visorMesh = new T.Mesh(K.merge([visor, backStrip.walls]), darkGlass);

      inner.add(glassMesh, sailMesh, whiteMesh, pad, extras, visorMesh, new T.Mesh(roofCap.cap, roofMat), new T.Mesh(roofCap.walls, white));

      // ---------------------------------------------------------- island plinth (OSM footprint, unrotated)
      const plinth = K.prism(K.scaleRing(data.footprint, 1.05, [0, 0]), 0, 3.5, { uScale: 6, vScale: 6 });
      const plinthMesh = new T.Mesh(K.merge([plinth.walls, plinth.cap]), stone);
      plinthMesh.userData.noShadow = true;
      group.add(plinthMesh);

      const ledColour = new T.Color();
      return {
        group,
        pickables: [glassMesh, sailMesh, whiteMesh, pad, extras],
        setTheme(theme) {
          const night = theme === 'night', dusk = theme === 'dusk';
          glass.emissiveIntensity = night ? 1.1 : 0;
          white.emissiveIntensity = night ? 0.22 : 0;
          darkGlass.emissiveIntensity = night ? 0.9 : 0;
          sail.emissiveIntensity = night ? 0.9 : dusk ? 0.16 : 0.06;
          if (!night) sail.emissive.set(0xffffff);
        },
        animate(t, theme) {
          if (theme !== 'night') return false;
          // the sail's LED show slowly cycles through the hotel's signature colours
          ledColour.setHSL((t / 40) % 1, 0.65, 0.62);
          sail.emissive.copy(ledColour);
          return true;
        },
      };
    },
  };
})();
