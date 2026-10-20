/* Simulated movement on the real network, rendered with deck.gl interleaved into MapLibre.
 * - Traffic: every OSM motorway/trunk/primary carriageway (data/roads.js) is split into lanes and each lane
 *   carries an endless stream of vehicles; a shader repeats vehicles every `period` seconds along the lane.
 * - Transit: trains run the OSM route geometries (data/transit.js) at line speed with the line's headway.
 * Movement is simulated, not live: Dubai has no open real-time vehicle feed. */
(function () {
  'use strict';

  const WRAP = 3600;                                // currentTime wraps here; a multiple of every period below
  const SPEED = [27, 22, 15];                        // m/s on motorway, trunk, primary
  const LINK_SPEED = 13;
  const DENSITY = { light: 6, normal: 3.6, rush: 2 }; // seconds between vehicles in one lane
  const TRAIN = {
    subway: { speed: 14, headway: 150, length: 90 },
    tram: { speed: 7, headway: 300, length: 44 },
    monorail: { speed: 11, headway: 300, length: 30 },
    train: { speed: 33, headway: 600, length: 210 },
  };
  const CAR_COLOURS = {
    day: [[44, 55, 72], [255, 255, 255], [128, 138, 152], [190, 52, 40], [32, 80, 150], [70, 74, 80]],
    dusk: [[58, 44, 52], [255, 246, 232], [150, 128, 138], [205, 72, 52], [64, 84, 150], [100, 86, 90]],
    night: [[255, 250, 235], [255, 244, 214], [255, 220, 160], [255, 52, 44], [255, 70, 50], [255, 250, 235]],
    satellite: [[255, 255, 255], [255, 224, 130], [255, 255, 255], [255, 96, 76], [130, 205, 255], [235, 235, 235]],
  };
  const TRAIL = { day: 1.6, dusk: 2.4, night: 4.2, satellite: 1.8 };

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const RAD = Math.PI / 180, R = 6371008.8;
  function metres(a, b) {
    const k = Math.cos(((a[1] + b[1]) / 2) * RAD);
    const dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy) * RAD * R;
  }
  function cumulative(coords) {
    const out = [0];
    for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + metres(coords[i - 1], coords[i]));
    return out;
  }
  // Shift a polyline sideways by `m` metres (positive = right of the travel direction).
  function offsetLine(coords, m) {
    if (!m) return coords;
    const n = coords.length;
    return coords.map((c, i) => {
      const k = Math.cos(c[1] * RAD);
      const a = coords[Math.max(0, i - 1)], b = coords[Math.min(n - 1, i + 1)];
      let dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      return [c[0] + (dy * m) / (R * RAD * k), c[1] + (-dx * m) / (R * RAD)];
    });
  }
  function simplify(points, tol) {
    if (points.length <= 2) return points;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]], sq = tol * tol;
    while (stack.length) {
      const [a, b] = stack.pop();
      let max = 0, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const p = points[i], A = points[a], B = points[b];
        let x = A[0], y = A[1], dx = B[0] - x, dy = B[1] - y;
        if (dx || dy) { const t = Math.max(0, Math.min(1, ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy))); x += dx * t; y += dy * t; }
        const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
        if (d > max) { max = d; idx = i; }
      }
      if (max > sq) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return points.filter((_, i) => keep[i]);
  }
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const tint = (c, k) => c.map((v) => Math.round(v + (255 - v) * k));

  // Lanes per carriageway class, as lateral offsets in metres from the OSM centreline.
  function lanesFor(cls, link, oneway) {
    if (link) return [0];
    if (cls === 0) return [-3.6, 0, 3.6];
    if (cls === 1) return [-1.8, 1.8];
    return oneway ? [-1.8, 1.8] : [2.6];
  }

  function buildLanes(edges, seed) {
    const r = rng(seed), lanes = [];
    for (const [, , oneway, cls, link, coords] of edges) {
      const dirs = oneway ? [coords] : [coords, coords.slice().reverse()];
      for (const dir of dirs) {
        lanesFor(cls, link, oneway).forEach((off, li, all) => {
          const path = offsetLine(dir, off);
          const cum = cumulative(path);
          // inner lanes run a little faster; each lane gets its own phase so vehicles don't line up
          const v = (link ? LINK_SPEED : SPEED[cls]) * (1 + (all.length > 1 ? (li / (all.length - 1) - 0.5) * -0.16 : 0)) * (0.92 + r() * 0.16);
          const phase = r() * 60;
          // lifted 0.6 m so vehicles ride on top of the 3D asphalt in the detailed district
          lanes.push({ path: path.map(([x, y]) => [x, y, 0.6]), ts: cum.map((d) => phase + d / v), jitter: 0.75 + r() * 0.5, c: Math.floor(r() * 6) });
        });
      }
    }
    return lanes;
  }

  // Each line is split into above-ground pieces (tunnels removed); `start` keeps the timing continuous, so a
  // train that enters a tunnel reappears at the far portal on time. Viaduct vertices carry their height as z.
  function buildTrains(paths) {
    const out = [];
    paths.forEach((p, i) => {
      const m = TRAIN[p.mode];
      if (!m) return;
      const phase = (i * 37) % m.headway;
      const colour = tint(hex(p.colour), 0.6);
      for (const piece of p.pieces) {
        const path = simplify(piece.path, p.mode === 'train' ? 0.0001 : 0.00002);
        if (path.length < 2) continue;
        const cum = cumulative(path);
        out.push({ path: path.map(([x, y, h]) => [x, y, (h || 0) + 0.6]), ts: cum.map((d) => phase + (piece.start + d) / m.speed), period: m.headway, colour });
      }
    });
    return out;
  }

  // TripsLayer whose vehicles repeat every `period` seconds along each path instead of appearing once.
  function defineFlowLayer() {
    class FlowLayer extends deck.TripsLayer {
      getShaders() {
        const shaders = super.getShaders();
        shaders.inject = {
          'vs:#decl': 'in float instanceTimestamps;\nin float instanceNextTimestamps;\nin float instancePeriods;\nout float vTime;\nout float vPeriod;\n',
          'vs:#main-end': 'vTime = instanceTimestamps + (instanceNextTimestamps - instanceTimestamps) * vPathPosition.y / vPathLength;\nvPeriod = instancePeriods;\n',
          'fs:#decl': 'in float vTime;\nin float vPeriod;\n',
          'fs:#main-start': 'if (mod(trips.currentTime - vTime, vPeriod) > trips.trailLength) { discard; }\n',
          'fs:DECKGL_FILTER_COLOR': 'if (trips.fadeTrail) { color.a *= 1.0 - 0.85 * mod(trips.currentTime - vTime, vPeriod) / trips.trailLength; }\n',
        };
        return shaders;
      }
      initializeState() {
        super.initializeState();
        this.getAttributeManager().addInstanced({ instancePeriods: { size: 1, accessor: 'getPeriod', defaultValue: 4 } });
      }
    }
    FlowLayer.layerName = 'FlowLayer';
    FlowLayer.defaultProps = { getPeriod: { type: 'accessor', value: 4 } };
    return FlowLayer;
  }

  function createSim(map, D, opts) {
    if (!window.deck || !deck.MapboxOverlay || !deck.TripsLayer) return null;
    const FlowLayer = defineFlowLayer();
    const state = {
      theme: opts.theme, traffic: opts.traffic, trains: opts.trains, speed: opts.speed || 6,
      density: DENSITY[opts.density] ? opts.density : 'normal', time: 0, last: performance.now(), beforeId: opts.beforeId,
    };
    const lanes = buildLanes(D.roads.edges, 11);
    const trains = buildTrains(D.transit.paths);
    const overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay);

    function layers() {
      const t = state.time % WRAP;
      const palette = CAR_COLOURS[state.theme] || CAR_COLOURS.day;
      const headway = DENSITY[state.density];
      const out = [];
      if (state.traffic) {
        out.push(new FlowLayer({
          id: 'sim-traffic', data: lanes, beforeId: state.beforeId,
          getPath: (d) => d.path, getTimestamps: (d) => d.ts, getPeriod: (d) => headway * d.jitter, getColor: (d) => palette[d.c],
          updateTriggers: { getColor: state.theme, getPeriod: state.density },
          currentTime: t, trailLength: TRAIL[state.theme] || 2, fadeTrail: true,
          widthUnits: 'meters', getWidth: 2.2, widthMinPixels: 1.2, widthMaxPixels: 7, capRounded: true, jointRounded: true,
        }));
      }
      if (state.trains) {
        out.push(new FlowLayer({
          id: 'sim-trains', data: trains, beforeId: state.beforeId,
          getPath: (d) => d.path, getTimestamps: (d) => d.ts, getPeriod: (d) => d.period, getColor: (d) => d.colour,
          currentTime: t, trailLength: 6.4, fadeTrail: false,
          widthUnits: 'meters', getWidth: 7, widthMinPixels: 3, widthMaxPixels: 16, capRounded: true, jointRounded: true,
        }));
      }
      return out;
    }

    function frame(now) {
      const dt = Math.min(0.1, (now - state.last) / 1000);
      state.last = now;
      if (state.traffic || state.trains) {
        state.time = (state.time + dt * state.speed) % WRAP;
        overlay.setProps({ layers: layers() });
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      stats: { lanes: lanes.length, trains: trains.length },
      setTraffic(on) { state.traffic = on; overlay.setProps({ layers: layers() }); },
      setTrains(on) { state.trains = on; overlay.setProps({ layers: layers() }); },
      setSpeed(x) { state.speed = x; },
      setTheme(theme) { state.theme = theme; },
      setDensity(d) { if (DENSITY[d]) { state.density = d; overlay.setProps({ layers: layers() }); } },
    };
  }

  window.DT = window.DT || {};
  window.DT.createSim = createSim;
})();
