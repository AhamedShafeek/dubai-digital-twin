/* Toolkit for the detailed landmark models: geometry builders and procedural textures (three.js).
 * Local model space: x = east, y = up, z = south, in metres. */
(function () {
  'use strict';

  const K = {};
  let T = null; // THREE, resolved by whenReady()

  K.whenReady = () => new Promise((resolve) => {
    const done = () => { T = window.THREE; resolve(T); };
    if (window.THREE) done(); else window.addEventListener('three-ready', done, { once: true });
  });

  K.fontsReady = async () => {
    try { await Promise.race([document.fonts.load('700 200px "Aref Ruqaa"'), new Promise((r) => setTimeout(r, 4000))]); } catch { /* fall back to system Arabic */ }
  };

  K.rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  K.smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  K.lerp = (a, b, t) => a + (b - a) * t;

  // Piecewise-linear lookup in [[x, y], ...] sorted by x, smoothed with a cubic Hermite between samples.
  K.profile = (pts) => (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const m0 = i > 1 ? (y1 - pts[i - 2][1]) / (x1 - pts[i - 2][0]) : (y1 - y0) / (x1 - x0);
        const m1 = i < pts.length - 1 ? (pts[i + 1][1] - y0) / (pts[i + 1][0] - x0) : (y1 - y0) / (x1 - x0);
        const h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
      }
    }
    return pts[pts.length - 1][1];
  };

  // ------------------------------------------------------------------ 2D rings ([x, z] arrays)

  K.signedArea = (ring) => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  };
  K.ccw = (ring) => (K.signedArea(ring) > 0 ? ring : ring.slice().reverse());
  K.dedupe = (ring, eps = 0.05) => ring.filter((p, i) => { const q = ring[(i + 1) % ring.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > eps; });

  // Chaikin corner cutting that keeps genuinely sharp corners (turn > sharpDeg) crisp.
  K.smoothRing = (ring, iterations = 2, sharpDeg = 55) => {
    let pts = K.dedupe(ring);
    for (let it = 0; it < iterations; it++) {
      const n = pts.length, out = [];
      for (let i = 0; i < n; i++) {
        const a = pts[(i - 1 + n) % n], p = pts[i], b = pts[(i + 1) % n];
        const u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]];
        const turn = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1)))) * 180 / Math.PI;
        if (turn > sharpDeg) { out.push(p); continue; }
        out.push([p[0] * 0.75 + a[0] * 0.25, p[1] * 0.75 + a[1] * 0.25], [p[0] * 0.75 + b[0] * 0.25, p[1] * 0.75 + b[1] * 0.25]);
      }
      pts = out;
    }
    return pts;
  };
  K.scaleRing = (ring, k, c = null) => {
    const [cx, cz] = c || [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    return ring.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
  };

  // ------------------------------------------------------------------ geometry builders

  function geometry(pos, nor, uv, index) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    if (index) g.setIndex(index);
    return g;
  }

  /* Vertical prism: walls (u along the perimeter in metres / uScale, v = height / vScale, so facades line up
   * between tiers) and a separate top cap. Normals are smooth across corners gentler than smoothDeg. */
  K.prism = (ringIn, y0, y1, o = {}) => {
    const { uScale = 10, vScale = 10, smoothDeg = 32, cap = true, uOffset = 0 } = o;
    const ring = K.ccw(K.dedupe(ringIn));
    const n = ring.length;
    const edge = [], cum = [0];
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
      edge.push([dz / len, -dx / len]);
      cum.push(cum[i] + len);
    }
    const cos = Math.cos(smoothDeg * Math.PI / 180);
    const vnormal = (i, e) => {
      const a = edge[(i - 1 + n) % n], b = edge[i % n];
      if (a[0] * b[0] + a[1] * b[1] < cos) return edge[e];
      const x = a[0] + b[0], z = a[1] + b[1], l = Math.hypot(x, z);
      return [x / l, z / l];
    };
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      const na = vnormal(i, i), nb = vnormal(i + 1, i);
      const b = pos.length / 3;
      pos.push(p[0], y0, p[1], q[0], y0, q[1], q[0], y1, q[1], p[0], y1, p[1]);
      nor.push(na[0], 0, na[1], nb[0], 0, nb[1], nb[0], 0, nb[1], na[0], 0, na[1]);
      uv.push(cum[i] / uScale + uOffset, y0 / vScale, cum[i + 1] / uScale + uOffset, y0 / vScale, cum[i + 1] / uScale + uOffset, y1 / vScale, cum[i] / uScale + uOffset, y1 / vScale);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const walls = geometry(pos, nor, uv, idx);
    if (!cap) return { walls, cap: null };
    const tris = T.ShapeUtils.triangulateShape(ring.map(([x, z]) => new T.Vector2(x, z)), []);
    const cpos = [], cnor = [], cuv = [], cidx = [];
    ring.forEach(([x, z]) => { cpos.push(x, y1, z); cnor.push(0, 1, 0); cuv.push(x / uScale, z / uScale); });
    tris.forEach(([a, b, c]) => {
      const ab = [ring[b][0] - ring[a][0], ring[b][1] - ring[a][1]], ac = [ring[c][0] - ring[a][0], ring[c][1] - ring[a][1]];
      if (ab[1] * ac[0] - ab[0] * ac[1] > 0) cidx.push(a, b, c); else cidx.push(a, c, b);
    });
    return { walls, cap: geometry(cpos, cnor, cuv, cidx) };
  };

  // Grid surface from rows of points (rows[j][i] = Vector3); u across a row, v along rows.
  K.gridSurface = (rows, { uv = null, closedU = false } = {}) => {
    const R = rows.length, C = rows[0].length;
    const pos = [], uvs = [], idx = [];
    rows.forEach((row, j) => row.forEach((p, i) => {
      pos.push(p.x, p.y, p.z);
      const t = uv ? uv(i, j) : [i / (C - 1), j / (R - 1)];
      uvs.push(t[0], t[1]);
    }));
    for (let j = 0; j < R - 1; j++) {
      for (let i = 0; i < C - 1 + (closedU ? 1 : 0); i++) {
        const i2 = (i + 1) % C;
        const a = j * C + i, b = j * C + i2, c = (j + 1) * C + i2, d = (j + 1) * C + i;
        idx.push(a, b, c, a, c, d);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  K.strut = (a, b, r, radial = 8) => {
    const dir = new T.Vector3().subVectors(b, a), len = dir.length();
    const g = new T.CylinderGeometry(r, r, len, radial, 1, true);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return g;
  };
  K.tube = (points, r, tubular = 64, radial = 10) => new T.TubeGeometry(new T.CatmullRomCurve3(points, false, 'centripetal'), tubular, r, radial, false);

  // Lattice truss between two chord polylines: two chords plus zig-zag web members.
  K.lattice = (chordA, chordB, { r = 0.6, web = 0.35 } = {}) => {
    const parts = [K.tube(chordA, r, chordA.length * 3, 8), K.tube(chordB, r, chordB.length * 3, 8)];
    for (let i = 0; i < chordA.length - 1; i++) {
      parts.push(K.strut(chordA[i], chordB[i + 1], web, 6));
      parts.push(K.strut(chordB[i], chordA[i + 1], web, 6));
      parts.push(K.strut(chordA[i], chordB[i], web * 0.8, 6));
    }
    return K.merge(parts);
  };

  // Merge into one non-indexed geometry. With { colors: true } every part keeps (or gets white) vertex colours.
  K.merge = (geoms, { colors = false } = {}) => {
    const keep = colors ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
    const list = geoms.filter(Boolean).map((g) => {
      const ng = g.index ? g.toNonIndexed() : g;
      const n = ng.getAttribute('position').count;
      if (!ng.getAttribute('uv')) ng.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(n * 2), 2));
      if (!ng.getAttribute('normal')) ng.computeVertexNormals();
      if (colors && !ng.getAttribute('color')) ng.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      for (const name of Object.keys(ng.attributes)) if (!keep.includes(name)) ng.deleteAttribute(name);
      return ng;
    });
    return list.length ? window.THREE_ADDONS.mergeGeometries(list, false) : null;
  };
  K.tint = (g, color) => {
    const n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
    g.setAttribute('color', new T.Float32BufferAttribute(a, 3));
    return g;
  };

  // ------------------------------------------------------------------ frames, shells, signs

  /* Principal-axis frame of a footprint. P(s, t, y) is the world point at distance s along the long axis and
   * t across it; extents(s) gives the footprint's [lo, hi] across-range at s (null outside). `towards` flips the
   * axis so +s points at that [x, z] location. */
  K.axisFrame = (ringIn, towards = null) => {
    const ring = K.dedupe(ringIn);
    const c = [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
    let sxx = 0, szz = 0, sxz = 0;
    ring.forEach(([x, z]) => { sxx += (x - c[0]) ** 2; szz += (z - c[1]) ** 2; sxz += (x - c[0]) * (z - c[1]); });
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    let ax = [Math.cos(th), Math.sin(th)];
    if (towards && (towards[0] - c[0]) * ax[0] + (towards[1] - c[1]) * ax[1] < 0) ax = [-ax[0], -ax[1]];
    const pr = [-ax[1], ax[0]];
    const along = (p) => (p[0] - c[0]) * ax[0] + (p[1] - c[1]) * ax[1];
    const across = (p) => (p[0] - c[0]) * pr[0] + (p[1] - c[1]) * pr[1];
    const s = ring.map(along), min = Math.min(...s), max = Math.max(...s);
    const extents = (sv) => {
      const hits = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], sa = along(a), sb = along(b);
        if ((sa - sv) * (sb - sv) <= 0 && sa !== sb) { const t = (sv - sa) / (sb - sa); hits.push(across(a) + t * (across(b) - across(a))); }
      }
      return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : null;
    };
    const P = (sv, tv, y = 0) => new T.Vector3(c[0] + ax[0] * sv + pr[0] * tv, y, c[1] + ax[1] * sv + pr[1] * tv);
    return { c, ax, pr, along, across, min, max, length: max - min, extents, P, rotY: Math.atan2(-ax[1], ax[0]) };
  };

  // Flip a geometry's winding (and recompute normals) if its normals mostly point towards `inside`.
  K.orientOut = (g, inside) => {
    const pos = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const nor = g.getAttribute('normal');
    let s = 0;
    for (let i = 0; i < pos.count; i++) s += nor.getX(i) * (pos.getX(i) - inside.x) + nor.getY(i) * (pos.getY(i) - inside.y) + nor.getZ(i) * (pos.getZ(i) - inside.z);
    if (s < 0) {
      if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }
      else { const a = pos.array; for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; } pos.needsUpdate = true; }
      g.computeVertexNormals();
    }
    return g;
  };

  // One outward-facing wall quad for edge p -> q of a CCW ring, u measured in metres from u0.
  K.wall = (p, q, y0, y1, { uScale = 10, vScale = 10, u0 = 0 } = {}) => {
    const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1, nx = dz / L, nz = -dx / L;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([p[0], y0, p[1], q[0], y0, q[1], q[0], y1, q[1], p[0], y1, p[1]], 3));
    g.setAttribute('normal', new T.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
    g.setAttribute('uv', new T.Float32BufferAttribute([u0 / uScale, y0 / vScale, (u0 + L) / uScale, y0 / vScale, (u0 + L) / uScale, y1 / vScale, u0 / uScale, y1 / vScale], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    return g;
  };

  // Instanced mesh from [x, y, z, rotY, sx, sy, sz] rows.
  K.instances = (geo, mat, rows, { shadow = true } = {}) => {
    if (!rows.length) return null;
    const im = new T.InstancedMesh(geo, mat, rows.length);
    const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), v = new T.Vector3(), s = new T.Vector3();
    rows.forEach(([x, y, z, r, sx, sy, sz], i) => { q.setFromAxisAngle(up, r); m.compose(v.set(x, y, z), q, s.set(sx, sy, sz)); im.setMatrixAt(i, m); });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    if (!shadow) im.userData.noShadow = true;
    return im;
  };

  // A lettering panel (canvas texture) as a flat quad; returns { mesh-ready geometry, material }.
  K.sign = (text, { width = 20, height = 2.4, color = '#c9a45c', font = '700 120px Manrope, Arial, sans-serif', glow = true, letterSpacing = 18 } = {}) => {
    const c = K.canvas(1024, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing}px`;
      ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2 + 6);
    });
    const tex = K.texture(c, { repeat: false });
    const mat = new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.3, metalness: 0.8, emissiveMap: glow ? tex : null, emissive: glow ? 0xffffff : 0x000000, emissiveIntensity: 0 });
    return { geo: new T.PlaneGeometry(width, height), mat };
  };

  // ------------------------------------------------------------------ polygon helpers ([x, z] rings)

  K.pointInRing = ([x, z], ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  K.distToRing = ([x, z], ring) => {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    return best;
  };
  // Pole of inaccessibility by grid refinement: the interior point farthest from every edge.
  K.interiorPoint = (ring) => {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    ring.forEach(([x, z]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); });
    let best = [(minX + maxX) / 2, (minZ + maxZ) / 2], bestD = K.pointInRing(best, ring) ? K.distToRing(best, ring) : -1;
    let cx = best[0], cz = best[1], span = Math.max(maxX - minX, maxZ - minZ);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
        const p = [cx - span / 2 + (span * i) / 10, cz - span / 2 + (span * j) / 10];
        if (!K.pointInRing(p, ring)) continue;
        const d = K.distToRing(p, ring);
        if (d > bestD) { bestD = d; best = p; }
      }
      cx = best[0]; cz = best[1]; span /= 4;
    }
    return { point: best, radius: Math.max(0, bestD) };
  };
  K.perimeter = (ring) => ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  K.area = (ring) => Math.abs(K.signedArea(ring));

  // Miter offset of a ring by d metres (positive = outward), with miter length clamped at sharp corners.
  K.offsetRing = (ringIn, d) => {
    const ring = K.ccw(K.dedupe(ringIn)), n = ring.length;
    const normals = ring.map((p, i) => {
      const q = ring[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
      return [dz / l, -dx / l];
    });
    // after K.ccw the (dz, -dx) edge normal points outward, as in K.prism
    const sign = 1;
    return ring.map((p, i) => {
      const a = normals[(i - 1 + n) % n], b = normals[i];
      let mx = a[0] + b[0], mz = a[1] + b[1];
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      const cos = Math.max(0.35, mx * b[0] + mz * b[1]);
      return [p[0] + sign * mx * d / cos, p[1] + sign * mz * d / cos];
    });
  };

  // Extruded polygon with holes: walls for every ring (holes face inwards) and an optional cap at y1.
  K.prismPoly = (poly, y0, y1, o = {}) => {
    const outer = K.ccw(K.dedupe(poly[0])), holes = poly.slice(1).map((h) => K.ccw(K.dedupe(h)).reverse());
    const walls = [K.prism(outer, y0, y1, { ...o, cap: false }).walls];
    holes.forEach((h) => { if (h.length >= 3) walls.push(K.prismRaw(h, y0, y1, o)); });
    let cap = null;
    if (o.cap !== false) cap = K.capPoly([outer, ...holes], y1, o.uScale || 10);
    return { walls: K.merge(walls), cap };
  };
  // Walls along a ring in the given order (no re-orientation): used for holes, whose walls face inwards.
  K.prismRaw = (ring, y0, y1, { uScale = 10, vScale = 10, uOffset = 0 } = {}) => {
    const pos = [], nor = [], uv = [];
    let cum = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz) || 1;
      const nx = dz / len, nz = -dx / len;
      const quad = [[p, y0, cum], [q, y0, cum + len], [q, y1, cum + len], [p, y1, cum]];
      [0, 2, 1, 0, 3, 2].forEach((k) => {
        const [pt, y, u] = quad[k];
        pos.push(pt[0], y, pt[1]); nor.push(nx, 0, nz); uv.push(u / uScale + uOffset, y / vScale);
      });
      cum += len;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return g;
  };
  K.capPoly = (rings, y, uScale = 10, down = false) => {
    const outer = rings[0], holes = rings.slice(1);
    const tris = T.ShapeUtils.triangulateShape(outer.map(([x, z]) => new T.Vector2(x, z)), holes.map((h) => h.map(([x, z]) => new T.Vector2(x, z))));
    const all = [...outer, ...holes.flat()];
    const pos = [], nor = [], uv = [];
    tris.forEach((tri) => {
      const [a, b, c] = tri.map((i) => all[i]);
      const cross = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
      const order = (cross > 0) !== down ? [a, b, c] : [a, c, b];
      order.forEach(([x, z]) => { pos.push(x, y, z); nor.push(0, down ? -1 : 1, 0); uv.push(x / uScale, z / uScale); });
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return g;
  };

  // ------------------------------------------------------------------ textures

  K.canvas = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  };
  K.texture = (canvas, { color = true, anisotropy = 8, repeat = true } = {}) => {
    const t = new T.CanvasTexture(canvas);
    t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
    return t;
  };
  const noise = (ctx, w, h, amount, seed, alpha = 1) => {
    const img = ctx.getImageData(0, 0, w, h), d = img.data, r = K.rng(seed);
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * amount;
      d[i] += n; d[i + 1] += n; d[i + 2] += n; d[i + 3] = d[i + 3] * alpha;
    }
    ctx.putImageData(img, 0, 0);
  };

  /* Burj Khalifa curtain wall: one tile = 8 panels (1.4 m) x 4 floors (3.9 m) = 11.2 m x 15.6 m.
   * Reflective silver-blue glass, vertical tubular stainless fins, textured stainless spandrels. */
  K.bkFacade = (aniso) => {
    const W = 2048, H = 2048, cols = 16, rows = 8, cw = W / cols, rh = H / rows, fin = 14, spand = Math.round(rh * 0.15);
    const r = K.rng(828);
    // occupancy varies by floor (whole floors tend to be lit together), then per panel
    const floorBias = Array.from({ length: rows }, () => (r() < 0.3 ? 0.55 : 0.1));
    const cells = Array.from({ length: cols * rows }, (_, i) => ({ tint: r(), lit: r() < floorBias[Math.floor(i / cols)] ? r() : 1, warm: r() }));
    const map = K.canvas(W, H, (c) => {
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const { tint } = cells[j * cols + i], x = i * cw, y = j * rh;
        const g = c.createLinearGradient(0, y, 0, y + rh - spand);
        const l = 0.96 + tint * 0.08;
        g.addColorStop(0, `rgb(${196 * l | 0},${212 * l | 0},${228 * l | 0})`);
        g.addColorStop(1, `rgb(${158 * l | 0},${178 * l | 0},${200 * l | 0})`);
        c.fillStyle = g; c.fillRect(x, y, cw, rh - spand);
        // textured stainless spandrel: close in tone to the glass so floors read as a fine line, not stripes
        c.fillStyle = '#c3cad1'; c.fillRect(x, y + rh - spand, cw, spand);
        c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x, y + rh - spand, cw, 2);
      }
      noise(c, W, H, 8, 7);
      for (let i = 0; i < cols; i++) {
        // vertical tubular stainless fin: lit edge, body, shadowed edge
        const x = i * cw;
        c.fillStyle = '#9aa4ae'; c.fillRect(x, 0, 2, H);
        c.fillStyle = '#eef2f5'; c.fillRect(x + 2, 0, fin - 6, H);
        c.fillStyle = '#ffffff'; c.fillRect(x + 4, 0, 3, H);
        c.fillStyle = '#7c8792'; c.fillRect(x + fin - 4, 0, 4, H);
      }
    });
    const bump = K.canvas(W, H, (c) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      for (let j = 0; j < rows; j++) { c.fillStyle = '#7a7a7a'; c.fillRect(0, j * rh + rh - spand, W, spand); }
      for (let i = 0; i < cols; i++) { const g = c.createLinearGradient(i * cw, 0, i * cw + fin, 0); g.addColorStop(0, '#666'); g.addColorStop(0.5, '#fff'); g.addColorStop(1, '#666'); c.fillStyle = g; c.fillRect(i * cw, 0, fin, H); }
    });
    // roughness in G, metalness in B (glTF convention, shared by roughnessMap/metalnessMap)
    const rm = K.canvas(W, H, (c) => {
      c.fillStyle = 'rgb(0,18,200)'; c.fillRect(0, 0, W, H);
      for (let j = 0; j < rows; j++) { c.fillStyle = 'rgb(0,120,235)'; c.fillRect(0, j * rh + rh - spand, W, spand); }
      for (let i = 0; i < cols; i++) { c.fillStyle = 'rgb(0,70,255)'; c.fillRect(i * cw, 0, fin, H); }
    });
    const emissive = K.canvas(W, H, (c) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const { lit, warm } = cells[j * cols + i];
        if (lit > 1 - 1e-9) continue;
        const k = 0.3 + lit * 0.55;
        c.fillStyle = warm > 0.4 ? `rgba(255,216,168,${k})` : `rgba(220,232,255,${k})`;
        c.fillRect(i * cw + fin, j * rh + 8, cw - fin, rh - spand - 14);
      }
      // the stainless fins catch the facade lighting faintly all the way up
      for (let i = 0; i < cols; i++) { c.fillStyle = 'rgba(190,210,255,0.16)'; c.fillRect(i * cw + 2, 0, fin - 4, H); }
    });
    return {
      map: K.texture(map, { anisotropy: aniso }), bump: K.texture(bump, { color: false, anisotropy: aniso }),
      rm: K.texture(rm, { color: false, anisotropy: aniso }), emissive: K.texture(emissive, { anisotropy: aniso }),
    };
  };

  /* Burj Al Arab side walls: one tile = 3 bays (3 m) x one duplex floor (6.9 m); deep blue glass, white slabs. */
  K.baaGlass = (aniso) => {
    const W = 512, H = 512, bays = 3, bw = W / bays, slab = 58, transom = 0.52;
    const r = K.rng(321);
    const map = K.canvas(W, H, (c) => {
      for (let i = 0; i < bays; i++) {
        const g = c.createLinearGradient(0, 0, 0, H - slab);
        const l = 0.9 + r() * 0.2;
        g.addColorStop(0, `rgb(${70 * l | 0},${140 * l | 0},${214 * l | 0})`);
        g.addColorStop(1, `rgb(${28 * l | 0},${84 * l | 0},${160 * l | 0})`);
        c.fillStyle = g; c.fillRect(i * bw, 0, bw, H - slab);
      }
      noise(c, W, H, 8, 3);
      c.fillStyle = '#f4f6f7'; c.fillRect(0, H - slab, W, slab);
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0, H - slab, W, 4);
      c.fillStyle = '#e9eef2'; c.fillRect(0, (H - slab) * transom, W, 7);
      for (let i = 0; i <= bays; i++) { c.fillStyle = '#eef2f5'; c.fillRect(i * bw - 5, 0, 10, H - slab); }
    });
    const rm = K.canvas(W, H, (c) => {
      c.fillStyle = 'rgb(0,20,140)'; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgb(0,150,10)'; c.fillRect(0, H - slab, W, slab); c.fillRect(0, (H - slab) * transom, W, 7);
      for (let i = 0; i <= bays; i++) c.fillRect(i * bw - 5, 0, 10, H - slab);
    });
    const emissive = K.canvas(W, H, (c) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < bays; i++) if (r() < 0.6) { c.fillStyle = `rgba(255,${200 + r() * 40 | 0},${140 + r() * 60 | 0},${0.5 + r() * 0.5})`; c.fillRect(i * bw + 6, 8, bw - 12, H - slab - 16); }
    });
    return { map: K.texture(map, { anisotropy: aniso }), rm: K.texture(rm, { color: false, anisotropy: aniso }), emissive: K.texture(emissive, { anisotropy: aniso }) };
  };

  /* Burj Al Arab sail: PTFE-coated glass-fibre membrane; one tile = full width x one of the 12 panels. */
  K.baaSail = (aniso) => {
    const W = 512, H = 512;
    const map = K.canvas(W, H, (c) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#dcdcd8'); g.addColorStop(0.12, '#f7f7f4'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.88, '#f3f3ef'); g.addColorStop(1, '#d6d6d1');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (let i = 1; i < 18; i++) { c.fillStyle = 'rgba(160,160,155,0.18)'; c.fillRect(i * W / 18, 0, 2, H); }
      noise(c, W, H, 5, 12);
    });
    return { map: K.texture(map, { anisotropy: aniso }) };
  };

  /* Museum of the Future skin: stainless steel with calligraphy windows that wrap the whole torus. */
  K.motfSkin = (aniso) => {
    const W = 4096, H = 1024;
    const lines = [
      'المستقبل لمن يستطيع تخيله وتصميمه وتنفيذه',
      'متحف المستقبل',
      'لن نعيش مئات السنين ولكن يمكن أن نبدع شيئاً يستمر لمئات السنين',
      'دبي',
      'المستقبل لا ينتظر',
    ];
    const font = (px) => `700 ${px}px "Aref Ruqaa", "Geeza Pro", "Noto Naskh Arabic", serif`;
    const r = K.rng(2022);
    const measure = document.createElement('canvas').getContext('2d');
    const layout = [];
    // Dense bands of script all the way round the tube (outer rim, front face, void, back face), as on the
    // real skin where the calligraphy windows cover a large share of the surface.
    for (let row = 0, y = 70; y < H + 60; row++) {
      const px = 120 + r() * 70;
      let x = -r() * 400;
      while (x < W + 300) {
        const text = lines[(row * 2 + layout.length) % lines.length];
        measure.font = font(px);
        const w = measure.measureText(text).width;
        layout.push({ text, x: x + w, y: y + (r() - 0.5) * 22, px, rot: (r() - 0.5) * 0.06 });
        x += w + 30 + r() * 70;
      }
      y += px * 0.92;
    }
    const drawText = (c, style) => {
      c.textBaseline = 'middle'; c.direction = 'rtl'; c.textAlign = 'right';
      layout.forEach(({ text, x, y, px, rot }) => {
        c.save(); c.translate(x, y); c.rotate(rot); c.font = font(px); style(c, text); c.restore();
      });
    };
    const map = K.canvas(W, H, (c) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#c6cbd0'); g.addColorStop(0.5, '#dde1e5'); g.addColorStop(1, '#bfc5cb');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(90,96,104,0.35)'; c.lineWidth = 2;
      for (let k = -H; k < W + H; k += 96) {   // triangulated panel seams (1,024 panels on the real skin)
        c.beginPath(); c.moveTo(k, 0); c.lineTo(k + H * 0.58, H); c.stroke();
        c.beginPath(); c.moveTo(k, 0); c.lineTo(k - H * 0.58, H); c.stroke();
      }
      for (let y = 0; y < H; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      noise(c, W, H, 9, 5);
      drawText(c, (cx, t) => { cx.lineWidth = 9; cx.strokeStyle = '#eef1f4'; cx.strokeText(t, 0, 0); cx.fillStyle = '#1b2229'; cx.fillText(t, 0, 0); });
    });
    const rm = K.canvas(W, H, (c) => {
      c.fillStyle = 'rgb(0,88,255)'; c.fillRect(0, 0, W, H);
      drawText(c, (cx, t) => { cx.fillStyle = 'rgb(0,14,60)'; cx.fillText(t, 0, 0); });
    });
    const emissive = K.canvas(W, H, (c) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      drawText(c, (cx, t) => { cx.fillStyle = '#ffe9c4'; cx.fillText(t, 0, 0); });
    });
    return { map: K.texture(map, { anisotropy: aniso }), rm: K.texture(rm, { color: false, anisotropy: aniso }), emissive: K.texture(emissive, { anisotropy: aniso }) };
  };

  K.grass = (aniso) => K.texture(K.canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#7fae55'; c.fillRect(0, 0, w, h);
    const r = K.rng(9);
    for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(${80 + r() * 60 | 0},${135 + r() * 55 | 0},${50 + r() * 30 | 0},0.45)`; c.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
    for (let i = 0; i < 26; i++) { c.fillStyle = 'rgba(70,110,45,0.25)'; c.beginPath(); c.arc(r() * w, r() * h, 8 + r() * 18, 0, 7); c.fill(); }
  }), { anisotropy: aniso });

  /* Date palm: slightly leaning trunk with ring scars and a crown of arching fronds. Returns trunk and frond
   * geometries for instancing. Height ~ 9 m before per-instance scaling. */
  K.palm = () => {
    const trunkPts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; trunkPts.push(new T.Vector3(0.5 * t * t, 8.4 * t, 0)); }
    const trunk = K.tube(trunkPts, 0.26, 16, 7);
    const scars = [];
    for (let i = 1; i < 14; i++) {
      const t = i / 14, g = new T.TorusGeometry(0.28, 0.05, 4, 8);
      g.rotateX(Math.PI / 2); g.translate(0.5 * t * t, 8.4 * t, 0); scars.push(g);
    }
    const fronds = [];
    const top = new T.Vector3(0.5, 8.4, 0);
    for (let i = 0; i < 11; i++) {
      const az = i / 11 * Math.PI * 2 + (i % 2) * 0.2, droop = 0.35 + (i % 3) * 0.25, len = 4.2 + (i % 2) * 0.8;
      const rows = [];
      for (let j = 0; j <= 7; j++) {
        const s = j / 7, w = 0.75 * Math.sin(Math.PI * Math.min(1, s * 1.15)) + 0.05;
        const out = len * s, up = 1.1 * s - droop * 3.2 * s * s;
        const c = new T.Vector3(top.x + Math.cos(az) * out, top.y + up, top.z + Math.sin(az) * out);
        const side = new T.Vector3(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(w);
        rows.push([c.clone().sub(side).setY(c.y - 0.12 * w), c.clone(), c.clone().add(side).setY(c.y - 0.12 * w)]);
      }
      const g = K.gridSurface(rows);
      fronds.push(g);
    }
    return { trunk: K.merge([trunk, ...scars]), fronds: K.merge(fronds) };
  };

  // Low-poly date palm for street planting in quantity (~300 triangles).
  K.palmLite = () => {
    const pts = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new T.Vector3(0.45 * t * t, 8.2 * t, 0)); }
    const trunk = K.tube(pts, 0.24, 8, 6);
    const top = new T.Vector3(0.45, 8.2, 0), fronds = [];
    for (let i = 0; i < 9; i++) {
      const az = i / 9 * Math.PI * 2 + (i % 2) * 0.3, droop = 0.4 + (i % 3) * 0.22, len = 4 + (i % 2) * 0.7, rows = [];
      for (let j = 0; j <= 5; j++) {
        const s = j / 5, w = 0.7 * Math.sin(Math.PI * Math.min(1, s * 1.15)) + 0.05, out = len * s, up = 1.0 * s - droop * 3 * s * s;
        const c = new T.Vector3(top.x + Math.cos(az) * out, top.y + up, top.z + Math.sin(az) * out);
        const side = new T.Vector3(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(w);
        rows.push([c.clone().sub(side).setY(c.y - 0.1 * w), c.clone(), c.clone().add(side).setY(c.y - 0.1 * w)]);
      }
      fronds.push(K.gridSurface(rows));
    }
    return { trunk, fronds: K.merge(fronds) };
  };

  // Instanced palms at [x, z, scale, rotation] positions on a height function y(x, z).
  K.palmGrove = (spots, heightAt, materials) => {
    const geo = K.palm();
    const trunks = new T.InstancedMesh(geo.trunk, materials.trunk, spots.length);
    const crowns = new T.InstancedMesh(geo.fronds, materials.fronds, spots.length);
    const m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3();
    spots.forEach(([x, z, k, rot], i) => {
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), rot);
      m.compose(p.set(x, heightAt(x, z) - 0.2, z), q, s.set(k, k, k));
      trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m);
    });
    return [trunks, crowns];
  };

  K.helipad = () => K.texture(K.canvas(512, 512, (c, w) => {
    c.fillStyle = '#3f5546'; c.fillRect(0, 0, w, w);
    c.strokeStyle = '#ffffff'; c.lineWidth = 16; c.beginPath(); c.arc(w / 2, w / 2, w * 0.4, 0, 7); c.stroke();
    c.lineWidth = 6; c.beginPath(); c.arc(w / 2, w / 2, w * 0.47, 0, 7); c.stroke();
    c.fillStyle = '#ffffff'; c.font = '700 230px Manrope, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', w / 2, w / 2 + 10);
  }), { repeat: false });

  /* Equirectangular sky used for image-based lighting and reflections, per map theme. */
  K.sky = (theme, sunDir) => K.canvas(1024, 512, (c, w, h) => {
    const P = {
      day: ['#3f7fcf', '#a9cbef', '#eef1ee', '#d9c8a6', '#a8946f'],
      dusk: ['#232c63', '#8c6aa1', '#ffb070', '#c9946c', '#7a5a48'],
      night: ['#02040b', '#0b1428', '#24314f', '#0d1018', '#05070b'],
    }[theme === 'satellite' ? 'day' : theme] || ['#3f7fcf', '#a9cbef', '#eef1ee', '#cdb995', '#8d7a5d'];
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, P[0]); g.addColorStop(0.32, P[1]); g.addColorStop(0.495, P[2]); g.addColorStop(0.51, P[3]); g.addColorStop(1, P[4]);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // a city skyline band on the horizon gives the glass something to reflect
    const r = K.rng(4);
    for (let x = 0; x < w; x += 3 + r() * 7) {
      const bh = 4 + r() * r() * 46, bw = 3 + r() * 9;
      c.fillStyle = theme === 'night' ? 'rgba(20,26,40,0.95)' : theme === 'dusk' ? 'rgba(70,52,62,0.8)' : 'rgba(120,128,138,0.55)';
      c.fillRect(x, h * 0.5 - bh, bw, bh);
      if (theme === 'night') for (let k = 0; k < bh / 4; k++) if (r() < 0.35) { c.fillStyle = r() < 0.5 ? '#ffd38a' : '#cfe0ff'; c.fillRect(x + r() * bw, h * 0.5 - r() * bh, 1.2, 1.2); }
    }
    if (sunDir && theme !== 'night') {
      const u = (Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI) + 0.5) * w;
      const v = (0.5 - Math.asin(sunDir.y) / Math.PI) * h;
      const s = c.createRadialGradient(u, v, 0, u, v, theme === 'dusk' ? 160 : 90);
      s.addColorStop(0, 'rgba(255,250,235,1)'); s.addColorStop(0.15, theme === 'dusk' ? 'rgba(255,190,120,0.9)' : 'rgba(255,248,225,0.8)'); s.addColorStop(1, 'rgba(255,220,180,0)');
      c.fillStyle = s; c.fillRect(0, 0, w, h);
    }
  });

  window.DT = window.DT || {};
  window.DT.kit = K;
  window.DT.MODEL_DEFS = window.DT.MODEL_DEFS || {};
})();
