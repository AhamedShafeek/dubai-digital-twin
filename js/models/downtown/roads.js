/* District streets in 3D, built from OpenStreetMap centrelines (width from lanes, direction, level and per-node
 * junction / crossing / signal flags from scripts/build-data.mjs).
 *  - asphalt carriageways with UAE-style markings: yellow median edge and white kerb edge on divided roads,
 *    dashed lane dividers, centre lines on two-way roads; markings stop short of junctions
 *  - zebra crossings, stop lines and signal masts at signalised junctions
 *  - raised pavements with kerbs (respecting sidewalk=* tags), footpaths, red cycle tracks
 *  - bridges lifted by their OSM layer with ramps, deck edges, parapets and piers
 * Surfaces use world-space UVs, so overlapping pieces at junctions sample identical texels (no visible z-fight).
 * In Realistic mode the aerial photo already shows the real roads, so only elevated structures and street
 * furniture are drawn. */
(function () {
  'use strict';

  const VEHICLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']);
  const SIDEWALK_CLS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']);
  const DIVIDED = new Set(['motorway', 'trunk', 'primary', 'secondary']);
  const PATHS = { footway: { w: 2.4, y: 0.1, mat: 'paving' }, path: { w: 2, y: 0.1, mat: 'paving' }, pedestrian: { w: 5, y: 0.1, mat: 'paving' }, cycleway: { w: 2.6, y: 0.09, mat: 'cycle' } };
  const ROAD_Y = 0.07, MARK_Y = 0.025, KERB = 0.18, DECK = 1.4, LAYER_H = 6.5, DASH = 9;

  DT.MODEL_DEFS['district-roads'] = {
    district: 'downtown',
    title: 'Street network',
    eyebrow: 'District · roads',
    desc: '',
    facts: [],
    ground: 0,

    build(K, T, D, ctx) {
      const t0 = performance.now();
      const group = new T.Group(), groundGroup = new T.Group(), elevGroup = new T.Group();
      group.add(groundGroup, elevGroup);
      const streets = D.streets || [];

      // ---------------------------------------------------------------- textures
      const asphaltTex = K.texture(K.canvas(512, 512, (c, w, h) => {
        c.fillStyle = '#5d5c5a'; c.fillRect(0, 0, w, h);
        const r = K.rng(42), img = c.getImageData(0, 0, w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 26 + (r() < 0.02 ? 30 : 0); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        c.putImageData(img, 0, 0);
        for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '20,20,22' : '90,92,96'},${0.05 + r() * 0.08})`; c.beginPath(); c.ellipse(r() * w, r() * h, 20 + r() * 90, 8 + r() * 40, r() * 3, 0, 7); c.fill(); }
        c.strokeStyle = 'rgba(15,15,15,0.25)'; c.lineWidth = 1.2;
        for (let i = 0; i < 6; i++) { c.beginPath(); let x = r() * w, y = r() * h; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; c.lineTo(x, y); } c.stroke(); }
      }), { anisotropy: ctx.aniso });
      const pavingTex = K.texture(K.canvas(512, 512, (c, w, h) => {
        c.fillStyle = '#d8d0c2'; c.fillRect(0, 0, w, h);
        const r = K.rng(7), s = w / 8; // 0.5 m slabs on a 4 m tile
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
          const k = 0.93 + r() * 0.12;
          c.fillStyle = `rgb(${216 * k | 0},${206 * k | 0},${190 * k | 0})`;
          c.fillRect(i * s + (j % 2) * s / 2 + 1, j * s + 1, s - 2, s - 2);
          c.fillRect(i * s - s / 2 + (j % 2) * s / 2 + 1, j * s + 1, s - 2, s - 2);
        }
        const img = c.getImageData(0, 0, w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        c.putImageData(img, 0, 0);
      }), { anisotropy: ctx.aniso });
      const cycleTex = K.texture(K.canvas(256, 256, (c, w, h) => {
        c.fillStyle = '#9a4a3a'; c.fillRect(0, 0, w, h);
        const r = K.rng(3), img = c.getImageData(0, 0, w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 22; d[i] += n; d[i + 1] += n * 0.7; d[i + 2] += n * 0.6; }
        c.putImageData(img, 0, 0);
      }), { anisotropy: ctx.aniso });
      // markings alpha atlas: u < 0.5 dashed (3 m on / 6 m off over a 9 m period), u > 0.5 solid
      const dashTex = K.texture(K.canvas(64, 256, (c, w, h) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff'; c.fillRect(0, 0, w / 2, h / 3); c.fillRect(w / 2, 0, w / 2, h);
      }), { color: false, anisotropy: ctx.aniso });
      dashTex.magFilter = T.NearestFilter;

      const asphalt = new T.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95, metalness: 0, envMapIntensity: 0.3 });
      const paving = new T.MeshStandardMaterial({ map: pavingTex, roughness: 0.85, metalness: 0, envMapIntensity: 0.4 });
      const cycle = new T.MeshStandardMaterial({ map: cycleTex, roughness: 0.9 });
      const kerbMat = new T.MeshStandardMaterial({ color: 0xcfcac2, roughness: 0.8 });
      const concrete = new T.MeshStandardMaterial({ color: 0xcdc7bc, roughness: 0.88 });
      const marking = new T.MeshStandardMaterial({
        color: 0xffffff, vertexColors: true, alphaMap: dashTex, alphaTest: 0.5, roughness: 0.55,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, emissive: 0xffffff, emissiveIntensity: 0,
      });

      // ---------------------------------------------------------------- buffers
      const buf = () => ({ p: [], n: [], uv: [], c: [], i: [] });
      // *Top buffers hold horizontal strips (flipped to face up at the end); the others hold vertical faces
      const B = { asphalt: buf(), asphaltE: buf(), mark: buf(), markE: buf(), paving: buf(), cycle: buf(), kerb: buf(), kerbTop: buf(), deck: buf(), deckTop: buf(), soffit: buf() };
      const WHITE = [1, 1, 1], YELLOW = [0.98, 0.78, 0.16];
      const vert = (b, x, y, z, nx, ny, nz, u, v, col = WHITE) => { b.p.push(x, y, z); b.n.push(nx, ny, nz); b.uv.push(u, v); b.c.push(...col); return b.p.length / 3 - 1; };
      const quad = (b, a, c2, d, e) => b.i.push(a, c2, d, a, d, e);
      const mesh = (b, mat) => {
        if (!b.i.length) return null;
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(b.p, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
        if (mat.vertexColors) g.setAttribute('color', new T.Float32BufferAttribute(b.c, 3));
        g.setIndex(b.i);
        g.computeBoundingSphere();
        return new T.Mesh(g, mat);
      };

      // ---------------------------------------------------------------- polyline helpers
      const cumul = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
      // right-of-travel unit normal (x east, z south) and miter scale per vertex
      const normals = (pts) => pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const seg = (u, v) => { const dx = v[0] - u[0], dz = v[1] - u[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
        const n1 = i > 0 ? seg(a, p) : seg(p, b), n2 = i < pts.length - 1 ? seg(p, b) : n1;
        let nx = n1[0] + n2[0], nz = n1[1] + n2[1];
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        const m = 1 / Math.max(0.35, nx * n1[0] + nz * n1[1]);
        return [nx * m, nz * m];
      });
      // points between arclengths sA..sB with interpolated normals
      const slice = (pts, cum, nor, sA, sB) => {
        const out = [];
        const at = (s) => {
          let i = 1;
          while (i < cum.length - 1 && cum[i] < s) i++;
          const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
          const p = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
          const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dz) || 1;
          return { p, s, n: [-dz / l, dx / l] };
        };
        out.push(at(sA));
        for (let i = 0; i < pts.length; i++) if (cum[i] > sA + 0.05 && cum[i] < sB - 0.05) out.push({ p: pts[i], s: cum[i], n: nor[i] });
        out.push(at(sB));
        return out;
      };
      const subtract = (L, zones) => {
        // [0, L] minus union of zones -> list of [a, b]
        const z = zones.filter(([a, b]) => b > 0 && a < L).sort((p, q) => p[0] - q[0]);
        const out = []; let cur = 0;
        for (const [a, b] of z) { if (a > cur + 0.5) out.push([cur, Math.min(a, L)]); cur = Math.max(cur, b); }
        if (cur < L - 0.5) out.push([cur, L]);
        return out;
      };

      // ---------------------------------------------------------------- bridge elevations
      const bridgeEnds = new Map();
      streets.forEach((s) => { if (s.bridge && s.layer > 0 && !s.tunnel) s.ends?.forEach((id) => bridgeEnds.set(id, (bridgeEnds.get(id) || 0) + 1)); });
      const elevation = (s, cum) => {
        if (!s.bridge || s.layer <= 0 || s.tunnel) return () => 0;
        const H = Math.min(3, s.layer) * LAYER_H, L = cum[cum.length - 1], R = Math.min(90, L * 0.45);
        const startHeld = (bridgeEnds.get(s.ends?.[0]) || 0) > 1, endHeld = (bridgeEnds.get(s.ends?.[1]) || 0) > 1;
        return (d) => H * Math.min(startHeld ? 1 : K.smoothstep(0, R, d), endHeld ? 1 : K.smoothstep(0, R, L - d));
      };

      // ---------------------------------------------------------------- ribbons
      // surface strip between lateral offsets o0..o1 (right of travel positive) along points, at height y(s)
      const strip = (b, sl, o0, o1, yAt, uvMode, col, uConst, ny = 1) => {
        let prev = null;
        for (const q of sl) {
          const y = yAt(q.s);
          const L = [q.p[0] + q.n[0] * o0, q.p[1] + q.n[1] * o0], R = [q.p[0] + q.n[0] * o1, q.p[1] + q.n[1] * o1];
          const uvL = uvMode === 'world' ? [L[0] / 4, L[1] / 4] : [uConst, q.s / DASH];
          const uvR = uvMode === 'world' ? [R[0] / 4, R[1] / 4] : [uConst, q.s / DASH];
          const a = vert(b, L[0], y, L[1], 0, ny, 0, uvL[0], uvL[1], col), c2 = vert(b, R[0], y, R[1], 0, ny, 0, uvR[0], uvR[1], col);
          if (prev) quad(b, prev[0], a, c2, prev[1]);
          prev = [a, c2];
        }
      };
      // vertical face along an offset, from y0(s) to y1(s); `out` = +1 faces right of travel, -1 left
      const face = (b, sl, o, y0At, y1At, out, uScale = 3) => {
        let prev = null;
        for (const q of sl) {
          const P = [q.p[0] + q.n[0] * o, q.p[1] + q.n[1] * o], nl = Math.hypot(q.n[0], q.n[1]) || 1;
          const nx = q.n[0] / nl * out, nz = q.n[1] / nl * out;
          const a = vert(b, P[0], y0At(q.s), P[1], nx, 0, nz, q.s / uScale, 0), c2 = vert(b, P[0], y1At(q.s), P[1], nx, 0, nz, q.s / uScale, 1);
          if (prev) { if (out > 0) quad(b, prev[0], a, c2, prev[1]); else quad(b, prev[0], prev[1], c2, a); }
          prev = [a, c2];
        }
      };
      // world-space surface strips must face up: strip() emits L->R per row, so fix winding per buffer at the end
      const flipWinding = (b) => { for (let i = 0; i < b.i.length; i += 3) { const t = b.i[i + 1]; b.i[i + 1] = b.i[i + 2]; b.i[i + 2] = t; } };

      const piers = [], signals = [];
      let crossings = 0, stopLines = 0, markLen = 0;

      for (const s of streets) {
        if (s.tunnel || s.pts.length < 2) continue;
        const pts = s.pts, cum = cumul(pts), nor = normals(pts), L = cum[cum.length - 1];
        if (L < 1) continue;
        const elev = elevation(s, cum), raised = s.bridge && s.layer > 0;
        const yRoad = (d) => elev(d) + ROAD_Y;
        const all = slice(pts, cum, nor, 0, L);

        // ---------------- paths
        if (PATHS[s.cls]) {
          if (raised) continue; // footbridges are modelled with the landscape
          const P = PATHS[s.cls];
          strip(B[P.mat], all, -P.w / 2, P.w / 2, () => P.y, 'world');
          continue;
        }
        if (!VEHICLE.has(s.cls)) continue;
        const w = s.width, hw = w / 2;

        // ---------------- carriageway
        strip(raised ? B.asphaltE : B.asphalt, all, -hw, hw, yRoad, 'world');
        if (raised) {
          // deck edges, soffit and parapets
          face(B.deck, all, -hw - 0.35, (d) => yRoad(d) - DECK, (d) => yRoad(d) + 0.95, -1);
          face(B.deck, all, hw + 0.35, (d) => yRoad(d) - DECK, (d) => yRoad(d) + 0.95, 1);
          face(B.deck, all, -hw, yRoad, (d) => yRoad(d) + 0.95, 1);
          face(B.deck, all, hw, yRoad, (d) => yRoad(d) + 0.95, -1);
          strip(B.deckTop, all, -hw - 0.35, -hw, (d) => yRoad(d) + 0.95, 'world');
          strip(B.deckTop, all, hw, hw + 0.35, (d) => yRoad(d) + 0.95, 'world');
          strip(B.soffit, all, -hw - 0.35, hw + 0.35, (d) => yRoad(d) - DECK, 'world', WHITE, 0, -1); // strips natively face down
          for (let d = 14; d < L - 6; d += 28) {
            const e = elev(d);
            if (e < 3) continue;
            const q = slice(pts, cum, nor, d, d + 0.1)[0];
            piers.push([q.p[0], (e - DECK) / 2, q.p[1], Math.atan2(q.n[0], q.n[1]), Math.min(w * 0.55, 7), e - DECK, 1.6]);
          }
        }

        // ---------------- markings
        const target = raised ? B.markE : B.mark;
        const clearZones = [];
        (s.j || []).forEach((i) => clearZones.push([cum[i] - 10 - hw * 0.4, cum[i] + 10 + hw * 0.4]));
        (s.x || []).forEach((i) => clearZones.push([cum[i] - 3.2, cum[i] + 3.2]));
        (s.sg || []).forEach((i) => clearZones.push([cum[i] - 1.2, cum[i] + 1.2]));
        const runs = subtract(L, clearZones);
        const lanes = Math.max(1, s.lanes || 1), m = 0.35;
        const lines = [];
        const marked = s.cls !== 'service' || lanes >= 2;
        if (marked && w >= 4.5) {
          if (s.oneway) {
            const lw = (w - 2 * m) / lanes;
            lines.push([-hw + m, DIVIDED.has(s.cls) && !s.link ? YELLOW : WHITE, 0.75]);
            lines.push([hw - m, WHITE, 0.75]);
            for (let k = 1; k < lanes; k++) lines.push([-hw + m + k * lw, WHITE, 0.25]);
          } else {
            const per = Math.max(1, Math.floor(lanes / 2)), lw = (hw - m) / per;
            if (lanes >= 4) { lines.push([-0.12, WHITE, 0.75]); lines.push([0.12, WHITE, 0.75]); } else lines.push([0, WHITE, 0.25]);
            if (s.cls !== 'residential' && s.cls !== 'living_street') { lines.push([-hw + m, WHITE, 0.75]); lines.push([hw - m, WHITE, 0.75]); }
            for (let k = 1; k < per; k++) { lines.push([k * lw, WHITE, 0.25]); lines.push([-k * lw, WHITE, 0.25]); }
          }
        }
        for (const [a, b2] of runs) {
          const sl = slice(pts, cum, nor, a, b2);
          for (const [o, colr, u] of lines) strip(target, sl, o - 0.08, o + 0.08, (d) => yRoad(d) + MARK_Y, 'dash', colr, u);
          markLen += b2 - a;
        }

        // ---------------- zebra crossings and stop lines (ground level only)
        if (!raised) {
          (s.x || []).forEach((i) => {
            const d = cum[i], sl = slice(pts, cum, nor, Math.max(0, d - 1.8), Math.min(L, d + 1.8));
            for (let o = -hw + 0.7; o <= hw - 0.6; o += 1.1) strip(B.mark, sl, o, o + 0.55, () => ROAD_Y + MARK_Y, 'dash', WHITE, 0.75);
            crossings++;
          });
          (s.sg || []).forEach((i) => {
            const d = cum[i], back = s.oneway ? 2 : 0;
            const sl = slice(pts, cum, nor, Math.max(0, d - back - 0.45), Math.max(0.4, d - back));
            strip(B.mark, sl, s.oneway ? -hw + 0.3 : 0, hw - 0.3, () => ROAD_Y + MARK_Y, 'dash', WHITE, 0.75);
            stopLines++;
            const q = slice(pts, cum, nor, d, Math.min(L, d + 0.1))[0], nl = Math.hypot(q.n[0], q.n[1]) || 1;
            const nx = q.n[0] / nl, nz = q.n[1] / nl;
            signals.push([q.p[0] + nx * (hw + 1.4), 0, q.p[1] + nz * (hw + 1.4), Math.atan2(-nx, -nz)]);
          });
        }

        // ---------------- pavements with kerbs
        if (!raised && !s.link && SIDEWALK_CLS.has(s.cls) && !/^(no|none|separate)$/.test(s.sidewalk || '')) {
          const sides = s.sidewalk === 'left' ? [-1] : s.sidewalk === 'right' ? [1] : s.sidewalk === 'both' ? [-1, 1] : s.oneway && DIVIDED.has(s.cls) ? [1] : [-1, 1];
          const zones = (s.j || []).map((i) => [cum[i] - 9 - hw * 0.3, cum[i] + 9 + hw * 0.3]);
          for (const [a, b2] of subtract(L, zones)) {
            const sl = slice(pts, cum, nor, a, b2);
            for (const side of sides) {
              const inner = side * (hw + 0.15), outer = side * (hw + 0.15 + 3);
              strip(B.paving, sl, Math.min(inner, outer), Math.max(inner, outer), () => KERB, 'world');
              face(B.kerb, sl, side * hw, () => ROAD_Y - 0.02, () => KERB, -side);
              strip(B.kerbTop, sl, Math.min(side * hw, inner), Math.max(side * hw, inner), () => KERB + 0.005, 'world');
              face(B.kerb, sl, outer, () => 0, () => KERB, side);
            }
          }
        }
      }
      // strips were wound L->R with n pointing right; flip so world-space surfaces face upwards
      [B.asphalt, B.asphaltE, B.mark, B.markE, B.paving, B.cycle, B.kerbTop, B.deckTop].forEach(flipWinding);

      const add = (parent, m, shadow = true) => { if (!m) return; m.receiveShadow = true; if (!shadow) m.userData.noShadow = true; parent.add(m); };
      add(groundGroup, mesh(B.asphalt, asphalt), false);
      add(groundGroup, mesh(B.mark, marking), false);
      add(groundGroup, mesh(B.paving, paving), false);
      add(groundGroup, mesh(B.cycle, cycle), false);
      add(groundGroup, mesh(B.kerb, kerbMat), false);
      add(groundGroup, mesh(B.kerbTop, kerbMat), false);
      add(elevGroup, mesh(B.asphaltE, asphalt));
      add(elevGroup, mesh(B.markE, marking), false);
      add(elevGroup, mesh(B.deck, concrete));
      add(elevGroup, mesh(B.deckTop, concrete));
      add(elevGroup, mesh(B.soffit, concrete));
      const pierMesh = K.instances(new T.BoxGeometry(1, 1, 1), concrete, piers);
      if (pierMesh) elevGroup.add(pierMesh);

      // signal masts: pole, outreach arm over the road, three-aspect heads
      const metal = new T.MeshStandardMaterial({ color: 0x5b6067, roughness: 0.45, metalness: 0.7 });
      const lamps = new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, emissive: 0xff3b2f, emissiveIntensity: 0.4 });
      const signalGeo = (() => {
        const pole = new T.CylinderGeometry(0.11, 0.16, 6.4, 8); pole.translate(0, 3.2, 0);
        const arm = new T.CylinderGeometry(0.07, 0.09, 6, 6); arm.rotateX(Math.PI / 2); arm.translate(0, 6.1, 3);
        const head1 = new T.BoxGeometry(0.4, 1.1, 0.3); head1.translate(0, 5.5, 3.2);
        const head2 = new T.BoxGeometry(0.4, 1.1, 0.3); head2.translate(0, 5.5, 5.6);
        const head3 = new T.BoxGeometry(0.4, 1.1, 0.3); head3.translate(0, 2.8, 0.25);
        return { metal: K.merge([pole, arm]), heads: K.merge([head1, head2, head3]) };
      })();
      const sigRows = signals.map(([x, y, z, r]) => [x, y, z, r, 1, 1, 1]);
      const sp = K.instances(signalGeo.metal, metal, sigRows), sh = K.instances(signalGeo.heads, lamps, sigRows, { shadow: false });
      [sp, sh].forEach((m2) => m2 && group.add(m2));

      console.log(`[twin] district roads: ${streets.length} ways, ${(markLen / 1000).toFixed(0)} km of marked carriageway, ${crossings} crossings, ${stopLines} stop lines, ${piers.length} bridge piers in ${Math.round(performance.now() - t0)} ms`);

      return {
        group,
        pickables: [],
        setTheme(theme) {
          groundGroup.visible = theme !== 'satellite';
          const night = theme === 'night', dusk = theme === 'dusk';
          asphalt.color.set(night ? 0x5a5f6a : dusk ? 0xd9c3b0 : 0xffffff);
          paving.color.set(night ? 0x3a3d46 : dusk ? 0xe8cdb6 : 0xffffff);
          marking.emissiveIntensity = night ? 0.25 : 0;
          lamps.emissiveIntensity = night ? 2.4 : dusk ? 1 : 0.4;
        },
      };
    },
  };
})();
