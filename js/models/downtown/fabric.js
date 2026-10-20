/* Downtown Dubai district fabric: every OSM building in Downtown and its surroundings as a detailed procedural model.
 * Real footprint (with holes and multipolygons), real height and floor count; the architectural treatment is
 * chosen from the building's tags, name, size and location (Old Town is recognised by its building names).
 * Geometry is merged per material and per 260 m chunk (for culling), repeated elements are instanced, and every
 * triangle / instance remembers its building so clicks resolve to the OSM building. */
(function () {
  'use strict';

  const OLD_TOWN = /yansoon|reehan|kamoon|zanzebeel|zanzabeel|zaafaran|zafraan|zafran|miska|tajer|manzil|qamardeen|attareen|souk al bahar|old town/i;
  const STYLE_LABEL = {
    glass: 'Curtain-wall tower', residential: 'Residential tower', midrise: 'Mid-rise', lowrise: 'Low-rise', podium: 'Podium / retail',
    arabic: 'Old Town (Arabic revival)', construction: 'Under construction', mosque: 'Mosque', station: 'Metro station', canopy: 'Canopy', kiosk: 'Pavilion',
    villa: 'Villa / low-rise house',
  };
  const ORTHO_MAX_H = 45;   // above this, aerial photos show the roof displaced, so towers keep modelled roofs
  const CHUNK = 260;

  DT.MODEL_DEFS['downtown-fabric'] = {
    district: 'downtown',
    fabric: true,
    title: 'Downtown Dubai',
    eyebrow: 'District · detailed 3D model',
    desc: 'Every building in the Downtown Dubai community, modelled on its OpenStreetMap footprint, height and floor count.',
    facts: [],
    shadow: { mapSize: 4096 },
    ground: 1600,

    build(K, T, D, ctx) {
      const t0 = performance.now();
      const X = DT.downtownTextures(K, T, ctx.aniso);
      const group = new T.Group();
      const pickables = [];
      const hash = (s, salt = 0) => { let h = 2166136261 ^ salt; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
      const pick = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];
      const col = (h) => new T.Color(h);

      // ---------------------------------------------------------------- materials
      const night = [];
      const facade = (t, o = {}) => {
        const m = new T.MeshStandardMaterial({
          map: t.map, roughnessMap: t.rm || null, metalnessMap: t.rm || null, roughness: 1, metalness: t.rm ? 1 : 0,
          emissiveMap: t.emissive || null, emissive: t.emissive ? 0xffffff : 0x000000, emissiveIntensity: 0,
          vertexColors: true, envMapIntensity: o.env ?? 1, ...(o.extra || {}),
        });
        if (t.emissive) night.push([m, o.night ?? 1, o.dusk ?? 0.12]);
        return m;
      };
      const plain = (color, rough, metal, o = {}) => new T.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: o.vc ?? true, ...o.extra });
      const M = {
        retail: facade(X.retail, { night: 1.1, dusk: 0.35 }),
        arabic: facade(X.arabic, { night: 0.9, dusk: 0.15 }),
        arcade: facade(X.arcade, { night: 1, dusk: 0.3 }),
        louvre: facade(X.louvre),
        screen: facade(X.screen, { extra: { alphaMap: X.screen.alpha, alphaTest: 0.5, side: T.DoubleSide } }),
        concrete: facade(X.concrete),
        roof: facade(X.roof),
        trim: plain(0xe3e6e8, 0.35, 0.75),
        coping: plain(0xd7d3cb, 0.8, 0.05),
        stucco: plain(0xdcc59c, 0.92, 0),
        crown: plain(0xdfe8f2, 0.3, 0.8, { extra: { emissive: 0xbfd8ff, emissiveIntensity: 0 } }),
        shell: plain(0xf0d79e, 0.32, 0.65),
      };
      // aerial-photo roof materials, one per imagery atlas (finest first)
      const atlases = ctx.ortho || [];
      atlases.forEach((a, i) => { M[`ortho${i}`] = new T.MeshStandardMaterial({ map: a.texture, roughness: 0.9, metalness: 0, vertexColors: true }); });
      for (const k of Object.keys(X.curtain)) M[`curtain.${k}`] = facade(X.curtain[k], { env: 1.25 });
      for (const k of Object.keys(X.residential)) M[`resi.${k}`] = facade(X.residential[k]);
      for (const k of Object.keys(X.stone)) M[`stone.${k}`] = facade(X.stone[k]);
      const TEX = { retail: X.retail, arabic: X.arabic, arcade: X.arcade, louvre: X.louvre, screen: X.screen, concrete: X.concrete };
      for (const k of Object.keys(X.curtain)) TEX[`curtain.${k}`] = X.curtain[k];
      for (const k of Object.keys(X.residential)) TEX[`resi.${k}`] = X.residential[k];
      for (const k of Object.keys(X.stone)) TEX[`stone.${k}`] = X.stone[k];

      // ---------------------------------------------------------------- batching (merged per material x chunk)
      const list = D.buildings.filter((b) => !b.container && !ctx.replaced.has(b.id) && b.h - b.min > 0.4);
      list.forEach((b) => {
        let best = b.polys[0];
        b.polys.forEach((p) => { if (K.area(p[0]) > K.area(best[0])) best = p; });
        b.main = best;
        b.outer = K.ccw(K.dedupe(best[0]));
        b.c = [b.outer.reduce((a, p) => a + p[0], 0) / b.outer.length, b.outer.reduce((a, p) => a + p[1], 0) / b.outer.length];
        b.inCore = !!D.boundary && K.pointInRing(b.c, D.boundary);
      });
      const chunks = new Map();
      const add = (matKey, geom, bi, tint) => {
        if (!geom || !geom.getAttribute('position')?.count) return;
        const b = list[bi], key = `${matKey}|${Math.floor(b.c[0] / CHUNK)},${Math.floor(b.c[1] / CHUNK)}`;
        let ch = chunks.get(key);
        if (!ch) chunks.set(key, (ch = { matKey, geoms: [], owners: [] }));
        K.tint(geom, tint);
        ch.geoms.push(geom); ch.owners.push(bi);
      };
      const shiftV = (g, dv) => { const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + dv); };

      // ---------------------------------------------------------------- instancing
      const unitBox = new T.BoxGeometry(1, 1, 1);
      const merlonGeo = (() => {
        const body = new T.BoxGeometry(1, 0.55, 0.32); body.translate(0, 0.275, 0);
        const step = new T.BoxGeometry(0.62, 0.3, 0.32); step.translate(0, 0.7, 0);
        const tip = new T.ConeGeometry(0.22, 0.32, 4); tip.rotateY(Math.PI / 4); tip.translate(0, 1.0, 0);
        return K.merge([body, step, tip]);
      })();
      const beamGeo = (() => { const g = new T.CylinderGeometry(0.08, 0.08, 1, 6); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return g; })();
      const domeGeo = new T.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const mastGeo = (() => { const g = new T.CylinderGeometry(0.12, 0.5, 1, 10); g.translate(0, 0.5, 0); return g; })();
      const tankGeo = (() => { const g = new T.CylinderGeometry(0.5, 0.5, 1, 14); g.translate(0, 0.5, 0); return g; })();
      const minaretGeo = (() => {
        const shaft = new T.CylinderGeometry(0.5, 0.6, 0.78, 12); shaft.translate(0, 0.39, 0);
        const balcony = new T.CylinderGeometry(0.75, 0.6, 0.03, 12); balcony.translate(0, 0.79, 0);
        const lantern = new T.CylinderGeometry(0.4, 0.45, 0.12, 12); lantern.translate(0, 0.87, 0);
        const cone = new T.ConeGeometry(0.42, 0.14, 12); cone.translate(0, 1.0, 0);
        return K.merge([shaft, balcony, lantern, cone]);
      })();
      const latticeMat = new T.MeshStandardMaterial({ map: X.lattice.map, alphaMap: X.lattice.alpha, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.6, metalness: 0.3 });
      const beaconMat = new T.MeshBasicMaterial({ color: 0xff2a1f, transparent: true, opacity: 0, depthWrite: false });
      const INST = {
        fin: { geo: unitBox, mat: plain(0xe8ecef, 0.3, 0.8, { vc: false }), noShadow: true },
        slab: { geo: unitBox, mat: plain(0xf1efea, 0.75, 0.05, { vc: false }), noShadow: true },
        rail: { geo: unitBox, mat: new T.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false }), noShadow: true },
        canopy: { geo: unitBox, mat: plain(0xd9dde0, 0.4, 0.6, { vc: false }) },
        hvac: { geo: unitBox, mat: new T.MeshStandardMaterial({ map: X.louvre.map, color: 0xf2f4f6, roughness: 0.55, metalness: 0.35 }), noShadow: true },
        tank: { geo: tankGeo, mat: plain(0xf4f4f0, 0.5, 0.05, { vc: false }), noShadow: true },
        skylight: { geo: unitBox, mat: plain(0x8fb3c9, 0.06, 0.55, { vc: false, extra: { envMapIntensity: 1.5 } }), noShadow: true },
        merlon: { geo: merlonGeo, mat: plain(0xffffff, 0.92, 0, { vc: false }), noShadow: true },
        beam: { geo: beamGeo, mat: plain(0x5c3e22, 0.85, 0, { vc: false }), noShadow: true },
        windtower: { geo: unitBox, mat: new T.MeshStandardMaterial({ map: X.windTower.map, roughness: 0.9 }) },
        dome: { geo: domeGeo, mat: plain(0xffffff, 0.6, 0.1, { vc: false }) },
        mast: { geo: mastGeo, mat: plain(0xdfe3e7, 0.25, 0.9, { vc: false }) },
        beacon: { geo: new T.SphereGeometry(1, 8, 6), mat: beaconMat, noShadow: true },
        column: { geo: unitBox, mat: new T.MeshStandardMaterial({ map: X.concrete.map, roughness: 0.9 }) },
        craneLattice: { geo: unitBox, mat: latticeMat },
        craneSolid: { geo: unitBox, mat: plain(0xf2c21b, 0.5, 0.3, { vc: false }) },
        weight: { geo: unitBox, mat: new T.MeshStandardMaterial({ map: X.concrete.map, roughness: 0.9 }) },
        minaret: { geo: minaretGeo, mat: plain(0xf3efe6, 0.6, 0.05, { vc: false }) },
        pool: { geo: unitBox, mat: new T.MeshStandardMaterial({ color: 0x3fb7d6, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.3 }), noShadow: true },
        garden: { geo: unitBox, mat: plain(0x5f8f3e, 0.95, 0, { vc: false }) },
      };
      Object.values(INST).forEach((t) => { t.items = []; });
      const q = new T.Quaternion(), yAxis = new T.Vector3(0, 1, 0), mtx = new T.Matrix4(), V = new T.Vector3(), S = new T.Vector3();
      const put = (type, bi, x, y, z, rotY, sx, sy, sz, color) => INST[type].items.push([bi, x, y, z, rotY, sx, sy, sz, color]);

      // ---------------------------------------------------------------- geometry helpers
      const edges = (ring) => ring.map((p, i) => {
        const q2 = ring[(i + 1) % ring.length], dx = q2[0] - p[0], dz = q2[1] - p[1], L = Math.hypot(dx, dz) || 1;
        return { p, q: q2, L, ux: dx / L, uz: dz / L, nx: dz / L, nz: -dx / L, rot: Math.atan2(-dz, dx) };
      });
      const floorH = (b) => (b.estimated ? 3.5 : Math.min(6, Math.max(2.9, (b.h - b.min) / Math.max(1, b.levels))));
      const walls = (bi, poly, y0, y1, key, fh, tint, uOff = 0, vOffFloors = 0) => {
        if (y1 - y0 < 0.05) return;
        const t = TEX[key];
        const vScale = t.floorH || fh * t.floors;
        const g = K.prismPoly(poly, y0, y1, { cap: false, uScale: t.tileW, vScale, uOffset: uOff }).walls;
        if (vOffFloors) shiftV(g, vOffFloors / t.floors);
        add(key, g, bi, tint);
      };
      const capAt = (bi, poly, y, key, tint, down = false) => {
        const rings = [K.ccw(K.dedupe(poly[0])), ...poly.slice(1).map((h) => K.dedupe(h))];
        add(key, K.capPoly(rings, y, 20, down), bi, tint);
      };
      // Roof cap textured with the real aerial photo when the building is low enough and inside an atlas.
      const roofCap = (bi, poly, y, tint) => {
        const b = list[bi];
        if (b.h <= ORTHO_MAX_H) {
          const ai = atlases.findIndex((a) => poly[0].every(([x, z]) => a.covers(x, z)));
          if (ai >= 0) {
            const rings = [K.ccw(K.dedupe(poly[0])), ...poly.slice(1).map((h) => K.dedupe(h))];
            add(`ortho${ai}`, DT.orthoUV(T, K.capPoly(rings, y, 20), atlases[ai]), bi, col(0xffffff));
            b.ortho = true;
            return true;
          }
        }
        add('roof', K.capPoly([K.ccw(K.dedupe(poly[0])), ...poly.slice(1).map((h) => K.dedupe(h))], y, 20), bi, tint);
        return false;
      };
      const parapet = (bi, outer, h, ht, tint, faceKey = 'coping') => {
        if (K.area(outer) < 40) return;
        const inner = K.offsetRing(outer, -0.35);
        add(faceKey, K.prism(outer, h, h + ht, { cap: false, uScale: 4, vScale: 4 }).walls, bi, tint);
        add('coping', K.prismRaw(inner.slice().reverse(), h, h + ht, { uScale: 4, vScale: 4 }), bi, tint);
        add('coping', K.capPoly([outer, inner.slice().reverse()], h + ht, 4), bi, tint);
      };
      const penthouse = (bi, outer, h, ht, key, tint, frac = 0.42) => {
        const ip = K.interiorPoint(outer);
        if (ip.radius < 3.2) return null;
        let ring = null;
        for (const f of [frac, frac * 0.75, frac * 0.55]) {
          const r = K.scaleRing(outer, f, ip.point);
          if (r.every((p) => K.pointInRing(p, outer) && K.distToRing(p, outer) > 1.6)) { ring = r; break; }
        }
        if (!ring) {
          const s = Math.min(ip.radius * 0.65, 9), [px, pz] = ip.point;
          ring = [[px - s, pz - s], [px + s, pz - s], [px + s, pz + s], [px - s, pz + s]];
        }
        const p = K.prism(ring, h, h + ht, { uScale: TEX[key]?.tileW || 6, vScale: TEX[key]?.floorH || 6 });
        add(key, p.walls, bi, tint);
        add('roof', p.cap, bi, tint);
        return ring;
      };
      const roofClutter = (bi, outer, h, avoid, rng, kinds = ['hvac', 'tank']) => {
        if (list[bi].ortho) return; // the photo already shows the real rooftop plant
        const area = K.area(outer);
        const n = Math.min(16, Math.floor(area / 220));
        let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
        outer.forEach(([x, z]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); });
        let placed = 0;
        for (let k = 0; k < n * 6 && placed < n; k++) {
          const p = [minX + rng() * (maxX - minX), minZ + rng() * (maxZ - minZ)];
          if (!K.pointInRing(p, outer) || K.distToRing(p, outer) < 2.2) continue;
          if (avoid && (K.pointInRing(p, avoid) || K.distToRing(p, avoid) < 1.5)) continue;
          const kind = pick(kinds, rng());
          if (kind === 'hvac') put('hvac', bi, p[0], h + 0.7, p[1], rng() * Math.PI, 2.2 + rng() * 1.5, 1.4, 1.3 + rng());
          else put('tank', bi, p[0], h, p[1], 0, 1.6 + rng() * 0.8, 1.6 + rng() * 0.6, 1.6 + rng() * 0.8);
          placed++;
        }
      };
      const beacons = (bi, outer, y) => {
        // aviation obstruction lights at the extreme corners
        const c = list[bi].c;
        const far = outer.map((p) => [Math.hypot(p[0] - c[0], p[1] - c[1]), p]).sort((a, b) => b[0] - a[0]).slice(0, 4);
        far.forEach(([, p]) => put('beacon', bi, p[0], y + 0.6, p[1], 0, 0.45, 0.45, 0.45));
      };

      // ---------------------------------------------------------------- style classification
      const oldTownSeeds = list.filter((b) => OLD_TOWN.test(b.name || '')).map((b) => b.c);
      const nearOldTown = (c) => oldTownSeeds.some((s) => Math.hypot(s[0] - c[0], s[1] - c[1]) < 70);
      const classify = (b) => {
        const name = b.name || '', kind = b.kind, h = b.h, area = K.area(b.outer);
        if (kind === 'construction') return 'construction';
        if (kind === 'mosque' || b.use === 'place_of_worship') return 'mosque';
        if (kind === 'train_station') return 'station';
        if (kind === 'roof') return 'canopy';
        if (h <= 4.5 && area < 150) return 'kiosk';
        if (OLD_TOWN.test(name) || (h <= 50 && nearOldTown(b.c))) return 'arabic';
        if (h >= 55) {
          if (b.material === 'glass' || ['commercial', 'office', 'hotel'].includes(kind) || /hotel|address|plaza|office|emaar|tower [ab]$|hikma|distinction|primo|opera grand/i.test(name)) {
            return /residence|apartments|heights|vista|views|lofts|ridge|claren|burj residences/i.test(name) ? 'residential' : 'glass';
          }
          if (['apartments', 'residential'].includes(kind) || /residence|heights|vista|views|lofts|ridge|claren|boulevard|standpoint|stand point|walk|tower/i.test(name)) return 'residential';
          return hash(b.id) < 0.66 ? 'glass' : 'residential';
        }
        if (area > 2600 && h <= 36) return 'podium';
        if (['retail', 'parking', 'commercial', 'industrial', 'service'].includes(kind) && h <= 30) return 'podium';
        if (h <= 14 && area <= 1400 && !b.inCore && ['yes', 'house', 'residential', 'apartments', 'detached', 'villa', 'semidetached_house', 'terrace'].includes(kind)) return 'villa';
        if (h <= 13) return 'lowrise';
        return 'midrise';
      };

      // ---------------------------------------------------------------- generators
      const GEN = {
        glass(b, bi, r) {
          const variant = b.colour && /#14255B/i.test(b.colour) ? 'navy' : pick(['blue', 'dark', 'navy', 'silver', 'green', 'dark', 'bronze', 'blue'], hash(b.id, 1));
          const key = `curtain.${variant}`, fh = floorH(b), tint = col(0xffffff), uOff = r();
          const ground = b.min < 0.5, base = ground ? Math.min(b.h * 0.25, fh * 2 + 1.5) : b.min;
          const top = b.h;
          b.polys.forEach((poly) => {
            if (ground) walls(bi, poly, 0, base, 'retail', fh, tint, uOff);
            else capAt(bi, poly, b.min, 'coping', tint, true);
            // shaft with mechanical floors every 12-16 storeys on supertalls
            const mechEvery = top - base > 140 ? (12 + Math.floor(hash(b.id, 2) * 5)) * fh : Infinity;
            let y = base;
            while (y < top - 0.01) {
              const next = Math.min(top, y + mechEvery);
              walls(bi, poly, y, next, key, fh, tint, uOff);
              if (next < top - fh * 3) { walls(bi, poly, next, next + fh * 1.5, 'louvre', fh, tint, uOff); y = next + fh * 1.5; } else y = next;
            }
          });
          const outer = b.outer, E = edges(outer);
          // slab-edge bands every 5 floors catch the light as horizontal lines
          for (let y = base + fh * 5; y < top - fh; y += fh * 5) add('trim', K.prism(K.offsetRing(outer, 0.16), y, y + 0.32, { cap: false, uScale: 4, vScale: 4 }).walls, bi, tint);
          // vertical fins / mullion caps
          const finSpacing = hash(b.id, 3) < 0.35 ? 0 : 3 + hash(b.id, 4) * 4;
          if (finSpacing) E.forEach((e) => {
            const n = Math.floor(e.L / finSpacing);
            for (let k = 0; k <= n; k++) {
              const t = n ? k / n : 0.5, x = e.p[0] + e.ux * e.L * t + e.nx * 0.3, z = e.p[1] + e.uz * e.L * t + e.nz * 0.3;
              put('fin', bi, x, (base + top) / 2, z, e.rot, 0.28, top - base, 0.6);
            }
          });
          // entrance canopy on the longest street edge
          if (ground) {
            const e = E.reduce((a, c) => (c.L > a.L ? c : a));
            put('canopy', bi, e.p[0] + e.ux * e.L / 2 + e.nx * 2.2, base - 1.2, e.p[1] + e.uz * e.L / 2 + e.nz * 2.2, e.rot, Math.min(e.L * 0.5, 14), 0.4, 4.4);
          }
          // crown
          const crownType = top > 200 ? 'spire' : pick(['flat', 'screen', 'flat', 'lantern'], hash(b.id, 5));
          let roofY = top;
          if (crownType === 'screen') {
            // facade continues as an open screen above the roof, lit at night
            add('crown', K.prism(outer, top, top + fh * 2, { cap: false, uScale: 4, vScale: 4 }).walls, bi, tint);
            add('coping', K.prismRaw(outer.slice().reverse(), top, top + fh * 2, { uScale: 4, vScale: 4 }), bi, tint);
          } else {
            parapet(bi, outer, top, 1.3, tint, top > 100 ? 'crown' : 'coping');
          }
          roofCap(bi, b.main, top, tint);
          let ph = null;
          if (crownType === 'lantern' && K.area(outer) > 400) {
            const inset = K.offsetRing(outer, -2.4);
            if (inset.every((p) => K.pointInRing(p, outer))) {
              walls(bi, [inset], top, top + fh * 2, key, fh, tint, uOff);
              add('crown', K.prism(K.offsetRing(inset, 0.1), top + fh * 2, top + fh * 2 + 0.8, { cap: false, uScale: 4, vScale: 4 }).walls, bi, tint);
              capAt(bi, [inset], top + fh * 2, 'roof', tint);
              roofY = top + fh * 2; ph = inset;
            }
          }
          if (!ph) ph = penthouse(bi, outer, top, 4.6, 'louvre', tint);
          if (ph) {
            const ip = K.interiorPoint(ph);
            if (top > 160) put('mast', bi, ip.point[0], roofY + 4.6, ip.point[1], 0, 1.2, crownType === 'spire' ? top * 0.12 : 8, 1.2);
            // building maintenance unit (gantry crane) on the roof
            const e = edges(outer).reduce((a, c) => (c.L > a.L ? c : a));
            put('fin', bi, e.p[0] + e.ux * e.L * 0.3 - e.nx * 3, roofY + 2.4, e.p[1] + e.uz * e.L * 0.3 - e.nz * 3, e.rot, 1.2, 3, 1.2);
            put('fin', bi, e.p[0] + e.ux * e.L * 0.3 - e.nx * 1.5, roofY + 4, e.p[1] + e.uz * e.L * 0.3 - e.nz * 1.5, e.rot + Math.PI / 2, 0.6, 0.6, 7);
          }
          roofClutter(bi, outer, top, ph, r, ['hvac']);
          if (top > 120) beacons(bi, outer, roofY + 1.3);
        },

        residential(b, bi, r) {
          const variant = pick(['grey', 'cream', 'sand', 'white', 'grey'], hash(b.id, 1));
          const key = `resi.${variant}`, fh = floorH(b), tint = col(0xffffff), uOff = r();
          const ground = b.min < 0.5, base = ground ? Math.min(b.h * 0.2, fh * 2 + 1) : b.min, top = b.h;
          b.polys.forEach((poly) => {
            if (ground) walls(bi, poly, 0, base, 'retail', fh, tint, uOff);
            else capAt(bi, poly, b.min, 'coping', tint, true);
            walls(bi, poly, base, top, key, fh, tint, uOff, Math.floor(r() * 4));
          });
          // balconies: slab + glass balustrade on every floor, pattern per building
          const pattern = b.inCore ? pick(['continuous', 'bays', 'corners'], hash(b.id, 6)) : 'continuous', depth = 1.3 + hash(b.id, 7) * 0.6;
          const E = edges(b.outer).filter((e) => e.L >= 5);
          let count = 0;
          for (let y = base + fh; y < top - fh * 0.6 && count < 2400; y += fh) {
            E.forEach((e) => {
              const segs = [];
              if (pattern === 'continuous') segs.push([0.6, e.L - 0.6]);
              else if (pattern === 'bays') for (let s = 0.8; s + 3.6 <= e.L - 0.5; s += 6.2) segs.push([s, s + 3.6]);
              else { segs.push([0.4, Math.min(4.2, e.L / 2 - 0.2)]); if (e.L > 9) segs.push([e.L - Math.min(4.2, e.L / 2 - 0.2), e.L - 0.4]); }
              segs.forEach(([a, c]) => {
                const L = c - a, m = (a + c) / 2;
                const x = e.p[0] + e.ux * m, z = e.p[1] + e.uz * m;
                put('slab', bi, x + e.nx * depth / 2, y, z + e.nz * depth / 2, e.rot, L, 0.24, depth);
                if (b.inCore) put('rail', bi, x + e.nx * (depth - 0.03), y + 0.62, z + e.nz * (depth - 0.03), e.rot, L, 1.0, 0.04);
                count++;
              });
            });
          }
          parapet(bi, b.outer, top, 1.2, tint, top > 120 ? 'crown' : 'coping');
          roofCap(bi, b.main, top, tint);
          const ph = penthouse(bi, b.outer, top, 4.2, key, tint, 0.38);
          if (hash(b.id, 8) < 0.3 && K.area(b.outer) > 600) {
            // roof terrace pool beside the plant room
            const ip = K.interiorPoint(b.outer), s = Math.min(ip.radius * 0.5, 6);
            const [px, pz] = ip.point;
            if (!ph || !K.pointInRing([px + s * 1.6, pz], ph)) put('pool', bi, px + s * 1.6, top + 0.15, pz, 0, s * 1.4, 0.3, s * 0.8);
          }
          roofClutter(bi, b.outer, top, ph, r);
          if (top > 120) beacons(bi, b.outer, top + 1.2);
        },

        midrise(b, bi, r) {
          const resi = ['apartments', 'residential'].includes(b.kind) || hash(b.id, 9) < 0.45;
          const key = resi ? `resi.${pick(['cream', 'sand', 'white'], hash(b.id, 1))}` : `stone.${pick(['beige', 'light'], hash(b.id, 1))}`;
          const fh = floorH(b), tint = col(0xffffff), uOff = r(), ground = b.min < 0.5;
          b.polys.forEach((poly) => {
            const base = ground && b.h > 10 ? Math.min(5.5, b.h * 0.3) : b.min;
            if (ground && b.h > 10) walls(bi, poly, 0, base, 'retail', fh, tint, uOff);
            else if (!ground) capAt(bi, poly, b.min, 'coping', tint, true);
            walls(bi, poly, base, b.h, key, fh, tint, uOff);
          });
          add('coping', K.prism(K.offsetRing(b.outer, 0.3), b.h - 0.9, b.h - 0.4, { cap: false, uScale: 4, vScale: 4 }).walls, bi, tint); // cornice
          parapet(bi, b.outer, b.h, 1.0, tint);
          roofCap(bi, b.main, b.h, tint);
          const ph = penthouse(bi, b.outer, b.h, 3.2, 'louvre', tint, 0.3);
          roofClutter(bi, b.outer, b.h, ph, r);
        },

        lowrise(b, bi, r) { GEN.midrise(b, bi, r); },

        villa(b, bi, r) {
          // light level of detail for the thousands of houses around the district: walls, parapet band, real roof
          const key = `resi.${pick(['white', 'cream', 'sand', 'cream'], hash(b.id, 1))}`, tint = col(0xffffff);
          b.polys.forEach((poly) => walls(bi, poly, b.min, b.h, key, 3.6, tint, r()));
          if (K.area(b.outer) > 40) {
            add('coping', K.prism(b.outer, b.h, b.h + 0.8, { cap: false, uScale: 4, vScale: 4 }).walls, bi, tint);
            add('coping', K.capPoly([b.outer, K.offsetRing(b.outer, -0.3).reverse()], b.h + 0.8, 4), bi, tint);
          }
          roofCap(bi, b.main, b.h + 0.05, tint);
        },

        kiosk(b, bi) {
          const tint = col(0xffffff);
          b.polys.forEach((poly) => walls(bi, poly, b.min, b.h, 'retail', 3.5, tint, 0));
          capAt(bi, b.main, b.h, 'coping', tint);
          add('coping', K.prism(K.offsetRing(b.outer, 0.6), b.h, b.h + 0.35, { uScale: 4, vScale: 4 }).walls, bi, tint);
          capAt(bi, [K.offsetRing(b.outer, 0.6)], b.h + 0.35, 'coping', tint);
        },

        podium(b, bi, r) {
          const tint = col(0xffffff), uOff = r(), fh = floorH(b), ground = b.min < 0.5;
          const upper = b.kind === 'parking' || hash(b.id, 10) < 0.5 ? 'screen' : pick(['stone.beige', 'louvre', 'stone.light'], hash(b.id, 11));
          b.polys.forEach((poly) => {
            const base = ground ? Math.min(6, b.h) : b.min;
            if (ground) walls(bi, poly, 0, base, 'retail', 6, tint, uOff);
            else capAt(bi, poly, b.min, 'coping', tint, true);
            if (b.h > base + 0.2) {
              if (upper === 'screen') walls(bi, poly, base, b.h, 'concrete', fh, tint, uOff);
              walls(bi, poly.map((ring, i) => (i === 0 ? K.offsetRing(ring, 0.4) : ring)), base, b.h, upper, fh, tint, uOff);
            }
          });
          parapet(bi, b.outer, b.h, 1.0, tint);
          b.polys.forEach((poly) => roofCap(bi, poly, b.h, tint));
          // skylight rows over retail podiums, plant on the rest
          if (!b.ortho && b.kind !== 'parking' && K.area(b.outer) > 1500) {
            const E = edges(b.outer).reduce((a, c) => (c.L > a.L ? c : a));
            let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
            b.outer.forEach(([x, z]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); });
            for (let x = minX + 8; x < maxX - 8; x += 14) for (let z = minZ + 8; z < maxZ - 8; z += 9) {
              if (K.pointInRing([x, z], b.outer) && K.distToRing([x, z], b.outer) > 6 && r() < 0.28) put('skylight', bi, x, b.h + 0.45, z, E.rot, 8, 0.9, 3);
            }
          }
          roofClutter(bi, b.outer, b.h, null, r, ['hvac', 'hvac', 'tank']);
        },

        arabic(b, bi, r) {
          const tones = ['#e9d8b4', '#e2c9a0', '#efe2c6', '#dcc092', '#e6d0a8'];
          const tint = col(pick(tones, hash(b.id, 12))), fh = Math.min(4.5, floorH(b)), uOff = r(), ground = b.min < 0.5;
          b.polys.forEach((poly) => {
            const base = ground && b.h > 7 ? Math.min(5, b.h * 0.35) : b.min;
            if (ground && b.h > 7) walls(bi, poly, 0, base, 'arcade', base, tint, uOff);
            else if (!ground) capAt(bi, poly, b.min, 'stucco', tint, true);
            walls(bi, poly, base, b.h, 'arabic', fh, tint, uOff);
          });
          const outer = b.outer, E = edges(outer);
          // parapet with crenellations, timber beam ends below it
          add('stucco', K.prism(outer, b.h, b.h + 0.9, { cap: false, uScale: 4, vScale: 4 }).walls, bi, tint);
          const inner = K.offsetRing(outer, -0.35);
          add('stucco', K.prismRaw(inner.slice().reverse(), b.h, b.h + 0.9, { uScale: 4, vScale: 4 }), bi, tint);
          add('stucco', K.capPoly([outer, inner.slice().reverse()], b.h + 0.9, 4), bi, tint);
          roofCap(bi, b.main, b.h, tint);
          E.forEach((e) => {
            const n = Math.floor(e.L / 1.15);
            for (let k = 0; k < n; k++) {
              const t = (k + 0.5) / n, x = e.p[0] + e.ux * e.L * t - e.nx * 0.17, z = e.p[1] + e.uz * e.L * t - e.nz * 0.17;
              put('merlon', bi, x, b.h + 0.9, z, e.rot, 0.7, 0.75, 1, tint);
            }
            const nb = Math.floor(e.L / 0.95);
            for (let k = 1; k < nb; k++) {
              const t = k / nb;
              put('beam', bi, e.p[0] + e.ux * e.L * t, b.h - 0.7, e.p[1] + e.uz * e.L * t, Math.atan2(e.nx, e.nz), 1, 1, 0.55);
            }
          });
          // wind towers (barjeel) and occasional domes
          const area = K.area(outer);
          if (area > 220 && b.h < 60) {
            const ip = K.interiorPoint(outer);
            const n = area > 900 ? 2 : 1;
            for (let k = 0; k < n; k++) {
              const ang = r() * Math.PI * 2, d = Math.min(ip.radius * 0.55, 8) * k;
              const x = ip.point[0] + Math.cos(ang) * d, z = ip.point[1] + Math.sin(ang) * d;
              const w = 2.6 + r() * 0.9, ht = 5 + r() * 2.5, rot = E[0].rot;
              put('windtower', bi, x, b.h + ht / 2, z, rot, w, ht, w, tint);
              for (let side = 0; side < 4; side++) {
                const a = rot + side * Math.PI / 2, cx = Math.sin(a) * (w / 2 - 0.16), cz = Math.cos(a) * (w / 2 - 0.16);
                for (let m = -1; m <= 1; m++) put('merlon', bi, x + cx + Math.cos(a) * m * w * 0.3, b.h + ht, z + cz - Math.sin(a) * m * w * 0.3, a + Math.PI / 2, 0.55, 0.6, 1, tint);
              }
            }
          }
          if ((/souk|palace|manzil|qamardeen/i.test(b.name || '') || hash(b.id, 13) < 0.12) && area > 350) {
            const ip = K.interiorPoint(outer), rad = Math.min(ip.radius * 0.6, 7);
            put('dome', bi, ip.point[0], b.h + 0.9, ip.point[1], 0, rad, rad * 0.95, rad, tint);
          }
        },

        construction(b, bi, r) {
          const fh = 3.6, tint = col(0xffffff), progress = 0.55 + hash(b.id, 14) * 0.35, topY = Math.max(fh * 3, b.h * progress);
          const ip = K.interiorPoint(b.outer), coreS = Math.max(3, Math.min(ip.radius * 0.45, 9));
          const core = [[ip.point[0] - coreS, ip.point[1] - coreS], [ip.point[0] + coreS, ip.point[1] - coreS], [ip.point[0] + coreS, ip.point[1] + coreS], [ip.point[0] - coreS, ip.point[1] + coreS]];
          const cp = K.prism(core, 0, topY + fh * 2, { uScale: 6, vScale: 6 });
          add('concrete', cp.walls, bi, tint); add('concrete', cp.cap, bi, tint);
          for (let y = fh; y <= topY; y += fh) {
            const s = K.prismPoly(b.main, y - 0.3, y, { uScale: 6, vScale: 6 });
            add('concrete', s.walls, bi, tint); add('concrete', s.cap, bi, tint);
          }
          const glazed = topY * (0.35 + hash(b.id, 15) * 0.3);
          walls(bi, b.main, 0, glazed, 'curtain.blue', fh, tint, r());
          const step = Math.max(1, Math.floor(b.outer.length / 28));
          for (let i = 0; i < b.outer.length; i += step) {
            const p = K.offsetRing(b.outer, -0.6)[i];
            put('column', bi, p[0], glazed + (topY - glazed) / 2, p[1], 0, 0.7, topY - glazed, 0.7);
          }
          // tower crane: lattice mast, jib, counter-jib, counterweight, cab and beacon
          const H = topY + 30, rot = r() * Math.PI * 2, cx = ip.point[0] + coreS + 3, cz = ip.point[1];
          put('craneLattice', bi, cx, H / 2, cz, rot, 2, H, 2);
          const jib = 45 + r() * 20, cj = 16;
          put('craneLattice', bi, cx + Math.cos(rot) * jib / 2, H + 1, cz - Math.sin(rot) * jib / 2, rot, jib, 1.8, 1.6);
          put('craneLattice', bi, cx - Math.cos(rot) * cj / 2, H + 1, cz + Math.sin(rot) * cj / 2, rot, cj, 1.6, 1.6);
          put('weight', bi, cx - Math.cos(rot) * (cj - 2), H - 0.4, cz + Math.sin(rot) * (cj - 2), rot, 3, 2.4, 2.6);
          put('craneSolid', bi, cx + Math.cos(rot) * 1.5, H - 1.2, cz - Math.sin(rot) * 1.5, rot, 2.2, 2.2, 2.2);
          put('craneLattice', bi, cx, H + 5, cz, rot, 1.4, 8, 1.4);
          put('beacon', bi, cx, H + 9.4, cz, 0, 0.5, 0.5, 0.5);
        },

        mosque(b, bi, r) {
          const tint = col(0xf3ede0), fh = 4.5;
          b.polys.forEach((poly) => walls(bi, poly, b.min, b.h, 'stone.light', fh, tint, r()));
          parapet(bi, b.outer, b.h, 0.9, tint);
          roofCap(bi, b.main, b.h, tint);
          const ip = K.interiorPoint(b.outer), rad = Math.min(ip.radius * 0.8, 11);
          put('dome', bi, ip.point[0], b.h, ip.point[1], 0, rad, rad * 1.05, rad, col(0xf6f3ec));
          const corner = b.outer.reduce((a, p) => (Math.hypot(p[0] - ip.point[0], p[1] - ip.point[1]) > Math.hypot(a[0] - ip.point[0], a[1] - ip.point[1]) ? p : a));
          const mx = corner[0] + (ip.point[0] - corner[0]) * 0.12, mz = corner[1] + (ip.point[1] - corner[1]) * 0.12;
          put('minaret', bi, mx, 0, mz, 0, 3.4, Math.max(28, b.h * 2.6), 3.4);
        },

        station(b, bi) {
          // Dubai Metro station: golden ribbed shell over the elevated platform
          const ring = b.outer;
          let sxx = 0, szz = 0, sxz = 0;
          ring.forEach(([x, z]) => { sxx += (x - b.c[0]) ** 2; szz += (z - b.c[1]) ** 2; sxz += (x - b.c[0]) * (z - b.c[1]); });
          const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), ax = [Math.cos(th), Math.sin(th)], pr = [-ax[1], ax[0]];
          const along = ring.map(([x, z]) => (x - b.c[0]) * ax[0] + (z - b.c[1]) * ax[1]), across = ring.map(([x, z]) => (x - b.c[0]) * pr[0] + (z - b.c[1]) * pr[1]);
          const L = Math.max(...along) - Math.min(...along), W = Math.max(...across) - Math.min(...across), y0 = 7;
          const rows = [];
          for (let i = 0; i <= 40; i++) {
            const s = i / 40, a = (s - 0.5) * L, taper = Math.sin(Math.PI * Math.min(1, s * 1.2, (1 - s) * 1.2) / 1) ** 0.5;
            rows.push(Array.from({ length: 25 }, (_, j) => {
              const t = j / 24, ang = Math.PI * t, w = (W / 2) * (0.6 + 0.4 * taper);
              const c = Math.cos(ang) * w, hgt = Math.sin(ang) * W * 0.5 * (0.4 + 0.6 * taper);
              return new T.Vector3(b.c[0] + ax[0] * a + pr[0] * c, y0 + hgt, b.c[1] + ax[1] * a + pr[1] * c);
            }));
          }
          const g = K.gridSurface(rows);
          add('shell', g, bi, col(0xffffff));
          const back = K.gridSurface(rows.map((row) => row.slice().reverse()));
          add('shell', back, bi, col(0xb08a55));
          walls(bi, b.main, 0, y0, 'concrete', 3.5, col(0xffffff), 0);
          capAt(bi, b.main, y0, 'coping', col(0xffffff));
        },

        canopy(b, bi) {
          const tint = col(0xffffff), y = Math.max(4, b.h);
          const s = K.prismPoly(b.main, y - 0.5, y, { uScale: 4, vScale: 4 });
          add('trim', s.walls, bi, tint); add('trim', s.cap, bi, tint); capAt(bi, b.main, y - 0.5, 'trim', tint, true);
          const step = Math.max(1, Math.floor(b.outer.length / 10));
          for (let i = 0; i < b.outer.length; i += step) { const p = K.offsetRing(b.outer, -0.8)[i]; put('column', bi, p[0], (y - 0.5) / 2, p[1], 0, 0.45, y - 0.5, 0.45); }
        },
      };

      // ---------------------------------------------------------------- build every building
      const styles = new Map();
      list.forEach((b, bi) => {
        const style = classify(b);
        styles.set(bi, style);
        try { GEN[style](b, bi, K.rng(Math.floor(hash(b.id) * 1e9))); }
        catch (err) { console.warn('[twin] building failed', b.id, b.name, err); }
      });

      // ---------------------------------------------------------------- finalise meshes
      for (const ch of chunks.values()) {
        const ranges = [];
        let tri = 0;
        ch.geoms.forEach((g, k) => {
          const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
          ranges.push([tri, tri + n, ch.owners[k]]); tri += n;
        });
        const mesh = new T.Mesh(K.merge(ch.geoms, { colors: true }), M[ch.matKey]);
        mesh.userData.ranges = ranges;
        if (ch.matKey === 'roof' || ch.matKey === 'coping') mesh.castShadow = true;
        group.add(mesh); pickables.push(mesh);
      }
      let instances = 0;
      for (const [type, spec] of Object.entries(INST)) {
        if (!spec.items.length) continue;
        const im = new T.InstancedMesh(spec.geo, spec.mat, spec.items.length);
        const owners = new Int32Array(spec.items.length);
        spec.items.forEach(([bi, x, y, z, rot, sx, sy, sz, color], i) => {
          q.setFromAxisAngle(yAxis, rot);
          mtx.compose(V.set(x, y, z), q, S.set(sx, sy, sz));
          im.setMatrixAt(i, mtx);
          if (color) im.setColorAt(i, color);
          owners[i] = bi;
        });
        if (spec.items.some((it) => it[8])) spec.items.forEach((it, i) => { if (!it[8]) im.setColorAt(i, col(0xffffff)); });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        im.userData.owners = owners;
        if (spec.noShadow) im.userData.noShadow = true;
        group.add(im);
        if (type !== 'rail' && type !== 'beacon') pickables.push(im);
        instances += spec.items.length;
      }
      const counts = {};
      styles.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
      console.log(`[twin] downtown fabric: ${list.length} buildings ${JSON.stringify(counts)}, ${chunks.size} merged meshes, ${instances} instances in ${Math.round(performance.now() - t0)} ms`);

      const ownerOf = (hit) => {
        if (hit.object.userData.owners) return hit.object.userData.owners[hit.instanceId];
        const ranges = hit.object.userData.ranges;
        if (!ranges) return -1;
        let lo = 0, hi = ranges.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1, [a, c] = ranges[mid];
          if (hit.faceIndex < a) hi = mid - 1; else if (hit.faceIndex >= c) lo = mid + 1; else return ranges[mid][2];
        }
        return -1;
      };

      return {
        group,
        pickables,
        pick(hit) {
          const bi = ownerOf(hit);
          const b = list[bi];
          if (!b) return null;
          const style = styles.get(bi);
          return {
            title: b.name || STYLE_LABEL[style],
            eyebrow: `Downtown building · ${STYLE_LABEL[style]}`,
            rows: [
              ['Height', `${b.h} m${b.estimated ? ' (estimated)' : ''}`],
              ['Floors', b.levels],
              ['Footprint', `${b.area.toLocaleString('en-US')} m²`],
              ['OSM type', b.kind === 'part' ? 'building part' : `building=${b.kind}`],
            ],
            osm: b.id, local: b.c, height: b.h,
            note: 'Procedural detailed model: footprint, height and floors from OpenStreetMap; facade, balconies, crown and roof plant generated from the building type.',
          };
        },
        setTheme(theme) {
          const n = theme === 'night', d = theme === 'dusk';
          night.forEach(([m, kn, kd]) => { m.emissiveIntensity = n ? kn : d ? kd : 0; });
          M.crown.emissiveIntensity = n ? 1.4 : d ? 0.2 : 0;
          atlases.forEach((a, i) => M[`ortho${i}`].color.set(n ? 0x4a5162 : d ? 0xd2b294 : 0xcfcfcf));
        },
        animate(t, theme) {
          const on = theme === 'night' || theme === 'dusk';
          beaconMat.opacity = on ? (Math.sin(t * Math.PI * 1.2) > 0.1 ? 1 : 0.12) : 0;
          return on;
        },
      };
    },
  };
})();
