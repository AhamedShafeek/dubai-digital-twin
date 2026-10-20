/* Procedural facade textures for the Downtown district fabric.
 * Every facade texture is one tile `tileW` metres wide and `floors` storeys high, so the generator can align
 * window rows with each building's real floor height. Maps per texture:
 *   map (sRGB colour) · rm (roughness in G, metalness in B) · emissive (night interiors) · optional alpha.
 */
(function () {
  'use strict';

  let cache = null;
  DT.downtownTextures = function (K, T, aniso) {
    if (cache) return cache;
    const rgb = (h, k = 1) => {
      const n = parseInt(h.slice(1), 16);
      return `rgb(${Math.min(255, ((n >> 16) & 255) * k) | 0},${Math.min(255, ((n >> 8) & 255) * k) | 0},${Math.min(255, (n & 255) * k) | 0})`;
    };
    const tex = (canvas, color = true) => K.texture(canvas, { color, anisotropy: aniso });
    const noise = (c, w, h, amount, seed) => {
      const img = c.getImageData(0, 0, w, h), d = img.data, r = K.rng(seed);
      for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amount; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      c.putImageData(img, 0, 0);
    };
    const grime = (c, w, h, seed, alpha = 0.08) => {
      // rain streaks and dust from sills downward
      const r = K.rng(seed);
      for (let i = 0; i < w / 6; i++) {
        const x = r() * w, y = r() * h, len = 20 + r() * 120;
        const g = c.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, `rgba(60,55,45,${alpha})`); g.addColorStop(1, 'rgba(60,55,45,0)');
        c.fillStyle = g; c.fillRect(x, y, 1 + r() * 3, len);
      }
    };
    const interior = (c, x, y, w, h, r, night) => {
      // what is visible behind a pane: ceiling glow, a curtain or blind, furniture silhouettes
      if (night) {
        const warm = r() < 0.55;
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, warm ? 'rgba(255,224,170,1)' : 'rgba(225,236,255,1)');
        g.addColorStop(1, warm ? 'rgba(200,140,80,0.8)' : 'rgba(150,170,210,0.8)');
        c.fillStyle = g; c.fillRect(x, y, w, h);
        if (r() < 0.5) { c.fillStyle = 'rgba(40,30,20,0.45)'; c.fillRect(x + w * r() * 0.6, y + h * 0.55, w * 0.3, h * 0.45); }
        return;
      }
      const kind = r();
      if (kind < 0.3) { c.fillStyle = `rgba(${200 + r() * 40 | 0},${190 + r() * 40 | 0},${170 + r() * 40 | 0},0.35)`; c.fillRect(x, y, w * (0.2 + r() * 0.5), h); }
      else if (kind < 0.5) { for (let k = 0; k < h; k += 4) { c.fillStyle = 'rgba(230,230,225,0.22)'; c.fillRect(x, y + k, w, 2); } }
    };

    // ------------------------------------------------------------------ curtain walls
    const CURTAIN = {
      blue: { glass: ['#7c9fc1', '#2f4f73'], mull: '#d4d9de', band: '#26303b' },
      silver: { glass: ['#c2ccd6', '#7d8c9b'], mull: '#e8ebee', band: '#4a525b' },
      green: { glass: ['#86b0ab', '#2e5a57'], mull: '#d0d8d6', band: '#25332f' },
      dark: { glass: ['#5d6d7f', '#1d2733'], mull: '#a3acb5', band: '#151b22' },
      bronze: { glass: ['#b9a284', '#5c4a36'], mull: '#c9b493', band: '#2e261e' },
      navy: { glass: ['#6b84b3', '#1f3463'], mull: '#c3cad6', band: '#141d33' },
    };
    function curtain(name, seed) {
      const P = CURTAIN[name], S = 1024, bays = 8, floors = 4, bw = S / bays, fh = S / floors, band = Math.round(fh * 0.1);
      const r = K.rng(seed), cells = [];
      for (let j = 0; j < floors; j++) for (let i = 0; i < bays; i++) cells.push({ k: 0.9 + r() * 0.2, lit: r() < 0.26, sky: r() });
      const map = K.canvas(S, S, (c) => {
        // a soft diagonal sky reflection across the whole tile, then per-pane variation
        for (let j = 0; j < floors; j++) for (let i = 0; i < bays; i++) {
          const cell = cells[j * bays + i], x = i * bw, y = j * fh;
          const g = c.createLinearGradient(x, y, x + bw * 0.6, y + fh);
          g.addColorStop(0, rgb(P.glass[0], cell.k)); g.addColorStop(1, rgb(P.glass[1], cell.k));
          c.fillStyle = g; c.fillRect(x, y, bw, fh - band);
          interior(c, x + 4, y + 4, bw - 8, fh - band - 8, r, false);
          if (cell.sky > 0.7) { c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.moveTo(x, y + fh * 0.7); c.lineTo(x + bw * 0.5, y); c.lineTo(x + bw, y); c.lineTo(x, y + fh); c.fill(); }
          c.fillStyle = P.band; c.fillRect(x, y + fh - band, bw, band);                         // spandrel / slab edge
          c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, y + fh - band, bw, 2);
          c.fillStyle = P.mull; c.fillRect(x, y + Math.round((fh - band) * 0.72), bw, 3);      // transom
        }
        noise(c, S, S, 7, seed);
        for (let i = 0; i <= bays; i++) {                                                      // vertical mullions
          const x = i * bw;
          c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 4, 0, 3, S);
          c.fillStyle = P.mull; c.fillRect(x - 4, 0, 8, S);
          c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x - 3, 0, 2, S);
        }
      });
      const rm = K.canvas(256, 256, (c) => {
        const b = 256 / bays, f = 256 / floors, bd = Math.max(2, Math.round(f * 0.1));
        c.fillStyle = 'rgb(0,16,205)'; c.fillRect(0, 0, 256, 256);
        for (let j = 0; j < floors; j++) { c.fillStyle = 'rgb(0,120,180)'; c.fillRect(0, j * f + f - bd, 256, bd); }
        for (let i = 0; i <= bays; i++) { c.fillStyle = 'rgb(0,110,120)'; c.fillRect(i * b - 2, 0, 4, 256); }
      });
      const emissive = K.canvas(512, 512, (c) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
        const b = 512 / bays, f = 512 / floors, bd = Math.round(f * 0.1);
        cells.forEach((cell, n) => {
          if (!cell.lit) return;
          const i = n % bays, j = Math.floor(n / bays);
          interior(c, i * b + 3, j * f + 3, b - 6, f - bd - 6, r, true);
        });
      });
      return { map: tex(map), rm: tex(rm, false), emissive: tex(emissive), tileW: 12, floors };
    }

    // ------------------------------------------------------------------ residential (floor-to-ceiling doors behind balconies)
    const RESI = { white: ['#e6e2da', '#d0cabd'], cream: ['#ded1b8', '#c4b293'], grey: ['#c9ccce', '#a8adb1'], sand: ['#d4c09c', '#b49d74'] };
    function residential(name, seed) {
      const [wall, shade] = RESI[name], S = 1024, bays = 4, floors = 4, bw = S / bays, fh = S / floors;
      const r = K.rng(seed), cells = [];
      for (let j = 0; j < floors; j++) for (let i = 0; i < bays; i++) cells.push({ lit: r() < 0.3, wide: r() < 0.5 });
      const winRect = (i, j, cell) => {
        const w = bw * (cell.wide ? 0.78 : 0.56), x = i * bw + (bw - w) / 2, y = j * fh + fh * 0.12, h = fh * 0.74;
        return [x, y, w, h];
      };
      const map = K.canvas(S, S, (c) => {
        c.fillStyle = wall; c.fillRect(0, 0, S, S);
        noise(c, S, S, 10, seed);
        for (let j = 0; j < floors; j++) {
          c.fillStyle = shade; c.fillRect(0, j * fh + fh - 14, S, 14);                          // slab line
          c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, j * fh + fh - 2, S, 2);
          for (let i = 0; i < bays; i++) {
            const cell = cells[j * bays + i], [x, y, w, h] = winRect(i, j, cell);
            c.fillStyle = '#2e3b47'; c.fillRect(x - 6, y - 6, w + 12, h + 12);                   // frame
            const g = c.createLinearGradient(x, y, x, y + h);
            g.addColorStop(0, '#7f97ab'); g.addColorStop(1, '#2c3d4e');
            c.fillStyle = g; c.fillRect(x, y, w, h);
            interior(c, x, y, w, h, r, false);
            c.fillStyle = '#d9dee2'; c.fillRect(x + w / 2 - 2, y, 4, h);                        // sliding door meeting stile
            c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x - 6, y - 6, w + 12, 8);              // head shadow
          }
        }
        grime(c, S, S, seed + 1, 0.05);
      });
      const rm = K.canvas(256, 256, (c) => {
        c.fillStyle = 'rgb(0,200,0)'; c.fillRect(0, 0, 256, 256);
        const k = 256 / S;
        for (let j = 0; j < floors; j++) for (let i = 0; i < bays; i++) {
          const [x, y, w, h] = winRect(i, j, cells[j * bays + i]);
          c.fillStyle = 'rgb(0,18,180)'; c.fillRect(x * k, y * k, w * k, h * k);
        }
      });
      const emissive = K.canvas(512, 512, (c) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
        const k = 512 / S;
        cells.forEach((cell, n) => {
          if (!cell.lit) return;
          const [x, y, w, h] = winRect(n % bays, Math.floor(n / bays), cell);
          interior(c, x * k, y * k, w * k, h * k, r, true);
        });
      });
      return { map: tex(map), rm: tex(rm, false), emissive: tex(emissive), tileW: 14, floors };
    }

    // ------------------------------------------------------------------ stone office / hotel with punched windows
    function stone(base, seed) {
      const S = 1024, bays = 4, floors = 4, bw = S / bays, fh = S / floors;
      const r = K.rng(seed), lit = Array.from({ length: bays * floors }, () => r() < 0.4);
      const win = (i, j) => [i * bw + bw * 0.2, j * fh + fh * 0.18, bw * 0.6, fh * 0.6];
      const map = K.canvas(S, S, (c) => {
        c.fillStyle = base; c.fillRect(0, 0, S, S);
        noise(c, S, S, 14, seed);
        // stone joints
        c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 2;
        for (let y = 0; y < S; y += fh / 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
        for (let j = 0; j < floors * 4; j++) for (let x = (j % 2) * bw / 4; x < S; x += bw / 2) { c.beginPath(); c.moveTo(x, j * fh / 4); c.lineTo(x, (j + 1) * fh / 4); c.stroke(); }
        for (let j = 0; j < floors; j++) {
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, j * fh + fh - 18, S, 6);         // string course
          c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, j * fh + fh - 12, S, 4);
          for (let i = 0; i < bays; i++) {
            const [x, y, w, h] = win(i, j);
            c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x - 10, y - 10, w + 20, h + 20);       // reveal
            c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x - 10, y + h + 4, w + 20, 6);    // sill
            const g = c.createLinearGradient(x, y, x + w, y + h);
            g.addColorStop(0, '#8ea6ba'); g.addColorStop(1, '#3d4f60');
            c.fillStyle = g; c.fillRect(x, y, w, h);
            interior(c, x, y, w, h, r, false);
            c.fillStyle = '#e1e3e2'; c.fillRect(x + w / 2 - 3, y, 6, h); c.fillRect(x, y + h * 0.3, w, 5);
          }
        }
        grime(c, S, S, seed + 2, 0.07);
      });
      const rm = K.canvas(256, 256, (c) => {
        c.fillStyle = 'rgb(0,215,0)'; c.fillRect(0, 0, 256, 256);
        for (let j = 0; j < floors; j++) for (let i = 0; i < bays; i++) { const [x, y, w, h] = win(i, j).map((v) => v / 4); c.fillStyle = 'rgb(0,20,170)'; c.fillRect(x, y, w, h); }
      });
      const emissive = K.canvas(512, 512, (c) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
        lit.forEach((on, n) => { if (!on) return; const [x, y, w, h] = win(n % bays, Math.floor(n / bays)).map((v) => v / 2); interior(c, x, y, w, h, r, true); });
      });
      return { map: tex(map), rm: tex(rm, false), emissive: tex(emissive), tileW: 12, floors };
    }

    // ------------------------------------------------------------------ Old Town: Arabic stucco, arches, mashrabiya
    function arabic(base, seed, arcade = false) {
      const S = 1024, bays = 3, floors = arcade ? 1 : 2, bw = S / bays, fh = S / floors;
      const r = K.rng(seed), kinds = Array.from({ length: bays * floors }, () => r());
      const lit = kinds.map(() => r() < 0.5);
      const arch = (c, x, y, w, h, pointed) => {
        c.beginPath();
        c.moveTo(x, y + h); c.lineTo(x, y + w / 2);
        if (pointed) { c.quadraticCurveTo(x, y, x + w / 2, y - w * 0.12); c.quadraticCurveTo(x + w, y, x + w, y + w / 2); }
        else c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
        c.lineTo(x + w, y + h); c.closePath();
      };
      const opening = (i, j) => arcade
        ? [i * bw + bw * 0.1, j * fh + fh * 0.12, bw * 0.8, fh * 0.88]
        : [i * bw + bw * 0.3, j * fh + fh * 0.2, bw * 0.4, fh * 0.6];
      const map = K.canvas(S, S, (c) => {
        c.fillStyle = base; c.fillRect(0, 0, S, S);
        noise(c, S, S, 22, seed);
        const r2 = K.rng(seed + 5);
        for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${r2() < 0.5 ? '255,250,240' : '120,95,60'},0.05)`; c.beginPath(); c.arc(r2() * S, r2() * S, 8 + r2() * 40, 0, 7); c.fill(); }
        for (let j = 0; j < floors; j++) {
          c.fillStyle = 'rgba(110,80,45,0.22)'; c.fillRect(0, j * fh + fh - 22, S, 10);          // floor band
          c.fillStyle = 'rgba(255,248,235,0.25)'; c.fillRect(0, j * fh + fh - 26, S, 4);
          for (let i = 0; i < bays; i++) {
            const k = kinds[j * bays + i], [x, y, w, h] = opening(i, j), pointed = k > 0.5;
            // recessed frame then the opening
            c.fillStyle = 'rgba(90,65,35,0.35)'; arch(c, x - 12, y - 12, w + 24, h + 12, pointed); c.fill();
            if (arcade) {
              const g = c.createLinearGradient(0, y, 0, y + h);
              g.addColorStop(0, '#3b2c1e'); g.addColorStop(1, '#6b5238');
              c.fillStyle = g; arch(c, x, y, w, h, pointed); c.fill();
              c.fillStyle = 'rgba(255,220,160,0.25)'; c.fillRect(x + w * 0.2, y + h * 0.45, w * 0.6, h * 0.5); // shopfront in the shade
            } else if (k < 0.35) {
              // mashrabiya: carved timber lattice screen
              c.fillStyle = '#6a4a2c'; arch(c, x, y, w, h, pointed); c.fill();
              c.save(); arch(c, x, y, w, h, pointed); c.clip();
              c.strokeStyle = 'rgba(40,25,12,0.9)'; c.lineWidth = 3;
              for (let d = -h; d < w + h; d += 14) { c.beginPath(); c.moveTo(x + d, y); c.lineTo(x + d - h, y + h); c.stroke(); c.beginPath(); c.moveTo(x + d, y); c.lineTo(x + d + h, y + h); c.stroke(); }
              c.restore();
            } else {
              const g = c.createLinearGradient(x, y, x, y + h);
              g.addColorStop(0, '#5f7488'); g.addColorStop(1, '#283745');
              c.fillStyle = g; arch(c, x, y, w, h, pointed); c.fill();
              c.fillStyle = 'rgba(80,58,32,0.9)'; c.fillRect(x + w / 2 - 3, y + w / 2, 6, h - w / 2);  // timber mullion
              c.fillRect(x, y + h * 0.62, w, 5);
            }
            c.fillStyle = 'rgba(255,248,235,0.4)'; c.fillRect(x - 14, y + h, w + 28, 7);            // sill
          }
          // timber lintel beam ends (danchal) under each floor band
          for (let x = 18; x < S; x += 44) { c.fillStyle = '#5a3d22'; c.fillRect(x, j * fh + fh - 34, 12, 10); }
        }
        grime(c, S, S, seed + 3, 0.06);
      });
      const rm = K.canvas(128, 128, (c) => { c.fillStyle = 'rgb(0,235,0)'; c.fillRect(0, 0, 128, 128); });
      const emissive = K.canvas(512, 512, (c) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
        kinds.forEach((k, n) => {
          if (!lit[n] && !arcade) return;
          const [x, y, w, h] = opening(n % bays, Math.floor(n / bays)).map((v) => v / 2);
          c.save(); arch(c, x, y, w, h, k > 0.5); c.clip();
          c.fillStyle = k < 0.35 && !arcade ? 'rgba(255,170,80,0.55)' : 'rgba(255,205,140,0.95)'; c.fillRect(x, y, w, h);
          if (k < 0.35 && !arcade) { c.strokeStyle = '#000'; c.lineWidth = 2; for (let d = -h; d < w + h; d += 7) { c.beginPath(); c.moveTo(x + d, y); c.lineTo(x + d - h, y + h); c.stroke(); } }
          c.restore();
        });
      });
      return { map: tex(map), rm: tex(rm, false), emissive: tex(emissive), tileW: arcade ? 12 : 10, floors };
    }

    // ------------------------------------------------------------------ ground-floor storefronts (one 6 m storey)
    function retail(seed) {
      const S = 1024, bays = 4, bw = S / bays, r = K.rng(seed);
      const signs = Array.from({ length: bays }, () => ({ on: r() < 0.6, hue: Math.floor(r() * 360) }));
      const map = K.canvas(S, S, (c) => {
        c.fillStyle = '#d7d4cc'; c.fillRect(0, 0, S, S);
        const top = S * 0.2;
        c.fillStyle = '#2d3238'; c.fillRect(0, 0, S, top);                                      // fascia / signage band
        signs.forEach((s, i) => { if (s.on) { c.fillStyle = `hsl(${s.hue},25%,78%)`; c.fillRect(i * bw + bw * 0.15, top * 0.3, bw * 0.7, top * 0.35); } });
        for (let i = 0; i < bays; i++) {
          const x = i * bw;
          const g = c.createLinearGradient(0, top, 0, S);
          g.addColorStop(0, '#7f97ab'); g.addColorStop(0.5, '#4b5d6c'); g.addColorStop(1, '#2c3843');
          c.fillStyle = g; c.fillRect(x + 8, top + 10, bw - 16, S - top - 10);
          // displays and people-height clutter behind the glass
          for (let k = 0; k < 5; k++) { c.fillStyle = `rgba(${150 + r() * 100 | 0},${130 + r() * 100 | 0},${110 + r() * 100 | 0},0.35)`; c.fillRect(x + 20 + r() * (bw - 80), S - 60 - r() * 260, 20 + r() * 50, 30 + r() * 120); }
          c.fillStyle = '#c8ccd0'; c.fillRect(x, top, 10, S - top); c.fillRect(x + bw / 2 - 3, top + (S - top) * 0.25, 6, (S - top) * 0.75);
          c.fillRect(x, top + (S - top) * 0.25, bw, 6);
        }
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, top, S, 20);                            // canopy shadow
      });
      const rm = K.canvas(128, 128, (c) => { c.fillStyle = 'rgb(0,20,200)'; c.fillRect(0, 0, 128, 128); c.fillStyle = 'rgb(0,150,80)'; c.fillRect(0, 0, 128, 26); });
      const emissive = K.canvas(512, 512, (c) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
        const top = 512 * 0.2, b = 512 / bays;
        for (let i = 0; i < bays; i++) {
          const g = c.createLinearGradient(0, top, 0, 512);
          g.addColorStop(0, 'rgba(255,236,200,1)'); g.addColorStop(1, 'rgba(255,200,140,0.7)');
          c.fillStyle = g; c.fillRect(i * b + 4, top + 5, b - 8, 512 - top - 5);
          if (signs[i].on) { c.fillStyle = `hsl(${signs[i].hue},90%,65%)`; c.fillRect(i * b + b * 0.15, top * 0.3, b * 0.7, top * 0.35); }
        }
      });
      return { map: tex(map), rm: tex(rm, false), emissive: tex(emissive), tileW: 10, floors: 1 };
    }

    // ------------------------------------------------------------------ louvres, screens, concrete, roofs
    function louvre(seed) {
      const S = 512;
      const map = K.canvas(S, S, (c) => {
        c.fillStyle = '#6d747b'; c.fillRect(0, 0, S, S);
        for (let y = 0; y < S; y += 16) {
          const g = c.createLinearGradient(0, y, 0, y + 16);
          g.addColorStop(0, '#c9ced3'); g.addColorStop(0.55, '#9aa1a8'); g.addColorStop(1, '#4b5157');
          c.fillStyle = g; c.fillRect(0, y, S, 14);
        }
        for (let x = 0; x < S; x += 128) { c.fillStyle = '#5a6066'; c.fillRect(x, 0, 6, S); }
        noise(c, S, S, 8, seed);
      });
      const rm = K.canvas(64, 64, (c) => { c.fillStyle = 'rgb(0,110,230)'; c.fillRect(0, 0, 64, 64); });
      return { map: tex(map), rm: tex(rm, false), tileW: 6, floors: 1, floorH: 6 };
    }
    function screen(seed) {
      // perforated metal with an Arabic geometric (eight-point star) pattern, as on Downtown podiums and car parks
      const S = 512;
      const draw = (c, holes) => {
        c.fillStyle = holes ? '#fff' : '#c9c2b4'; c.fillRect(0, 0, S, S);
        if (!holes) noise(c, S, S, 10, seed);
        c.fillStyle = holes ? '#000' : '#4d4a44';
        const step = 64;
        for (let y = step / 2; y < S; y += step) for (let x = step / 2; x < S; x += step) {
          c.save(); c.translate(x, y);
          for (let k = 0; k < 2; k++) { c.rotate(Math.PI / 4); c.fillRect(-14, -14, 28, 28); }
          c.restore();
        }
        if (!holes) { c.strokeStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x <= S; x += 256) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); } }
      };
      const map = K.canvas(S, S, (c) => draw(c, false));
      const alpha = K.canvas(S, S, (c) => draw(c, true));
      const rm = K.canvas(64, 64, (c) => { c.fillStyle = 'rgb(0,140,200)'; c.fillRect(0, 0, 64, 64); });
      return { map: tex(map), alpha: tex(alpha, false), rm: tex(rm, false), tileW: 8, floors: 1, floorH: 8 };
    }
    function concrete(seed) {
      const S = 512;
      const map = K.canvas(S, S, (c) => {
        c.fillStyle = '#b3afa6'; c.fillRect(0, 0, S, S);
        noise(c, S, S, 26, seed);
        c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2;
        for (let y = 0; y <= S; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
        for (let x = 0; x <= S; x += 256) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
        c.fillStyle = 'rgba(0,0,0,0.25)';
        for (let y = 32; y < S; y += 64) for (let x = 32; x < S; x += 64) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
        grime(c, S, S, seed, 0.1);
      });
      const rm = K.canvas(64, 64, (c) => { c.fillStyle = 'rgb(0,235,0)'; c.fillRect(0, 0, 64, 64); });
      return { map: tex(map), rm: tex(rm, false), tileW: 6, floors: 1, floorH: 6 };
    }
    function roof(seed) {
      const S = 512;
      const map = K.canvas(S, S, (c) => {
        c.fillStyle = '#c9c6bf'; c.fillRect(0, 0, S, S);
        noise(c, S, S, 30, seed);
        c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 2;
        for (let x = 0; x <= S; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
        const r = K.rng(seed);
        for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(80,80,70,0.25)'; c.beginPath(); c.arc(r() * S, r() * S, 6, 0, 7); c.fill(); }
      });
      const rm = K.canvas(64, 64, (c) => { c.fillStyle = 'rgb(0,240,0)'; c.fillRect(0, 0, 64, 64); });
      return { map: tex(map), rm: tex(rm, false), tileW: 20 };
    }
    function lattice() {
      // steel lattice for crane masts and jibs: alpha cut-out
      const S = 256;
      const draw = (c, mask) => {
        c.fillStyle = mask ? '#000' : '#f2c21b'; c.fillRect(0, 0, S, S);
        c.strokeStyle = mask ? '#fff' : '#f2c21b'; c.lineWidth = 18;
        c.strokeRect(0, 0, S, S);
        c.lineWidth = 12; c.beginPath(); c.moveTo(0, 0); c.lineTo(S, S); c.moveTo(S, 0); c.lineTo(0, S); c.stroke();
      };
      const map = K.canvas(S, S, (c) => draw(c, false));
      const alpha = K.canvas(S, S, (c) => draw(c, true));
      return { map: tex(map), alpha: tex(alpha, false) };
    }
    function windTower(seed) {
      // barjeel shaft: stucco with tall slot openings on each face
      const S = 512, r = K.rng(seed);
      const map = K.canvas(S, S, (c) => {
        c.fillStyle = '#d8c39c'; c.fillRect(0, 0, S, S);
        noise(c, S, S, 20, seed);
        for (let i = 0; i < 4; i++) {
          const x = S * (0.12 + i * 0.2);
          c.fillStyle = '#3a2a1a'; c.fillRect(x, S * 0.18, S * 0.1, S * 0.6);
          c.beginPath(); c.arc(x + S * 0.05, S * 0.18, S * 0.05, Math.PI, 0); c.fill();
          c.fillStyle = 'rgba(255,240,215,0.3)'; c.fillRect(x - 4, S * 0.78, S * 0.1 + 8, 6);
        }
        for (let x = 10; x < S; x += 40) { c.fillStyle = '#5a3d22'; c.fillRect(x, S * 0.08, 10 + r() * 2, 9); }
      });
      return { map: tex(map) };
    }

    const t0 = performance.now();
    const out = {
      curtain: { blue: curtain('blue', 11), silver: curtain('silver', 12), green: curtain('green', 13), dark: curtain('dark', 14), bronze: curtain('bronze', 15), navy: curtain('navy', 16) },
      residential: { white: residential('white', 21), cream: residential('cream', 22), grey: residential('grey', 23), sand: residential('sand', 24) },
      stone: { beige: stone('#d8ccb4', 31), light: stone('#e6e1d6', 32) },
      arabic: arabic('#d6bf95', 41),
      arcade: arabic('#d1b88c', 42, true),
      retail: retail(51),
      louvre: louvre(61),
      screen: screen(62),
      concrete: concrete(71),
      roof: roof(81),
      lattice: lattice(),
      windTower: windTower(91),
    };
    console.log(`[twin] downtown textures in ${Math.round(performance.now() - t0)} ms`);
    cache = out;
    return out;
  };
})();
