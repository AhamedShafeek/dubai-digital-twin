/* Dubai Opera: a dhow-shaped hull fitted to the OSM footprint. The roof rises from the stern to a 44 m prow that
 * faces the Burj Khalifa; the front of the hull is a lattice of glass ribs (the dhow's frame), the rest is clad in
 * pale stone with fine horizontal coursing. */
(function () {
  'use strict';

  const OPERA = 'w475848632';

  DT.MODEL_DEFS['dubai-opera'] = {
    district: 'downtown',
    replaces: [OPERA],
    title: 'Dubai Opera',
    eyebrow: 'Detailed 3D model · Performing arts',
    desc: 'A 2,000-seat multi-format theatre shaped like a traditional dhow, with a glass prow facing the Burj Khalifa and the lake.',
    facts: [
      ['Height', '44 m at the prow'],
      ['Capacity', '2,000 seats (theatre, concert hall or flat-floor event space)'],
      ['Architect', 'Janus Rostock, Atkins'],
      ['Opened', '31 August 2016'],
    ],
    height: 44,
    shadow: { mapSize: 2048 },
    ground: 600,

    build(K, T, D, ctx) {
      const b = ctx.building(OPERA);
      if (!b) throw new Error('Dubai Opera footprint missing');
      const X = DT.downtownTextures(K, T, ctx.aniso);
      const group = new T.Group();
      const ring = b.polys[0][0];
      const F = K.axisFrame(ring, [0, 0]);   // +s points at the Burj Khalifa: that end is the prow
      const L = F.length, N = 80, COLS = 18;
      // the roof line sweeps up from a low stern to the 44 m prow, like a dhow's raised bow
      const ridge = (u) => 15 + 29 * u ** 2.4;
      const eave = (u) => ridge(u) - 3.5 - 5 * (1 - u) ** 2;
      const GLASS_FROM = 0.6;

      // stations along the hull: footprint extents and heights
      const stations = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, s = F.min + 0.4 + (L - 0.8) * u, ex = F.extents(s);
        if (ex) stations.push({ u, s, lo: ex[0], hi: ex[1] });
      }
      const row = (st, side) => {
        // wall from the ground to the eave with a slight outward flare (the hull), side = -1 left (lo), +1 right (hi)
        const t0 = side < 0 ? st.lo : st.hi, e = eave(st.u), flare = 1.2 * st.u;
        return Array.from({ length: 7 }, (_, k) => { const f = k / 6; return F.P(st.s, t0 + side * flare * Math.sin(f * Math.PI / 2), e * f); });
      };
      const roofRow = (st) => {
        const e = eave(st.u), r = ridge(st.u), flare = 1.2 * st.u, lo = st.lo - flare, hi = st.hi + flare;
        return Array.from({ length: COLS + 1 }, (_, k) => { const t = k / COLS; return F.P(st.s, lo + (hi - lo) * t, e + (r - e) * Math.sin(Math.PI * t) ** 0.6); });
      };
      const inside = F.P((F.min + F.max) / 2, 0, 10);
      const grid = (rows, uv) => K.orientOut(K.gridSurface(rows, { uv }), inside);
      const stern = stations.filter((st) => st.u <= GLASS_FROM + 0.01), bow = stations.filter((st) => st.u >= GLASS_FROM - 0.01);
      const wallUV = (rows) => (i, j) => [rows[j][i].distanceTo(rows[0][i]) / 6, rows[j][i].y / 6];
      const stoneG = [], glassG = [];
      [-1, 1].forEach((side) => {
        const sr = stern.map((st) => row(st, side)), br = bow.map((st) => row(st, side));
        if (sr.length > 1) stoneG.push(grid(sr, (i, j) => [(sr[j][0].distanceTo(sr[0][0])) / 8, sr[j][i].y / 8]));
        if (br.length > 1) glassG.push(grid(br, (i, j) => [(br[j][0].distanceTo(br[0][0])) / 12, br[j][i].y / 15.6]));
      });
      const rr = stations.map(roofRow);
      const roofG = grid(rr, (i, j) => [i / COLS * 6, rr[j][0].distanceTo(rr[0][0]) / 10]);
      // stern end wall
      const st0 = stations[0], back = [...row(st0, -1), ...roofRow(st0).slice(1, -1), ...row(st0, 1).reverse()];
      const sternCap = new T.BufferGeometry().setFromPoints(back);
      const idx = [];
      for (let k = 1; k < back.length - 1; k++) idx.push(0, k, k + 1);
      sternCap.setIndex(idx); sternCap.computeVertexNormals(); K.orientOut(sternCap, inside);
      const stN = stations[stations.length - 1], front = [...row(stN, -1), ...roofRow(stN).slice(1, -1), ...row(stN, 1).reverse()];
      const prowCap = new T.BufferGeometry().setFromPoints(front);
      prowCap.setIndex(idx.slice(0, (front.length - 2) * 3)); prowCap.computeVertexNormals(); K.orientOut(prowCap, inside);

      // glass ribs (the dhow frame) over the prow, and the roof edge
      const ribs = [];
      bow.forEach((st, k) => {
        if (k % 2) return;
        [-1, 1].forEach((side) => { const pts = row(st, side); ribs.push(K.tube(pts, 0.22, 10, 5)); });
        ribs.push(K.tube(roofRow(st).filter((_, i) => i % 3 === 0), 0.2, 12, 5));
      });
      [-1, 1].forEach((side) => ribs.push(K.tube(stations.map((st) => row(st, side)[6]), 0.35, 60, 6)));
      ribs.push(K.tube(rr.map((r2) => r2[COLS / 2]), 0.3, 60, 6));

      const stoneTex = K.texture(K.canvas(512, 512, (c, w, h) => {
        c.fillStyle = '#d9d4ca'; c.fillRect(0, 0, w, h);
        const r = K.rng(16);
        for (let y = 0; y < h; y += 16) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '120,110,95'},0.12)`; c.fillRect(0, y, w, 3); }
        for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(90,80,70,${r() * 0.08})`; c.fillRect(r() * w, r() * h, 2, 2); }
      }), { anisotropy: ctx.aniso });
      const stone = new T.MeshStandardMaterial({ map: stoneTex, roughness: 0.8, side: T.DoubleSide });
      const roofMat = new T.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.55, metalness: 0.2, side: T.DoubleSide });
      const gT = X.curtain.dark;
      const glass = new T.MeshStandardMaterial({ map: gT.map, roughnessMap: gT.rm, metalnessMap: gT.rm, roughness: 1, metalness: 1, emissiveMap: gT.emissive, emissive: 0xffd9a0, emissiveIntensity: 0, envMapIntensity: 1.3, side: T.DoubleSide });
      const ribMat = new T.MeshStandardMaterial({ color: 0xe7e9eb, roughness: 0.3, metalness: 0.85 });
      const meshes = [
        new T.Mesh(K.merge([...stoneG, sternCap]), stone), new T.Mesh(K.merge([...glassG, prowCap]), glass),
        new T.Mesh(roofG, roofMat), new T.Mesh(K.merge(ribs), ribMat),
      ];
      meshes.forEach((m) => group.add(m));
      const sign = K.sign('DUBAI OPERA', { width: 16, height: 2, color: '#e9e4d8' });
      const sm = new T.Mesh(sign.geo, sign.mat);
      const st = stations[Math.floor(stations.length * 0.35)];
      sm.position.copy(F.P(st.s, st.lo - 0.15, eave(st.u) - 3)); sm.rotation.y = F.rotY + Math.PI; sm.userData.noShadow = true;
      group.add(sm);

      return {
        group,
        pickables: meshes,
        center: F.c,
        setTheme(theme) {
          const night = theme === 'night', dusk = theme === 'dusk';
          glass.emissiveIntensity = night ? 1.6 : dusk ? 0.35 : 0;
          sign.mat.emissiveIntensity = night ? 1 : 0;
          stone.emissive = new T.Color(night ? 0x2a2018 : 0x000000);
        },
      };
    },
  };
})();
