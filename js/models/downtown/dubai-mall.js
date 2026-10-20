/* The Dubai Mall: the full OSM footprint (about 250,000 m² of plan) as a stone-clad four-level mall with glazed
 * waterfront terraces where it meets Burj Khalifa Lake, portal entrances with canopies and gold lettering on the
 * long street elevations, barrel-vault skylights over the malls and the Grand Atrium dome. */
(function () {
  'use strict';

  const MALL = 'r18195959';

  DT.MODEL_DEFS['dubai-mall'] = {
    district: 'downtown',
    replaces: [MALL],
    title: 'The Dubai Mall',
    eyebrow: 'Detailed 3D model · Retail',
    desc: 'One of the world\'s largest malls, with over 1,200 shops, the Dubai Aquarium and an Olympic ice rink. Its waterfront terraces face the Dubai Fountain and the lake.',
    facts: [
      ['Gross area', '≈ 1.1 million m² (502,000 m² leasable)'],
      ['Stores', '1,200+'],
      ['Visitors', '≈ 105 million a year'],
      ['Highlights', 'Dubai Aquarium, Ice Rink, Waterfall atrium, Souk'],
      ['Developer', 'Emaar Properties'],
      ['Opened', '4 November 2008'],
    ],
    height: 26,
    shadow: { mapSize: 2048 },
    ground: 1200,

    build(K, T, D, ctx) {
      const b = ctx.building(MALL);
      if (!b) throw new Error('Dubai Mall footprint missing');
      const X = DT.downtownTextures(K, T, ctx.aniso);
      const H = 24, rng = K.rng(2008);
      const group = new T.Group();
      const outer = K.ccw(K.dedupe(b.polys[0][0]));
      const lake = D.env.water.find((w) => w.name === 'Burj Khalifa Lake')?.polys[0][0] || null;

      // ---------------------------------------------------------- materials
      const stoneTex = K.texture(K.canvas(1024, 1024, (c, w, h) => {
        // 12 m x 12 m: limestone panels 1.5 x 1.2 m, deep reveal at each 6 m level, vertical joints staggered
        c.fillStyle = '#ddcfb4'; c.fillRect(0, 0, w, h);
        const r = K.rng(7), pw = w / 8, ph = h / 10;
        for (let j = 0; j < 10; j++) for (let i = 0; i < 8; i++) {
          const k = 0.94 + r() * 0.1;
          c.fillStyle = `rgb(${221 * k | 0},${207 * k | 0},${180 * k | 0})`;
          c.fillRect(i * pw + 2 + (j % 2) * 0, j * ph + 2, pw - 4, ph - 4);
        }
        const img = c.getImageData(0, 0, w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 12; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        c.putImageData(img, 0, 0);
        [0.5, 1].forEach((f) => { c.fillStyle = 'rgba(70,55,35,0.55)'; c.fillRect(0, h * f - 14, w, 14); c.fillStyle = 'rgba(255,250,240,0.4)'; c.fillRect(0, h * f - 18, w, 4); });
      }), { anisotropy: ctx.aniso });
      const stone = new T.MeshStandardMaterial({ map: stoneTex, roughness: 0.85, metalness: 0 });
      const glassT = X.curtain.silver;
      const glass = new T.MeshStandardMaterial({ map: glassT.map, roughnessMap: glassT.rm, metalnessMap: glassT.rm, roughness: 1, metalness: 1, emissiveMap: glassT.emissive, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.2 });
      const shopT = X.retail;
      const shop = new T.MeshStandardMaterial({ map: shopT.map, roughnessMap: shopT.rm, metalnessMap: shopT.rm, roughness: 1, metalness: 1, emissiveMap: shopT.emissive, emissive: 0xffffff, emissiveIntensity: 0 });
      const trim = new T.MeshStandardMaterial({ color: 0xece6da, roughness: 0.6, metalness: 0.05 });
      const roofMat = new T.MeshStandardMaterial({ map: X.roof.map, roughness: 0.95 });
      const skyGlass = new T.MeshStandardMaterial({ color: 0x9fc1d6, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.5, emissive: 0xfff0d8, emissiveIntensity: 0, side: T.DoubleSide });
      const steel = new T.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.35, metalness: 0.8 });
      const timber = new T.MeshStandardMaterial({ color: 0x8a5d3b, roughness: 0.75 });
      const fabric = new T.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.9, side: T.DoubleSide });
      const railGlass = new T.MeshStandardMaterial({ color: 0xa8cde0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false });

      // ---------------------------------------------------------- elevations, edge by edge
      const stoneG = [], glassG = [], shopG = [], trimG = [];
      const fins = [], slabs = [], rails = [], pergola = [], umbrellas = [], poles = [], canopyRows = [], columns = [];
      const portals = [];
      let u = 0;
      const n = outer.length;
      const edges = outer.map((p, i) => {
        const q = outer[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        return { p, q, L, ux: dx / L, uz: dz / L, nx: dz / L, nz: -dx / L, rot: Math.atan2(-dz, dx), mid, water: lake ? K.distToRing(mid, lake) < 48 || K.pointInRing(mid, lake) : false };
      });
      // the longest dry edges get the grand entrances
      edges.filter((e) => !e.water && e.L > 45).sort((a, b2) => b2.L - a.L).slice(0, 7).forEach((e) => { e.portal = true; });

      for (const e of edges) {
        const o = { uScale: 12, vScale: 12, u0: u };
        if (e.water) {
          // waterfront: glazed shopfronts at the promenade, glazed terraces above, timber pergolas and umbrellas
          shopG.push(K.wall(e.p, e.q, 0, 7, { uScale: 10, vScale: 7, u0: u }));
          glassG.push(K.wall(e.p, e.q, 7, H, { uScale: 12, vScale: 15.6, u0: u }));
          const span = e.L - 1;
          [7, 14].forEach((y) => {
            const x = e.mid[0] + e.nx * 2.2, z = e.mid[1] + e.nz * 2.2;
            slabs.push([x, y, z, e.rot, span, 0.35, 4.4]);
            rails.push([e.mid[0] + e.nx * 4.35, y + 0.75, e.mid[1] + e.nz * 4.35, e.rot, span, 1.1, 0.05]);
          });
          for (let s = 1.2; s < e.L - 1; s += 1.6) pergola.push([e.p[0] + e.ux * s + e.nx * 2.2, 21.5, e.p[1] + e.uz * s + e.nz * 2.2, e.rot + Math.PI / 2, 0.16, 0.45, 4.4]);
          for (let s = 4; s < e.L - 3; s += 7) {
            const x = e.p[0] + e.ux * s + e.nx * 8, z = e.p[1] + e.uz * s + e.nz * 8;
            umbrellas.push([x, 2.6, z, rng() * 3, 1.6, 0.9, 1.6]);
            poles.push([x, 1.3, z, 0, 0.06, 2.6, 0.06]);
          }
        } else {
          stoneG.push(K.wall(e.p, e.q, 0, H, o));
          // shallow pilasters every 12 m give the long stone elevations depth
          for (let s = 6; s < e.L - 2; s += 12) fins.push([e.p[0] + e.ux * s + e.nx * 0.45, H / 2, e.p[1] + e.uz * s + e.nz * 0.45, e.rot, 1.1, H, 0.9]);
          if (e.portal) portals.push(e);
        }
        u += e.L;
      }

      // ---------------------------------------------------------- entrance portals
      const signs = [];
      portals.forEach((e) => {
        const W = Math.min(26, e.L * 0.45), D2 = 5, PH = H + 4, m = e.L / 2;
        const a = [e.p[0] + e.ux * (m - W / 2) + e.nx * D2, e.p[1] + e.uz * (m - W / 2) + e.nz * D2];
        const c = [e.p[0] + e.ux * (m + W / 2) + e.nx * D2, e.p[1] + e.uz * (m + W / 2) + e.nz * D2];
        const a0 = [e.p[0] + e.ux * (m - W / 2), e.p[1] + e.uz * (m - W / 2)], c0 = [e.p[0] + e.ux * (m + W / 2), e.p[1] + e.uz * (m + W / 2)];
        glassG.push(K.wall(a, c, 0, PH - 4, { uScale: 12, vScale: 15.6 }));
        trimG.push(K.wall(a, c, PH - 4, PH, { uScale: 4, vScale: 4 }));
        trimG.push(K.wall(a0, a, 0, PH, { uScale: 4, vScale: 4 }), K.wall(c, c0, 0, PH, { uScale: 4, vScale: 4 }));
        trimG.push(K.capPoly([[a0, a, c, c0]], PH, 4));
        // canopy on slender columns
        const cx = e.p[0] + e.ux * m + e.nx * (D2 + 6), cz = e.p[1] + e.uz * m + e.nz * (D2 + 6);
        canopyRows.push([cx, 7.5, cz, e.rot, W + 8, 0.5, 13]);
        [-1, 1].forEach((sd) => columns.push([cx + e.ux * sd * (W / 2 + 2) + e.nx * 5.5, 3.75, cz + e.uz * sd * (W / 2 + 2) + e.nz * 5.5, 0, 0.5, 7.5, 0.5]));
        signs.push({ x: e.p[0] + e.ux * m + e.nx * (D2 + 0.06), z: e.p[1] + e.uz * m + e.nz * (D2 + 0.06), rot: e.rot, y: PH - 2, w: W * 0.8 });
      });

      // ---------------------------------------------------------- roof: parapet, membrane, skylights, atrium dome
      const inner = K.offsetRing(outer, -0.6);
      trimG.push(K.prism(K.offsetRing(outer, 0.25), H, H + 1.4, { cap: false, uScale: 4, vScale: 4 }).walls);
      trimG.push(K.prismRaw(inner.slice().reverse(), H, H + 1.4, { uScale: 4, vScale: 4 }));
      trimG.push(K.capPoly([K.offsetRing(outer, 0.25), inner.slice().reverse()], H + 1.4, 4));
      trimG.push(K.prism(K.offsetRing(outer, 0.5), H - 2.4, H - 1.6, { cap: false, uScale: 4, vScale: 4 }).walls); // cornice
      // the real roof from the aerial photo when available (the mall is low enough for the photo to sit true);
      // otherwise modelled skylight vaults, plant and the Grand Atrium dome
      const atlas = (ctx.ortho || []).find((a) => outer.every(([x, z]) => a.covers(x, z)));
      const photoRoof = atlas ? new T.Mesh(DT.orthoUV(T, K.capPoly([outer], H + 0.02, 20), atlas), new T.MeshStandardMaterial({ map: atlas.texture, roughness: 0.9 })) : null;
      const roofG = [K.capPoly([outer], H, 20)];

      const F = K.axisFrame(outer);
      const vaultGeo = (() => {
        // half cylinder bulging up, axis along x (instance x = length, y/z = radius)
        const g = new T.CylinderGeometry(1, 1, 1, 20, 1, true, -Math.PI / 2, Math.PI);
        g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); return g;
      })();
      const ribGeo = (() => { const g = new T.TorusGeometry(1, 0.03, 4, 20, Math.PI); g.rotateY(Math.PI / 2); return g; })();
      const vaults = [], ribs = [];
      for (let t = -260; t <= 260; t += 46) {
        let start = null;
        const flush = (sEnd) => {
          if (start === null) return;
          const len = sEnd - start;
          if (len > 24) {
            const mid = F.P((start + sEnd) / 2, t, H + 0.6);
            vaults.push([mid.x, mid.y, mid.z, F.rotY, len, 4.2, 4.2]);
            for (let s = start + 3; s < sEnd; s += 6) { const r = F.P(s, t, H + 0.6); ribs.push([r.x, r.y, r.z, F.rotY, 4.25, 4.25, 4.25]); }
          }
          start = null;
        };
        for (let s = F.min; s <= F.max; s += 4) {
          const p = F.P(s, t), ok = K.pointInRing([p.x, p.z], outer) && K.distToRing([p.x, p.z], outer) > 22;
          if (ok && start === null) start = s;
          if (!ok) flush(s);
        }
        flush(F.max);
      }
      const ip = K.interiorPoint(outer);
      const domeR = Math.min(22, ip.radius * 0.5);
      const drum = new T.CylinderGeometry(domeR, domeR, 3, 48, 1, true); drum.translate(ip.point[0], H + 1.5, ip.point[1]);
      const dome = new T.SphereGeometry(domeR, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.55, 1); dome.translate(ip.point[0], H + 3, ip.point[1]);
      const domeRibs = [];
      for (let k = 0; k < 24; k++) {
        const g = new T.TorusGeometry(domeR, 0.12, 4, 24, Math.PI); g.scale(1, 0.55, 1); g.rotateY((k / 24) * Math.PI); g.translate(ip.point[0], H + 3, ip.point[1]);
        domeRibs.push(g);
      }
      // rooftop plant clusters
      const plant = [];
      for (let k = 0, tries = 0; k < 60 && tries < 4000; tries++) {
        const p = [F.c[0] + (rng() - 0.5) * 900, F.c[1] + (rng() - 0.5) * 900];
        if (!K.pointInRing(p, outer) || K.distToRing(p, outer) < 8 || Math.hypot(p[0] - ip.point[0], p[1] - ip.point[1]) < domeR + 10) continue;
        plant.push([p[0], H + 1.2, p[1], F.rotY, 6 + rng() * 6, 2.4, 3 + rng() * 3]);
        k++;
      }

      // ---------------------------------------------------------- assemble
      const add = (geoms, mat) => { const g = K.merge(geoms); if (!g) return null; const m = new T.Mesh(g, mat); group.add(m); return m; };
      const pick = [];
      pick.push(add(stoneG, stone), add(glassG, glass), add(shopG, shop), add(trimG, trim), add(roofG, roofMat));
      if (photoRoof) group.add(photoRoof);
      else group.add(new T.Mesh(K.merge([drum, dome]), skyGlass), new T.Mesh(K.merge(domeRibs), steel));
      const unit = new T.BoxGeometry(1, 1, 1);
      const parasol = (() => { const g = new T.ConeGeometry(1, 0.6, 8, 1, true); g.translate(0, 0.3, 0); return g; })();
      [
        K.instances(unit, stone, fins), K.instances(unit, trim, slabs), K.instances(unit, railGlass, rails, { shadow: false }),
        K.instances(unit, timber, pergola), K.instances(parasol, fabric, umbrellas), K.instances(unit, steel, poles, { shadow: false }),
        K.instances(unit, steel, canopyRows), K.instances(unit, steel, columns), photoRoof ? null : K.instances(vaultGeo, skyGlass, vaults),
        photoRoof ? null : K.instances(ribGeo, steel, ribs, { shadow: false }), photoRoof ? null : K.instances(unit, new T.MeshStandardMaterial({ map: X.louvre.map, roughness: 0.6, metalness: 0.5 }), plant),
      ].forEach((m) => { if (m) { group.add(m); pick.push(m); } });
      const sign = K.sign('THE DUBAI MALL', { width: 20, height: 2.5 });
      signs.forEach((s) => {
        const m = new T.Mesh(sign.geo, sign.mat);
        m.position.set(s.x, s.y, s.z); m.rotation.y = s.rot + Math.PI; m.scale.set(s.w / 20, s.w / 20, 1); m.userData.noShadow = true;
        group.add(m);
      });

      return {
        group,
        pickables: pick.filter(Boolean),
        center: ip.point,
        setTheme(theme) {
          const night = theme === 'night', dusk = theme === 'dusk';
          glass.emissiveIntensity = night ? 1.2 : dusk ? 0.25 : 0;
          shop.emissiveIntensity = night ? 1.2 : dusk ? 0.4 : 0;
          skyGlass.emissiveIntensity = night ? 0.22 : 0;
          if (photoRoof) photoRoof.material.color.set(night ? 0x4a5162 : dusk ? 0xd2b294 : 0xcfcfcf);
          sign.mat.emissiveIntensity = night ? 1.4 : dusk ? 0.5 : 0;
        },
      };
    },
  };
})();
