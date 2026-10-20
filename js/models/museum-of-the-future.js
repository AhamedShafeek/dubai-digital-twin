/* Museum of the Future: an asymmetric elliptical torus (77 m) on a green-hill podium. The ring's depth at each
 * point is read from the OpenStreetMap footprint, so the fat north-east end and slim south-west end match reality.
 * Canonical frame while building: long axis along +X (fat end), ring in the X-Y plane, depth along Z. */
(function () {
  'use strict';

  DT.MODEL_DEFS['museum-of-the-future'] = {
    title: 'Museum of the Future',
    eyebrow: 'Detailed 3D model · Museum',
    desc: 'A pillar-less stainless-steel torus whose windows are Arabic calligraphy; the void stands for the unknown future. It rests on a landscaped hill that is also a three-storey podium.',
    facts: [
      ['Height', '77 m, 7 floors'],
      ['Facade', '1,024 stainless-steel-clad composite panels, each uniquely shaped'],
      ['Calligraphy', 'Quotes by Sheikh Mohammed bin Rashid, by Emirati artist Mattar bin Lahej'],
      ['Structure', '2,400 diagonally intersecting steel members, no internal columns'],
      ['Podium', 'Green hill with three storeys of lobby, auditorium and parking'],
      ['Architect', 'Shaun Killa, Killa Design · engineering Buro Happold'],
      ['Opened', '22 February 2022'],
    ],
    shadow: { mapSize: 2048 },
    ground: 1200,

    build(K, T, data, ctx) {
      const group = new T.Group();
      const ax = data.axis, perp = [-ax[1], ax[0]];
      const inner = new T.Group();
      inner.rotation.y = Math.atan2(-ax[1], ax[0]);
      group.add(inner);

      // Footprint in (along, across) coordinates, used for the ring's depth.
      const fp = data.footprint.map(([x, z]) => [x * ax[0] + z * ax[1], x * perp[0] + z * perp[1]]);
      const halfWidth = (s) => {
        const hits = [];
        for (let i = 0; i < fp.length; i++) {
          const a = fp[i], b = fp[(i + 1) % fp.length];
          if ((a[0] - s) * (b[0] - s) <= 0 && a[0] !== b[0]) hits.push(a[1] + (s - a[0]) / (b[0] - a[0]) * (b[1] - a[1]));
        }
        return hits.length > 1 ? (Math.max(...hits) - Math.min(...hits)) / 2 : 0;
      };

      // ---------------------------------------------------------- the torus
      const k = (data.length / 2 * 0.95) / 66;
      const A = 66 * k, B = 31, YC = 46;            // outer ellipse: spans y 15 -> 77
      const XI = -13 * k, YI = 44.5, a = 34 * k, b = 13.8; // the void: towards the slim end and slightly low, as built
      const N = 2.6, U = 300, Vn = 84;
      const sp = (c) => Math.sign(c) * Math.abs(c) ** (2 / N);

      const depthRaw = Array.from({ length: U }, (_, i) => {
        const u = i / U * Math.PI * 2;
        const xm = ((A * Math.cos(u)) + (XI + a * Math.cos(u))) / 2;
        return Math.min(23, Math.max(7.5, halfWidth(xm) * 0.94));
      });
      let depth = depthRaw;
      for (let pass = 0; pass < 6; pass++) depth = depth.map((_, i) => (depth[(i - 1 + U) % U] + 2 * depth[i] + depth[(i + 1) % U]) / 4);
      const D = (u) => { const f = ((u / (Math.PI * 2)) % 1 + 1) % 1 * U, i = Math.floor(f) % U, t = f - Math.floor(f); return depth[i] * (1 - t) + depth[(i + 1) % U] * t; };

      const S = (u, v) => {
        const ox = A * Math.cos(u), oy = YC + B * Math.sin(u), ix = XI + a * Math.cos(u), iy = YI + b * Math.sin(u);
        const c = sp(Math.cos(v)), s = sp(Math.sin(v));
        return [(ox + ix) / 2 + (ox - ix) / 2 * c, (oy + iy) / 2 + (oy - iy) / 2 * c, D(u) * s];
      };
      const pos = [], nor = [], uv = [], idx = [], e = 1e-4;
      for (let j = 0; j <= Vn; j++) {
        for (let i = 0; i <= U; i++) {
          const u = i / U * Math.PI * 2, v = j / Vn * Math.PI * 2;
          const p = S(u, v), pu = S(u + e, v), pv = S(u, v + e);
          const du = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], dv = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
          let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
          const l = Math.hypot(...n) || 1;
          n = n.map((c) => c / l);
          pos.push(...p); nor.push(...n); uv.push(i / U, j / Vn);
        }
      }
      // outward check at the outer rim of the fat end (u = 0, v = 0 should face +X)
      const flip = nor[0] < 0;
      if (flip) for (let i = 0; i < nor.length; i++) nor[i] = -nor[i];
      for (let j = 0; j < Vn; j++) for (let i = 0; i < U; i++) {
        const p0 = j * (U + 1) + i, p1 = p0 + 1, p2 = p0 + U + 2, p3 = p0 + U + 1;
        if (flip) idx.push(p0, p1, p2, p0, p2, p3); else idx.push(p0, p2, p1, p0, p3, p2);
      }
      const torusGeo = new T.BufferGeometry();
      torusGeo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      torusGeo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      torusGeo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      torusGeo.setIndex(idx);
      // make sure triangle winding agrees with the normals
      {
        const pa = new T.Vector3(...pos.slice(idx[0] * 3, idx[0] * 3 + 3)), pb = new T.Vector3(...pos.slice(idx[1] * 3, idx[1] * 3 + 3)), pc = new T.Vector3(...pos.slice(idx[2] * 3, idx[2] * 3 + 3));
        const fn = new T.Vector3().subVectors(pb, pa).cross(new T.Vector3().subVectors(pc, pa));
        if (fn.dot(new T.Vector3(nor[idx[0] * 3], nor[idx[0] * 3 + 1], nor[idx[0] * 3 + 2])) < 0) {
          const arr = torusGeo.index.array;
          for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t; }
        }
      }
      const tex = K.motfSkin(ctx.aniso);
      const skin = new T.MeshStandardMaterial({
        map: tex.map, roughnessMap: tex.rm, metalnessMap: tex.rm, roughness: 1, metalness: 1,
        emissiveMap: tex.emissive, emissive: 0xffe0b0, emissiveIntensity: 0, envMapIntensity: 1.1,
      });
      const torus = new T.Mesh(torusGeo, skin);

      // ---------------------------------------------------------- the green hill podium
      // Two merged domes: the crest the ring sits in, and the larger garden lobe that OSM maps as grass to the
      // south-east of the ring (local +z is south-east here, +x north-east along the ring).
      const domes = [
        { cx: 0, cz: 0, rx: 86 * k, rz: 30, h: 17.2, inner: 0.45 },
        { cx: 26, cz: 34, rx: 86, rz: 44, h: 11, inner: 0.35 },
      ];
      const domeHeight = (d, x, z) => {
        const t = Math.hypot((x - d.cx) / d.rx, (z - d.cz) / d.rz);
        return t >= 1 ? 0 : d.h * (1 - K.smoothstep(d.inner, 1, t)) + 0.25;
      };
      const moundHeight = (x, z) => Math.max(...domes.map((d) => domeHeight(d, x, z)));
      const grass = new T.MeshStandardMaterial({ map: K.grass(ctx.aniso), roughness: 0.95, metalness: 0 });
      const moundMeshes = domes.map((d, di) => {
        const rings = [];
        for (let r = 0; r <= 26; r++) {
          const t = r / 26;
          const h = d.h * (1 - K.smoothstep(d.inner, 1, t)) + (t < 1 ? 0.25 : 0) - di * 0.05;
          rings.push(Array.from({ length: 97 }, (_, i) => {
            const phi = i / 96 * Math.PI * 2, wobble = 1 + 0.035 * Math.sin(phi * 3 + 1 + di);
            return new T.Vector3(d.cx + Math.cos(phi) * d.rx * t * wobble, h, d.cz + Math.sin(phi) * d.rz * t * wobble);
          }));
        }
        const g = K.gridSurface(rings, { uv: (i, j) => [rings[j][i].x / 18, rings[j][i].z / 18] });
        if (g.getAttribute('normal').getY(g.getAttribute('normal').count - 10) < 0) {
          const arr = g.index.array;
          for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t; }
          g.computeVertexNormals();
        }
        return new T.Mesh(g, grass);
      });

      // arched glass entrances set into the foot of the garden hill
      const white = new T.MeshStandardMaterial({ color: 0xf1f2f0, roughness: 0.4, metalness: 0.2 });
      const glassMat = new T.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.06, metalness: 0.8, envMapIntensity: 1.4, emissive: 0xffd9a8, emissiveIntensity: 0 });
      const arches = [], panes = [];
      const lobe = domes[1];
      [[0.35, 9], [1.15, 6.5], [-0.6, 7.5]].forEach(([phi, r]) => {
        const x = lobe.cx + Math.cos(phi) * lobe.rx * 0.9, z = lobe.cz + Math.sin(phi) * lobe.rz * 0.9;
        const n = [Math.cos(phi) / lobe.rx, Math.sin(phi) / lobe.rz], face = Math.atan2(n[0], n[1]);
        const rim = new T.TorusGeometry(r, 0.45, 8, 40, Math.PI);
        const pane = new T.CircleGeometry(r - 0.3, 40, 0, Math.PI);
        [rim, pane].forEach((g) => { g.rotateY(face); g.translate(x, 0.2, z); });
        arches.push(rim); panes.push(pane);
      });
      inner.add(torus, ...moundMeshes, new T.Mesh(K.merge(arches), white));

      // palms on the lower slopes and along the garden paths, clear of the ring itself
      const rp = K.rng(77), spots = [];
      for (let i = 0; spots.length < 52 && i < 600; i++) {
        const d = domes[i % 3 === 0 ? 0 : 1], phi = rp() * Math.PI * 2, t = 0.55 + rp() * 0.5;
        const x = d.cx + Math.cos(phi) * d.rx * t, z = d.cz + Math.sin(phi) * d.rz * t;
        if (Math.abs(x) < 72 * k && Math.abs(z) < 26) continue;
        if (moundHeight(x, z) > 9) continue;
        if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 7)) continue;
        spots.push([x, z, 0.85 + rp() * 0.45, rp() * 6.3]);
      }
      const trunkMat = new T.MeshStandardMaterial({ color: 0x8a6f4e, roughness: 0.95 });
      const frondMat = new T.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.8, side: T.DoubleSide });
      K.palmGrove(spots, moundHeight, { trunk: trunkMat, fronds: frondMat }).forEach((m) => inner.add(m));
      const paneMesh = new T.Mesh(K.merge(panes), glassMat);
      paneMesh.userData.noShadow = true;
      inner.add(paneMesh);

      return {
        group,
        pickables: [torus, ...moundMeshes],
        setTheme(theme) {
          const night = theme === 'night', dusk = theme === 'dusk';
          skin.emissiveIntensity = night ? 2.4 : dusk ? 0.35 : 0;
          skin.envMapIntensity = night ? 0.7 : 1.1;
          glassMat.emissiveIntensity = night ? 1.2 : 0;
        },
        animate() { return false; },
      };
    },
  };
})();
