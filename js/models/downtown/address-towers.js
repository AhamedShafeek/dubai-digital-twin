/* The Address towers of Downtown: Address Downtown (306 m), Address Boulevard (370 m) and the twin Address
 * Sky View towers with their sky bridge. Footprints and part heights are OpenStreetMap; floors, crowns, spires
 * and the bridge follow the built towers. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- shared tower builder
  function tower(K, T, X, ctx, o) {
    const group = new T.Group();
    const gT = X.curtain[o.glass];
    const glass = new T.MeshStandardMaterial({ map: gT.map, roughnessMap: gT.rm, metalnessMap: gT.rm, roughness: 1, metalness: 1, emissiveMap: gT.emissive, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.25 });
    const finMat = new T.MeshStandardMaterial({ color: o.finColor, roughness: 0.35, metalness: 0.7 });
    const crownMat = new T.MeshStandardMaterial({ color: o.crownColor || 0xeef3f8, roughness: 0.3, metalness: 0.8, emissive: o.crownGlow || 0xdfeaff, emissiveIntensity: 0 });
    const roofMat = new T.MeshStandardMaterial({ map: X.roof.map, roughness: 0.9 });
    const fh = o.floorH, uOff = ctx.rng();
    const walls = [], crowns = [], caps = [], fins = [];
    const ring0 = K.smoothRing(o.ring, 2, 60);
    const vScale = fh * gT.floors;

    // podium lobby band, then the shaft
    walls.push(K.prism(ring0, o.base || 0, o.bodyTop, { cap: false, uScale: gT.tileW, vScale, uOffset: uOff }).walls);
    for (let y = (o.base || 0) + fh * 5; y < o.bodyTop - fh; y += fh * 5) crowns.push(K.prism(K.offsetRing(ring0, 0.18), y, y + 0.35, { cap: false, uScale: 4, vScale: 4 }).walls);
    // vertical fins round the perimeter
    if (o.finSpacing) {
      const per = K.perimeter(ring0), n = Math.floor(per / o.finSpacing);
      let acc = 0, k = 0;
      const R = K.ccw(ring0);
      for (let i = 0; i < R.length && k < n; i++) {
        const p = R[i], q = R[(i + 1) % R.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L, rot = Math.atan2(-(q[1] - p[1]), q[0] - p[0]);
        while (acc + L >= k * o.finSpacing && k < n) {
          const t = (k * o.finSpacing - acc) / L;
          fins.push([p[0] + (q[0] - p[0]) * t + nx * 0.35, (o.bodyTop + (o.base || 0)) / 2, p[1] + (q[1] - p[1]) * t + nz * 0.35, rot, o.finW || 0.35, o.bodyTop - (o.base || 0), 0.7]);
          k++;
        }
        acc += L;
      }
    }
    // crown tiers stepping in, each with a lit metal band
    let ring = ring0, y = o.bodyTop;
    o.tiers.forEach(([scale, height]) => {
      crowns.push(K.prism(K.offsetRing(ring, 0.25), y - 1.2, y + 0.6, { cap: false, uScale: 4, vScale: 4 }).walls);
      caps.push(K.capPoly([K.ccw(ring)], y, 20));
      ring = K.scaleRing(ring, scale);
      walls.push(K.prism(ring, y, y + height, { cap: false, uScale: gT.tileW, vScale, uOffset: uOff }).walls);
      y += height;
    });
    crowns.push(K.prism(K.offsetRing(ring, 0.25), y - 1.2, y + 0.8, { cap: false, uScale: 4, vScale: 4 }).walls);
    caps.push(K.capPoly([K.ccw(ring)], y, 20));
    const top = y;
    // optional tiara of blades rising above the roof
    if (o.blades) {
      const R = K.ccw(ring), per = K.perimeter(R), n = Math.floor(per / 3.2);
      const F = K.axisFrame(R);
      let acc = 0, k = 0;
      for (let i = 0; i < R.length && k < n; i++) {
        const p = R[i], q = R[(i + 1) % R.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const rot = Math.atan2(-(q[1] - p[1]), q[0] - p[0]);
        while (acc + L >= k * 3.2 && k < n) {
          const t = (k * 3.2 - acc) / L, x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t;
          const along = Math.abs(F.along([x, z])) / (F.length / 2);
          const hb = o.blades * (0.35 + 0.65 * along ** 2);
          fins.push([x, top + hb / 2, z, rot, 0.4, hb, 1.2]);
          k++;
        }
        acc += L;
      }
    }
    // spire
    const ip = K.interiorPoint(ring);
    const spireH = o.spireTop - top;
    const spireGeo = spireH > 1 ? new T.LatheGeometry([[2.2, 0], [2.2, 3], [1.4, 4], [1.2, spireH * 0.45], [0.7, spireH * 0.8], [0.15, spireH - 0.6], [0, spireH]].map(([r, h]) => new T.Vector2(r, h)), 20) : null;
    if (spireGeo) spireGeo.translate(ip.point[0], top, ip.point[1]);
    const beacon = new T.Mesh(new T.SphereGeometry(0.7, 10, 8), new T.MeshBasicMaterial({ color: 0xff2a1f, transparent: true, opacity: 0, depthWrite: false }));
    beacon.position.set(ip.point[0], o.spireTop + 0.6, ip.point[1]);
    beacon.userData.noShadow = true;

    const wallMesh = new T.Mesh(K.merge(walls), glass);
    const crownMesh = new T.Mesh(K.merge(spireGeo ? [...crowns, spireGeo] : crowns), crownMat);
    const capMesh = new T.Mesh(K.merge(caps), roofMat);
    group.add(wallMesh, crownMesh, capMesh, beacon);
    const finMesh = K.instances(new T.BoxGeometry(1, 1, 1), finMat, fins);
    if (finMesh) group.add(finMesh);
    return {
      group, pickables: [wallMesh, crownMesh, capMesh, ...(finMesh ? [finMesh] : [])], top, center: K.interiorPoint(ring0).point,
      setTheme(theme) {
        const night = theme === 'night', dusk = theme === 'dusk';
        glass.emissiveIntensity = night ? 1.05 : dusk ? 0.12 : 0;
        crownMat.emissiveIntensity = night ? 1.6 : dusk ? 0.25 : 0;
      },
      animate(t, theme) {
        const on = theme === 'night' || theme === 'dusk';
        beacon.material.opacity = on ? (Math.sin(t * Math.PI * 1.2 + 1) > 0.1 ? 1 : 0.12) : 0;
        return on;
      },
    };
  }

  const ringOf = (ctx, id) => ctx.building(id)?.polys[0][0];

  // ---------------------------------------------------------------- Address Downtown
  DT.MODEL_DEFS['address-downtown'] = {
    district: 'downtown',
    replaces: ['w532836513'],
    title: 'Address Downtown',
    eyebrow: 'Detailed 3D model · Hotel & residences',
    desc: 'Five-star hotel and serviced residences on the lake beside Souk Al Bahar, finished with a stepped, illuminated crown and spire.',
    facts: [['Height', '306 m'], ['Floors', '63'], ['Architect', 'Atkins'], ['Opened', '2008 (rebuilt after the 2015 fire, reopened 2018)']],
    height: 306,
    build(K, T, D, ctx) {
      const X = DT.downtownTextures(K, T, ctx.aniso);
      const ring = ringOf(ctx, 'w532836513');
      return tower(K, T, X, { ...ctx, rng: K.rng(306) }, {
        ring, glass: 'silver', finColor: 0xe4ddd0, finSpacing: 2.8, floorH: 3.85, base: 0, bodyTop: 242,
        tiers: [[0.9, 6], [0.88, 6], [0.86, 6], [0.84, 6], [0.8, 6], [0.76, 6]], spireTop: 306.2, crownGlow: 0xfff0d0,
      });
    },
  };

  // ---------------------------------------------------------------- Address Boulevard
  DT.MODEL_DEFS['address-boulevard'] = {
    district: 'downtown',
    replaces: ['w532836516'],
    title: 'Address Boulevard',
    eyebrow: 'Detailed 3D model · Hotel & residences',
    desc: 'Downtown\'s tallest Address tower, on Sheikh Mohammed bin Rashid Boulevard, crowned by a tiara of lit blades and a spire.',
    facts: [['Height', '370 m'], ['Floors', '73'], ['Developer', 'Emaar Properties'], ['Opened', '2017']],
    height: 370,
    build(K, T, D, ctx) {
      const X = DT.downtownTextures(K, T, ctx.aniso);
      const ring = ringOf(ctx, 'w532836516');
      return tower(K, T, X, { ...ctx, rng: K.rng(370) }, {
        ring, glass: 'navy', finColor: 0xf0f2f4, finSpacing: 3.2, finW: 0.3, floorH: 3.9, base: 0, bodyTop: 285,
        tiers: [[0.93, 8], [0.9, 8], [0.86, 8], [0.82, 8]], blades: 16, spireTop: 370,
      });
    },
  };

  // ---------------------------------------------------------------- Address Sky View (two towers + sky bridge)
  const SKY1 = ['w946921563', 'w946921564', 'w946921565', 'w946921566', 'w946921567', 'w946921568', 'w946921569', 'w946921570'];
  const SKY2 = ['w934420755', 'w934420756', 'w934420757'];
  DT.MODEL_DEFS['address-sky-view'] = {
    district: 'downtown',
    replaces: [...SKY1, ...SKY2, 'w723558047', 'w723558400', 'w1041684723'],
    title: 'Address Sky View',
    eyebrow: 'Detailed 3D model · Hotel & residences',
    desc: 'Twin towers joined 200 m up by a four-storey sky bridge that carries the Sky Collection infinity pool.',
    facts: [['Heights', '264 m and 236 m'], ['Floors', '60 and 55'], ['Sky bridge', '≈ 200–216 m, with infinity pool'], ['Opened', '2019']],
    height: 264,
    build(K, T, D, ctx) {
      const X = DT.downtownTextures(K, T, ctx.aniso);
      const group = new T.Group();
      const gT = X.curtain.silver;
      const glass = new T.MeshStandardMaterial({ map: gT.map, roughnessMap: gT.rm, metalnessMap: gT.rm, roughness: 1, metalness: 1, emissiveMap: gT.emissive, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.25 });
      const frame = new T.MeshStandardMaterial({ color: 0xf2f3f4, roughness: 0.4, metalness: 0.5, emissive: 0xe8f0ff, emissiveIntensity: 0 });
      const roofMat = new T.MeshStandardMaterial({ map: X.roof.map, roughness: 0.9 });
      const water = new T.MeshStandardMaterial({ color: 0x38b6d8, roughness: 0.03, metalness: 0.1, envMapIntensity: 1.4, emissive: 0x1a8fbf, emissiveIntensity: 0 });
      const railGlass = new T.MeshStandardMaterial({ color: 0xa8cde0, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
      const walls = [], frames = [], caps = [];
      const parts = [...SKY1, ...SKY2].map((id) => ctx.building(id)).filter(Boolean);
      parts.forEach((p) => {
        const ring = K.smoothRing(p.polys[0][0], 1, 60);
        walls.push(K.prism(ring, 0, p.h - 1.5, { cap: false, uScale: gT.tileW, vScale: 3.6 * gT.floors }).walls);
        frames.push(K.prism(K.offsetRing(ring, 0.2), p.h - 1.5, p.h + 0.6, { cap: false, uScale: 4, vScale: 4 }).walls);
        caps.push(K.capPoly([K.ccw(ring)], p.h - 1.5, 20));
        for (let y = 18; y < p.h - 4; y += 18) frames.push(K.prism(K.offsetRing(ring, 0.15), y, y + 0.4, { cap: false, uScale: 4, vScale: 4 }).walls);
      });
      // sky bridge between the facing faces of the two towers
      const t1 = ctx.building('w946921563').polys[0][0], t2 = ctx.building('w934420757').polys[0][0];
      const cen = (r) => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
      const c1 = cen(t1), c2 = cen(t2), d = [c2[0] - c1[0], c2[1] - c1[1]], dl = Math.hypot(...d), u = [d[0] / dl, d[1] / dl];
      const exit = (c, ring, dir) => { let s = 0; while (s < 80 && K.pointInRing([c[0] + dir[0] * s, c[1] + dir[1] * s], ring)) s += 0.5; return s; };
      const s1 = exit(c1, t1, u) - 2, s2 = dl - exit(c2, t2, [-u[0], -u[1]]) + 2;
      const n = [-u[1], u[0]], W = 11;
      const A = [c1[0] + u[0] * s1, c1[1] + u[1] * s1], B = [c1[0] + u[0] * s2, c1[1] + u[1] * s2];
      const deck = [[A[0] - n[0] * W, A[1] - n[1] * W], [B[0] - n[0] * W, B[1] - n[1] * W], [B[0] + n[0] * W, B[1] + n[1] * W], [A[0] + n[0] * W, A[1] + n[1] * W]];
      const y0 = 200, y1 = 214;
      const br = K.prism(deck, y0, y1, { uScale: gT.tileW, vScale: 3.6 * gT.floors });
      walls.push(br.walls);
      frames.push(K.prism(K.offsetRing(deck, 0.3), y0 - 1.2, y0, { uScale: 4, vScale: 4 }).walls, K.capPoly([K.ccw(deck)], y0 - 1.2, 4, true));
      frames.push(K.prism(K.offsetRing(deck, 0.3), y1, y1 + 0.8, { cap: false, uScale: 4, vScale: 4 }).walls);
      caps.push(br.cap);
      const pool = K.scaleRing(deck, 0.82);
      const poolMesh = new T.Mesh(K.capPoly([K.ccw(pool)], y1 + 0.55, 6), water);
      const rail = K.prism(K.offsetRing(deck, 0.1), y1 + 0.8, y1 + 2, { cap: false, uScale: 4, vScale: 4 }).walls;
      const wallMesh = new T.Mesh(K.merge(walls), glass), frameMesh = new T.Mesh(K.merge(frames), frame), capMesh = new T.Mesh(K.merge(caps), roofMat);
      const railMesh = new T.Mesh(rail, railGlass);
      railMesh.userData.noShadow = true; poolMesh.userData.noShadow = true;
      group.add(wallMesh, frameMesh, capMesh, poolMesh, railMesh);
      return {
        group,
        pickables: [wallMesh, frameMesh, capMesh],
        center: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2],
        setTheme(theme) {
          const night = theme === 'night', dusk = theme === 'dusk';
          glass.emissiveIntensity = night ? 1.05 : dusk ? 0.12 : 0;
          frame.emissiveIntensity = night ? 0.9 : 0;
          water.emissiveIntensity = night ? 1.2 : 0;
        },
      };
    },
  };
})();
