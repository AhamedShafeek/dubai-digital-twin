// Builds the static overlay datasets for the Dubai digital twin from OpenStreetMap (Overpass API).
//
//   node scripts/build-data.mjs            -> uses cached Overpass responses when present
//   node scripts/build-data.mjs --refresh  -> re-downloads everything
//
// Output: data/*.js files that assign onto window.DUBAI so index.html works from file:// too.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import osmtogeojson from 'osmtogeojson';
import polylabel from 'polylabel';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data');
const CACHE = path.join(ROOT, 'scripts', '.cache');
const REFRESH = process.argv.includes('--refresh');

const DUBAI_REL = 3766483; // "Dubai Emirate" administrative boundary (admin_level 4)
const AREA = `area(${3600000000 + DUBAI_REL})->.d;`;
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

let osmTimestamp = null;

// ---------------------------------------------------------------- Overpass

async function overpass(name, body) {
  const file = path.join(CACHE, `${name}.json`);
  if (!REFRESH) {
    try {
      const cached = JSON.parse(await fs.readFile(file, 'utf8'));
      osmTimestamp ??= cached.osm3s?.timestamp_osm_base;
      console.log(`  ${name}: cache (${cached.elements.length} elements)`);
      return cached;
    } catch { /* not cached yet */ }
  }
  const query = `[out:json][timeout:300];${body}`;
  for (let attempt = 0; attempt < 12; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'dubai-digital-twin-builder/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.remark && /runtime error/i.test(json.remark)) throw new Error(json.remark);
      await fs.mkdir(CACHE, { recursive: true });
      await fs.writeFile(file, JSON.stringify(json));
      osmTimestamp ??= json.osm3s?.timestamp_osm_base;
      console.log(`  ${name}: ${json.elements.length} elements from ${new URL(url).host}`);
      return json;
    } catch (err) {
      console.warn(`  ${name}: ${err.message} (attempt ${attempt + 1}), retrying...`);
      await new Promise((r) => setTimeout(r, Math.min(30000, 4000 * (attempt + 1))));
    }
  }
  throw new Error(`Overpass query "${name}" failed`);
}

// ---------------------------------------------------------------- geometry helpers

const r6 = (n) => Math.round(n * 1e6) / 1e6;
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const roundCoords = (c, f = r6) => (typeof c[0] === 'number' ? [f(c[0]), f(c[1])] : c.map((x) => roundCoords(x, f)));

// Douglas-Peucker on [lon, lat] arrays; tolerance in degrees (1e-5 deg ~ 1.1 m)
function simplify(points, tol) {
  if (points.length <= 2) return points;
  const sq = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDistSq(points[i], points[a], points[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sq) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function segDistSq(p, a, b) {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx || dy) {
    const t = Math.max(0, Math.min(1, ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)));
    x += dx * t; y += dy * t;
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyGeometry(g, tol) {
  const ring = (r) => {
    const s = simplify(r, tol);
    return s.length >= 4 ? s : r;
  };
  switch (g.type) {
    case 'LineString': return { type: g.type, coordinates: roundCoords(simplify(g.coordinates, tol)) };
    case 'MultiLineString': return { type: g.type, coordinates: roundCoords(g.coordinates.map((l) => simplify(l, tol))) };
    case 'Polygon': return { type: g.type, coordinates: roundCoords(g.coordinates.map(ring)) };
    case 'MultiPolygon': return { type: g.type, coordinates: roundCoords(g.coordinates.map((p) => p.map(ring))) };
    default: return g;
  }
}

// Spherical ring area (same formula as turf/area), m^2
function ringArea(coords) {
  const R = 6378137, rad = Math.PI / 180;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i], [x2, y2] = coords[i + 1];
    total += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((total * R * R) / 2);
}
const polygonArea = (rings) => rings.reduce((a, r, i) => (i === 0 ? a + ringArea(r) : a - ringArea(r)), 0);
const polygons = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const geomArea = (g) => polygons(g).reduce((a, p) => a + polygonArea(p), 0);

function labelPoint(g) {
  let best = null, bestArea = -1;
  for (const p of polygons(g)) {
    const a = polygonArea(p);
    if (a > bestArea) { bestArea = a; best = p; }
  }
  if (!best) return null;
  const pt = polylabel(best, 0.00005);
  return [r6(pt[0]), r6(pt[1])];
}

function bbox(g) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c) => {
    if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); }
    else c.forEach(walk);
  };
  walk(g.coordinates);
  return [r5(w), r5(s), r5(e), r5(n)];
}

// metres between two [lon, lat] points (equirectangular, fine at city scale)
function dist(a, b) {
  const rad = Math.PI / 180, k = Math.cos(((a[1] + b[1]) / 2) * rad);
  const dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy) * rad * 6371008.8;
}
function pointToLineMetres(p, line) {
  const k = Math.cos(p[1] * Math.PI / 180);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = [line[i][0] * k, line[i][1]], b = [line[i + 1][0] * k, line[i + 1][1]];
    best = Math.min(best, segDistSq([p[0] * k, p[1]], a, b));
  }
  return Math.sqrt(best) * (Math.PI / 180) * 6371008.8;
}

// ---------------------------------------------------------------- naming

const ARABIC = /[؀-ۿ]/;
const nameEn = (t) => t['name:en'] || (t.name && !ARABIC.test(t.name) ? t.name : null) || t['int_name'] || t['name:latin'] || t.name || null;
const nameAr = (t) => t['name:ar'] || (t.name && ARABIC.test(t.name) ? t.name : null);

// ---------------------------------------------------------------- raw element helpers

function index(json) {
  const nodes = new Map(), ways = new Map(), rels = [];
  for (const el of json.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.set(el.id, el);
    else if (el.type === 'relation') rels.push(el);
  }
  return { nodes, ways, rels };
}
const wayCoords = (way, nodes) => way.nodes.map((id) => nodes.get(id)).filter(Boolean).map((n) => [n.lon, n.lat]);

// Chains ordered relation member ways into as few continuous lines as possible (by shared node ids).
function chainWays(memberWays) {
  const lines = [];
  let cur = null; // { ids: [], first: wayIds }
  for (const w of memberWays) {
    const ids = w.nodes;
    if (!cur) { cur = ids.slice(); continue; }
    const end = cur[cur.length - 1];
    if (ids[0] === end) cur.push(...ids.slice(1));
    else if (ids[ids.length - 1] === end) cur.push(...ids.slice().reverse().slice(1));
    else if (ids[0] === cur[0] || ids[ids.length - 1] === cur[0]) {
      // the first way of the chain was oriented backwards
      cur.reverse();
      if (ids[0] === cur[cur.length - 1]) cur.push(...ids.slice(1));
      else cur.push(...ids.slice().reverse().slice(1));
    } else { lines.push(cur); cur = ids.slice(); }
  }
  if (cur) lines.push(cur);
  return lines;
}

const writeData = async (file, key, value) => {
  const js = `// Generated by scripts/build-data.mjs from OpenStreetMap (ODbL). Do not edit by hand.\nwindow.DUBAI = window.DUBAI || {};\nwindow.DUBAI.${key} = ${JSON.stringify(value)};\n`;
  await fs.writeFile(path.join(OUT, file), js);
  console.log(`  -> data/${file} ${(js.length / 1024).toFixed(0)} KB`);
};

// ---------------------------------------------------------------- datasets

async function buildBoundary() {
  const json = await overpass('boundary', `relation(${DUBAI_REL});out body;>;out skel qt;`);
  const fc = osmtogeojson(json);
  const f = fc.features.find((x) => x.id === `relation/${DUBAI_REL}`);
  const geom = simplifyGeometry(f.geometry, 0.00002);
  // Inverse mask: everything in the region except the emirate, used to fade the neighbours.
  const outer = [[50, 20], [62, 20], [62, 30], [50, 30], [50, 20]];
  const holes = polygons(geom).map((p) => p[0]);
  const mask = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [outer, ...holes] } };
  const emirate = { type: 'Feature', properties: { name: 'Dubai', name_ar: 'دبي', area_km2: Math.round(geomArea(geom) / 1e6) }, geometry: geom };
  await writeData('boundary.js', 'boundary', { emirate, mask, bbox: bbox(geom) });
  return geom;
}

const KIND_BY_LEVEL = { 7: 'sector', 8: 'master', 9: 'community', 10: 'community' };

async function buildCommunities() {
  const admin = await overpass('admin', `${AREA}(relation(area.d)[boundary=administrative][admin_level~"^(7|8|9|10)$"];relation(area.d)[boundary=administrative][!admin_level];);out body;>;out skel qt;`);
  const places = await overpass('place_areas', `${AREA}(way(area.d)[place~"^(suburb|neighbourhood|quarter|island|islet|archipelago)$"][name];relation(area.d)[place~"^(suburb|neighbourhood|quarter|island|islet|archipelago)$"][name];);out body;>;out skel qt;`);

  const toFeature = (f, kind) => {
    const t = f.properties.tags || f.properties;
    const name = nameEn(t);
    if (!name || !/Polygon/.test(f.geometry?.type)) return null;
    const geometry = simplifyGeometry(f.geometry, 0.000015);
    const area = geomArea(geometry);
    if (area < 2000) return null;
    return {
      type: 'Feature',
      properties: {
        id: f.id.replace(/^(\w)\w*\//, '$1'),
        name,
        name_ar: nameAr(t),
        kind,
        level: t.admin_level ? Number(t.admin_level) : null,
        place: t.place || null,
        area_km2: Math.round(area / 1e4) / 100,
        wiki: t.wikipedia || null,
        bbox: bbox(geometry),
      },
      geometry,
    };
  };

  const adminFeatures = osmtogeojson(admin).features
    .filter((f) => f.id.startsWith('relation/') && f.id !== 'relation/4479752' && (f.properties.tags || f.properties).boundary === 'administrative')
    .map((f) => toFeature(f, KIND_BY_LEVEL[(f.properties.tags || f.properties).admin_level] || 'community'))
    .filter(Boolean);

  // Named place areas, minus the ones that duplicate an admin community; same-name duplicates keep the largest.
  const adminIds = new Set(adminFeatures.map((f) => f.properties.id));
  const adminNames = new Set(adminFeatures.map((f) => f.properties.name.toLowerCase()));
  const byName = new Map();
  osmtogeojson(places).features
    .filter((f) => (f.properties.tags || f.properties).place)
    .map((f) => {
      const p = (f.properties.tags || f.properties).place;
      return toFeature(f, /island|islet|archipelago/.test(p) ? 'island' : p === 'suburb' ? 'district' : 'neighbourhood');
    })
    .filter((f) => f && !adminIds.has(f.properties.id) && !adminNames.has(f.properties.name.toLowerCase()))
    .forEach((f) => {
      const key = `${f.properties.kind}:${f.properties.name.toLowerCase()}`;
      if (!byName.has(key) || byName.get(key).properties.area_km2 < f.properties.area_km2) byName.set(key, f);
    });
  const districtFeatures = [...byName.values()];

  const labels = [...adminFeatures, ...districtFeatures].map((f) => ({
    type: 'Feature',
    properties: { id: f.properties.id, name: f.properties.name, name_ar: f.properties.name_ar, kind: f.properties.kind, area_km2: f.properties.area_km2 },
    geometry: { type: 'Point', coordinates: labelPoint(f.geometry) },
  }));

  console.log(`  communities: ${adminFeatures.length} admin, ${districtFeatures.length} districts`);
  await writeData('communities.js', 'communities', {
    admin: { type: 'FeatureCollection', features: adminFeatures },
    districts: { type: 'FeatureCollection', features: districtFeatures },
    labels: { type: 'FeatureCollection', features: labels },
  });
  return { adminFeatures, districtFeatures };
}

async function buildPlaces() {
  const json = await overpass('place_nodes', `${AREA}node(area.d)[place~"^(city|town|village|hamlet|suburb|neighbourhood|quarter|island|islet|locality)$"][name];out body;`);
  const places = json.elements.map((n) => ({
    name: nameEn(n.tags), name_ar: nameAr(n.tags), place: n.tags.place, ll: [r6(n.lon), r6(n.lat)],
  })).filter((p) => p.name);
  await writeData('places.js', 'places', places);
}

async function buildCycleways() {
  const json = await overpass('cycleways', `${AREA}(way(area.d)[highway=cycleway];way(area.d)[highway~"^(path|footway|track)$"][bicycle=designated];);out body;>;out skel qt;`);
  const { nodes, ways } = index(json);
  const features = [];
  let metres = 0;
  for (const w of ways.values()) {
    if (!w.tags) continue;
    const coords = wayCoords(w, nodes);
    if (coords.length < 2) continue;
    for (let i = 1; i < coords.length; i++) metres += dist(coords[i - 1], coords[i]);
    features.push({
      type: 'Feature',
      properties: {
        id: `w${w.id}`,
        name: nameEn(w.tags),
        kind: w.tags.highway === 'cycleway' ? 'cycleway' : 'shared',
        surface: w.tags.surface || null,
        lit: w.tags.lit || null,
        bridge: w.tags.bridge ? 1 : 0,
      },
      geometry: { type: 'LineString', coordinates: roundCoords(simplify(coords, 0.000004)) },
    });
  }
  console.log(`  cycle network: ${features.length} ways, ${(metres / 1000).toFixed(0)} km`);
  await writeData('cycleways.js', 'cycleways', { type: 'FeatureCollection', features, km: Math.round(metres / 1000) });
}

const TRANSIT_COLOURS = { 'red': '#E21B23', 'green': '#00A650', 'tram': '#E58A00', 'monorail': '#7B4FA0', 'blue': '#0072BC', 'route 2020': '#E21B23' };
// Blue Line stations are only tagged with Arabic names so far.
const STATION_NAMES_EN = {
  'مدينة العالمية 1': 'International City 1',
  'مدينة العالمية 2': 'International City 2',
  'واحة دبي السيليكون': 'Dubai Silicon Oasis',
  'مدينة الأكاديمية': 'Academic City',
  'سوق السيارات': 'Auto Market',
  'إعمار العقارية': 'Emaar Properties (Creek Harbour)',
  'دبي فيستيفال سيتي': 'Dubai Festival City',
};

// Vertical placement of a track way from OSM tags.
function trackLevel(t = {}) {
  const layer = parseInt(t.layer, 10) || 0;
  if ((t.tunnel && t.tunnel !== 'no') || layer < 0) return 'tunnel';
  if ((t.bridge && t.bridge !== 'no') || layer > 0) return 'elevated';
  return 'ground';
}
const DECK_HEIGHT = { subway: 11, monorail: 9, tram: 6, light_rail: 6, train: 7 }; // metres, top of viaduct deck

// Like chainWays, but also records the level of every segment so tunnels and viaducts survive the chaining.
function chainTrack(memberWays) {
  const chains = [];
  let cur = null;
  const append = (w, reversed) => {
    const ids = reversed ? w.nodes.slice().reverse() : w.nodes;
    const level = trackLevel(w.tags);
    for (let i = 1; i < ids.length; i++) { cur.ids.push(ids[i]); cur.levels.push(level); }
  };
  for (const w of memberWays) {
    const ids = w.nodes;
    if (cur) {
      const end = cur.ids[cur.ids.length - 1];
      if (ids[0] === end) { append(w, false); continue; }
      if (ids[ids.length - 1] === end) { append(w, true); continue; }
      if (ids[0] === cur.ids[0] || ids[ids.length - 1] === cur.ids[0]) {
        // the chain so far was oriented backwards
        cur.ids.reverse(); cur.levels.reverse();
        append(w, ids[0] !== cur.ids[cur.ids.length - 1]);
        continue;
      }
      chains.push(cur);
    }
    cur = { ids: [ids[0]], levels: [] };
    append(w, false);
  }
  if (cur) chains.push(cur);
  return chains;
}

// Sideways offset of a [lon, lat] polyline by m metres (positive = right of travel direction).
function offsetLine(coords, m) {
  const R = 6371008.8, rad = Math.PI / 180, n = coords.length;
  return coords.map((c, i) => {
    const k = Math.cos(c[1] * rad);
    const a = coords[Math.max(0, i - 1)], b = coords[Math.min(n - 1, i + 1)];
    let dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    return [c[0] + (dy * m) / (R * rad * k), c[1] + (-dx * m) / (R * rad)];
  });
}
const ribbon = (coords, half) => {
  const left = offsetLine(coords, -half), right = offsetLine(coords, half).reverse();
  return [[...left, ...right, left[0]]];
};
function square(c, half) {
  const R = 6371008.8, rad = Math.PI / 180, k = Math.cos(c[1] * rad);
  const dx = half / (R * rad * k), dy = half / (R * rad);
  return [[[c[0] - dx, c[1] - dy], [c[0] + dx, c[1] - dy], [c[0] + dx, c[1] + dy], [c[0] - dx, c[1] + dy], [c[0] - dx, c[1] - dy]]];
}

async function buildTransit() {
  const routes = await overpass('transit_routes_v2', `${AREA}relation(area.d)[route~"^(subway|light_rail|tram|monorail|train)$"];out body;>;out body qt;`);
  const stations = await overpass('transit_stations', `${AREA}node(area.d)[railway~"^(station|halt|tram_stop)$"];out body;`);
  const { nodes, ways, rels } = index(routes);
  const coordsOf = (ids) => ids.map((id) => nodes.get(id)).filter(Boolean).map((n) => [n.lon, n.lat]);

  const lines = [], paths = [];
  const wayRoute = new Map(); // way id -> first route using it (for per-way display segments)
  for (const rel of rels) {
    const t = rel.tags;
    const memberWays = rel.members
      .filter((m) => m.type === 'way' && !/platform|stop/.test(m.role))
      .map((m) => ways.get(m.ref))
      .filter((w) => w && !/platform/.test(w.tags?.railway || '') && w.tags?.public_transport !== 'platform');
    if (!memberWays.length) continue;
    const label = `${t.name || ''} ${t.ref || ''} ${t.colour || ''}`.toLowerCase();
    const key = Object.keys(TRANSIT_COLOURS).find((k) => label.includes(k)) || t.route;
    const colour = t.colour || TRANSIT_COLOURS[key] || '#555';
    const props = {
      id: `r${rel.id}`,
      name: nameEn(t) || t.ref,
      ref: t.ref || null,
      mode: t.route,
      colour,
      from: t.from || null,
      to: t.to || null,
      state: t.state || (t.disused ? 'disused' : null),
    };
    memberWays.forEach((w) => { if (!wayRoute.has(w.id)) wayRoute.set(w.id, props); });

    const chains = chainTrack(memberWays);
    lines.push({ type: 'Feature', properties: props, geometry: { type: 'MultiLineString', coordinates: roundCoords(chains.map((c) => simplify(coordsOf(c.ids), 0.000003))) } });

    // Train path along the longest chain: z on viaducts, and split at tunnels so trains vanish underground
    // while keeping continuous timing (each piece carries its distance from the start of the chain).
    const main = chains.reduce((a, b) => (b.ids.length > a.ids.length ? b : a));
    const pts = coordsOf(main.ids);
    if (pts.length !== main.ids.length) continue;
    const H = DECK_HEIGHT[t.route] || 8;
    const pieces = [];
    let piece = null, along = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const level = main.levels[i];
      const z = (j) => (main.levels[j - 1] === 'elevated' || main.levels[j] === 'elevated' ? H + 0.6 : 0);
      if (level === 'tunnel') { piece = null; }
      else {
        if (!piece) { piece = { start: Math.round(along), path: [[...pts[i], z(i)]] }; pieces.push(piece); }
        piece.path.push([...pts[i + 1], z(i + 1)]);
      }
      along += dist(pts[i], pts[i + 1]);
    }
    paths.push({
      id: props.id, colour, mode: t.route,
      pieces: pieces.filter((p) => p.path.length > 1).map((p) => ({ start: p.start, path: simplify(p.path, 0.000003).map(([x, y, h]) => [r6(x), r6(y), h]) })),
    });
  }

  // Per-way display segments with their level, plus 3D viaduct decks and pillars for elevated track.
  const segments = [], viaduct = [], pillars = [];
  const pillarGrid = new Set();
  for (const [wayId, props] of wayRoute) {
    const w = ways.get(wayId);
    const coords = coordsOf(w.nodes);
    if (coords.length < 2) continue;
    const level = trackLevel(w.tags);
    segments.push({
      type: 'Feature',
      properties: { route: props.id, name: props.name, mode: props.mode, colour: props.colour, level },
      geometry: { type: 'LineString', coordinates: roundCoords(simplify(coords, 0.000003)) },
    });
    if (level !== 'elevated') continue;
    const H = DECK_HEIGHT[props.mode] || 8;
    viaduct.push({ type: 'Feature', properties: { part: 'deck', base: H - 1.6, top: H, colour: props.colour }, geometry: { type: 'Polygon', coordinates: roundCoords(ribbon(coords, props.mode === 'subway' ? 3.4 : 2.4)) } });
    viaduct.push({ type: 'Feature', properties: { part: 'rail', base: H, top: H + 0.35, colour: props.colour }, geometry: { type: 'Polygon', coordinates: roundCoords(ribbon(coords, 0.9)) } });
    // one pillar every ~40 m, skipping spots that already have one (parallel tracks share pillars)
    let next = 20, run = 0;
    for (let i = 1; i < coords.length; i++) {
      const seg = dist(coords[i - 1], coords[i]);
      while (run + seg >= next) {
        const f = (next - run) / seg;
        const c = [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f];
        const cell = `${Math.round(c[0] / 0.00012)}:${Math.round(c[1] / 0.00012)}`;
        if (!pillarGrid.has(cell)) {
          pillarGrid.add(cell);
          pillars.push({ type: 'Feature', properties: { part: 'pillar', base: 0, top: H - 1.6, colour: props.colour }, geometry: { type: 'Polygon', coordinates: roundCoords(square(c, 1.2)) } });
        }
        next += 40;
      }
      run += seg;
    }
  }

  const stationFeatures = stations.elements
    .filter((n) => n.tags && (n.tags.station !== 'train' || n.tags.railway === 'station'))
    .map((n) => {
      const p = [n.lon, n.lat];
      const near = lines
        .map((l) => ({ l, d: Math.min(...l.geometry.coordinates.map((c) => pointToLineMetres(p, c))) }))
        .filter((x) => x.d < 160)
        .sort((a, b) => a.d - b.d);
      // The nearest mapped line decides the mode (Dubai Trolley stops, for example, are tagged like metro stations).
      const KIND_BY_MODE = { subway: 'metro', tram: 'tram', light_rail: 'tram', monorail: 'monorail', train: 'rail' };
      const kind = KIND_BY_MODE[near[0]?.l.properties.mode]
        || (n.tags.railway === 'tram_stop' || n.tags.station === 'light_rail' ? 'tram' : n.tags.station === 'monorail' ? 'monorail' : 'metro');
      let lineNames = [...new Set(near.map((x) => x.l.properties.name.replace(/:.*$/, '').trim()))];
      // Metro stations with no mapped route yet belong to the Blue Line (under construction, due 2029).
      const blue = kind === 'metro' && !lineNames.length;
      if (blue) lineNames = ['Blue Line (under construction)'];
      return {
        type: 'Feature',
        properties: {
          id: `n${n.id}`,
          name: STATION_NAMES_EN[n.tags.name] || nameEn(n.tags),
          name_ar: nameAr(n.tags),
          kind,
          lines: lineNames,
          colour: blue ? TRANSIT_COLOURS.blue : near[0]?.l.properties.colour || '#555',
          interchange: new Set(near.map((x) => x.l.properties.colour)).size > 1 ? 1 : 0,
        },
        geometry: { type: 'Point', coordinates: [r6(n.lon), r6(n.lat)] },
      };
    })
    .filter((f) => f.properties.name);

  const levels = segments.reduce((a, s) => ({ ...a, [s.properties.level]: (a[s.properties.level] || 0) + 1 }), {});
  console.log(`  transit: ${lines.length} routes, ${stationFeatures.length} stations, segments ${JSON.stringify(levels)}, ${pillars.length} pillars`);
  await writeData('transit.js', 'transit', {
    lines: { type: 'FeatureCollection', features: lines },
    segments: { type: 'FeatureCollection', features: segments },
    viaduct: { type: 'FeatureCollection', features: [...pillars, ...viaduct] },
    stations: { type: 'FeatureCollection', features: stationFeatures },
    paths,
  });
}

async function buildRoadGraph() {
  const json = await overpass('major_roads', `${AREA}way(area.d)[highway~"^(motorway|trunk|primary|motorway_link|trunk_link)$"];out body;>;out skel qt;`);
  const { nodes, ways } = index(json);
  // Compact directed graph for the client-side traffic simulation.
  const nodeIndex = new Map();
  const nid = (id) => { if (!nodeIndex.has(id)) nodeIndex.set(id, nodeIndex.size); return nodeIndex.get(id); };
  const edges = [];
  for (const w of ways.values()) {
    const t = w.tags || {};
    let ids = w.nodes.filter((id) => nodes.has(id));
    if (ids.length < 2) continue;
    const oneway = t.oneway === 'yes' || t.oneway === '1' || t.oneway === '-1' || /motorway/.test(t.highway) || t.junction === 'roundabout';
    if (t.oneway === '-1') ids = ids.slice().reverse();
    const coords = simplify(ids.map((id) => [nodes.get(id).lon, nodes.get(id).lat]), 0.000008).map(([x, y]) => [r5(x), r5(y)]);
    const cls = t.highway.replace('_link', '');
    edges.push([nid(ids[0]), nid(ids[ids.length - 1]), oneway ? 1 : 0, cls === 'motorway' ? 0 : cls === 'trunk' ? 1 : 2, t.highway.endsWith('_link') ? 1 : 0, coords]);
  }
  console.log(`  road graph: ${edges.length} edges, ${nodeIndex.size} junction nodes`);
  await writeData('roads.js', 'roads', { edges });
}

async function buildTelecom() {
  const json = await overpass('telecom', `${AREA}(nwr(area.d)["tower:type"="communication"];nwr(area.d)[man_made=mast];nwr(area.d)[man_made=communications_tower];);out center tags;`);
  const features = json.elements.map((e) => {
    const t = e.tags || {};
    const c = e.center || { lat: e.lat, lon: e.lon };
    return {
      type: 'Feature',
      properties: {
        id: `${e.type[0]}${e.id}`,
        name: nameEn(t),
        operator: t.operator || null,
        kind: t.man_made === 'communications_tower' ? 'tower' : t['tower:type'] === 'communication' ? (t.man_made === 'tower' ? 'tower' : 'mast') : 'mast',
        height: parseFloat(t.height) || null,
      },
      geometry: { type: 'Point', coordinates: [r6(c.lon), r6(c.lat)] },
    };
  });
  console.log(`  telecom: ${features.length} masts/towers`);
  await writeData('telecom.js', 'telecom', { type: 'FeatureCollection', features });
}

// Landmarks: positions are taken from the referenced OSM element; `ll` is only a fallback.
const LANDMARKS = [
  ['w446646206', 'Burj Khalifa', 'Icon', 'World\'s tallest building, 828 m, 163 floors (2010).', 828],
  ['w12700546', 'Burj Al Arab', 'Icon', 'Sail-shaped hotel on its own island, 321 m.', 321],
  ['w386649647', 'Dubai Frame', 'Icon', '150 m picture-frame landmark in Zabeel Park linking old and new Dubai.', 150],
  ['w33875310', 'Museum of the Future', 'Icon', 'Torus-shaped museum on Sheikh Zayed Road, opened 2022.', 77],
  ['w1047288986', 'Ain Dubai', 'Icon', 'One of the world\'s largest observation wheels, Bluewaters Island.', 250],
  ['r2693943', 'The World Islands', 'Icon', 'Artificial archipelago of ~300 islands shaped like a world map.'],
  ['r1297972', 'Palm Jumeirah', 'Icon', 'Palm-shaped artificial island with trunk, 16 fronds and crescent.'],
  ['w94414196', 'Atlantis The Palm', 'Hotel', 'Resort at the apex of Palm Jumeirah\'s crescent.', null, [55.11721, 25.13053]],
  ['w959856802', 'Atlantis The Royal', 'Hotel', 'Stacked-block resort on the crescent, 2023.', 193],
  ['w10316322', 'Jumeirah Beach Hotel', 'Hotel', 'Wave-shaped beachfront hotel, 104 m.', 104],
  [null, 'Madinat Jumeirah', 'Hotel', 'Arabian resort with waterways and Souk Madinat.', null, [55.18436, 25.13256]],
  ['w195527261', 'Marina 101', 'Tower', 'Supertall residential tower in Dubai Marina, 425 m.', 425],
  ['w186351092', 'Princess Tower', 'Tower', 'Residential tower in Dubai Marina, 413 m.', 413],
  ['w574137550', 'Ciel Tower', 'Tower', 'World\'s tallest hotel (2024), 377 m.', 377],
  ['w195527255', 'Cayan Tower', 'Tower', 'Twisting 90-degree tower in Dubai Marina, 306 m.', 306],
  ['r9745436', 'Emirates Towers', 'Tower', 'Twin towers on Sheikh Zayed Road, 355 m and 309 m.', 355],
  ['w393361022', 'ICD Brookfield Place', 'Tower', 'DIFC office tower, 279 m.', 279],
  ['r18195959', 'The Dubai Mall', 'Mall', 'One of the world\'s largest malls, at the foot of Burj Khalifa.'],
  ['r9751289', 'Mall of the Emirates', 'Mall', 'Mall with indoor ski slope Ski Dubai.'],
  ['w102832548', 'Ibn Battuta Mall', 'Mall', 'Themed mall of six courts based on the travels of Ibn Battuta.'],
  ['w797700047', 'Dubai Hills Mall', 'Mall', 'Mall at the heart of Dubai Hills Estate.'],
  ['w200915107', 'Dubai Marina Mall', 'Mall', 'Waterfront mall in Dubai Marina.'],
  ['w475848632', 'Dubai Opera', 'Culture', 'Dhow-shaped performing arts centre in Downtown Dubai.'],
  ['r7214772', 'Al Fahidi Fort', 'Culture', 'Oldest existing building in Dubai (1787), formerly the Dubai Museum.'],
  ['w542042595', 'Al Fahidi Historical Neighbourhood', 'Culture', 'Restored wind-tower quarter (Al Bastakiya) on Dubai Creek.'],
  ['n11927748577', 'Al Shindagha Museum', 'Culture', 'Heritage museum of Dubai Creek\'s historic Shindagha district.'],
  ['n13383845401', 'Al Seef', 'Culture', 'Creekside heritage-style promenade in Bur Dubai.'],
  ['n6124908671', 'Dubai Creek Harbour', 'Icon', 'Waterfront master development next to Ras Al Khor sanctuary.'],
  ['r16842105', 'Deira Gold Souk', 'Culture', 'Traditional gold market in Deira.'],
  ['w217936504', 'Jumeirah Mosque', 'Culture', 'Fatimid-style mosque open to visitors.'],
  ['n5332056385', 'Etihad Museum', 'Culture', 'Museum on the site where the UAE was founded in 1971.', null, [55.269331, 25.241433]],
  ['w585358310', 'Queen Elizabeth 2', 'Culture', 'Historic ocean liner, now a floating hotel at Mina Rashid.'],
  ['w986435236', 'Al Wasl Dome', 'Culture', 'Expo City Dubai\'s 67.5 m projection dome.', 67.5],
  ['w1429712446', 'Dubai International Airport (DXB)', 'Transport', 'World\'s busiest airport for international passengers.'],
  ['w214188740', 'Al Maktoum International Airport (DWC)', 'Transport', 'Dubai World Central, the future main airport.'],
  ['r9232081', 'Jebel Ali Port', 'Transport', 'Largest man-made harbour and busiest port in the Middle East.'],
  ['w1205055396', 'Global Village', 'Leisure', 'Seasonal multicultural festival park.'],
  ['w309488164', 'Dubai Miracle Garden', 'Leisure', 'Flower garden with over 150 million flowers.'],
  ['w360213180', 'IMG Worlds of Adventure', 'Leisure', 'One of the largest indoor theme parks.'],
  ['w508523722', 'Legoland Dubai', 'Leisure', 'Theme park within Dubai Parks and Resorts.'],
  ['w612395873', 'Coca-Cola Arena', 'Leisure', 'Indoor multi-purpose arena in City Walk.'],
  ['r2265521', 'Meydan Racecourse', 'Leisure', 'Home of the Dubai World Cup.'],
  ['w89658654', 'Kite Beach', 'Leisure', 'Public beach with views of Burj Al Arab.'],
  ['w242815345', 'Zabeel Park', 'Nature', 'Large urban park in Zabeel.'],
  ['w21081900', 'Creek Park', 'Nature', 'Park along Dubai Creek.'],
  ['w393004319', 'Ras Al Khor Wildlife Sanctuary', 'Nature', 'Wetland reserve famous for flamingos.'],
  ['w664607663', 'Hatta Heritage Village', 'Culture', 'Restored mountain village in the Hatta enclave.'],
  ['r8122161', 'Dubai Islands', 'Icon', 'Five islands off Deira, formerly Deira Islands.'],
];

async function buildLandmarks() {
  const byType = { n: [], w: [], r: [] };
  LANDMARKS.forEach(([id]) => id && byType[id[0]].push(id.slice(1)));
  const q = `(${byType.n.length ? `node(id:${byType.n});` : ''}${byType.w.length ? `way(id:${byType.w});` : ''}${byType.r.length ? `relation(id:${byType.r});` : ''});out center tags;`;
  const json = await overpass('landmarks', q);
  const pos = new Map(json.elements.map((e) => [`${e.type[0]}${e.id}`, e.center ? [e.center.lon, e.center.lat] : [e.lon, e.lat]]));
  const features = LANDMARKS.map(([id, name, cat, desc, height, ll]) => {
    const c = pos.get(id) || ll;
    if (!c) { console.warn(`  landmark missing: ${name}`); return null; }
    return { type: 'Feature', properties: { id, name, cat, desc, height: height || null }, geometry: { type: 'Point', coordinates: [r6(c[0]), r6(c[1])] } };
  }).filter(Boolean);
  await writeData('landmarks.js', 'landmarks', { type: 'FeatureCollection', features });
}

// ---------------------------------------------------------------- detailed landmark models
// Geometry the procedural 3D models are fitted to, in local metres around each origin
// (x = east, z = south, matching the three.js scene: y is up).

const MODEL_SITES = {
  'burj-khalifa': { ll: [55.27414, 25.19720], radius: 140 },
  'burj-al-arab': { ll: [55.185286, 25.141287], radius: 120 },
  'museum-of-the-future': { ll: [55.28206, 25.21896], radius: 120 },
};
const metresHigh = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0;
const tileId = (wayId) => wayId * 10 + 2; // OpenMapTiles feature id for an OSM way

// Local metres exactly as MapLibre places them: Web Mercator offsets divided by meterInMercatorCoordinateUnits
// at the origin (spherical earth, R = 6371008.8 m), so models line up with the basemap to the centimetre.
const EARTH_CIRC = 2 * Math.PI * 6371008.8;
const mercX = (lon) => (180 + lon) / 360;
const mercY = (lat) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
const metresPerMerc = (lat0) => EARTH_CIRC * Math.cos((lat0 * Math.PI) / 180);
const r2 = (n) => Math.round(n * 20) / 20; // 5 cm
const lonLatToLocal = (lon, lat, [lon0, lat0]) => {
  const k = metresPerMerc(lat0);
  return [r2((mercX(lon) - mercX(lon0)) * k), r2((mercY(lat) - mercY(lat0)) * k)];
};
function toLocal(geometry, origin) {
  const ring = geometry.map((p) => lonLatToLocal(p.lon, p.lat, origin));
  if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  return ring;
}
const centroidOf = (ring) => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
const lonLatAt = ([lon0, lat0], [x, z]) => {
  const k = metresPerMerc(lat0), my = mercY(lat0) + z / k;
  const lat = (360 / Math.PI) * Math.atan(Math.exp(((180 - my * 360) * Math.PI) / 180)) - 90;
  return [r6(lon0 + (x / k) * 360), r6(lat)];
};

async function buildLandmarkModels() {
  const around = Object.values(MODEL_SITES)
    .map(({ ll: [lon, lat], radius }) => `way(around:${radius},${lat},${lon})["building:part"];way(around:${radius},${lat},${lon})["building"];`).join('');
  const json = await overpass('landmark_model_parts', `(${around});out geom tags;`);
  const ways = new Map(json.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
  const out = {};

  // Burj Khalifa: every tower part (OSM models the spiral setbacks as stacked parts); the 15 m podium stays a tile building.
  {
    const site = MODEL_SITES['burj-khalifa'];
    const parts = [...ways.values()].filter((w) => w.tags['building:part'] && metresHigh(w.tags.height) >= 30
      && Math.hypot(...centroidOf(toLocal(w.geometry, site.ll))) < 80);
    const top = parts.filter((w) => metresHigh(w.tags.height) >= 700).map((w) => centroidOf(w.geometry.map((g) => [g.lon, g.lat])));
    const origin = [r6(top.reduce((a, c) => a + c[0], 0) / top.length), r6(top.reduce((a, c) => a + c[1], 0) / top.length)];
    out['burj-khalifa'] = {
      origin,
      parts: parts.map((w) => ({ id: w.id, h: metresHigh(w.tags.height), min: metresHigh(w.tags.min_height), ring: toLocal(w.geometry, origin) }))
        .sort((a, b) => a.h - b.h),
      hide: [...parts.map((w) => tileId(w.id)), tileId(446646206)],
    };
  }

  // Burj Al Arab: the footprint is a 45° sector; its sharpest corner is the spine, the arc is the sail.
  {
    const w = ways.get(12700546);
    const ring = toLocal(w.geometry, MODEL_SITES['burj-al-arab'].ll);
    const angleAt = (i) => {
      const p = ring[i], a = ring[(i - 1 + ring.length) % ring.length], b = ring[(i + 1) % ring.length];
      const u = [a[0] - p[0], a[1] - p[1]], v = [b[0] - p[0], b[1] - p[1]];
      return Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)));
    };
    let apexIndex = 0;
    ring.forEach((_, i) => { if (angleAt(i) < angleAt(apexIndex)) apexIndex = i; });
    const apex = ring[apexIndex];
    const dir = (p) => { const d = [p[0] - apex[0], p[1] - apex[1]], l = Math.hypot(...d); return [d[0] / l, d[1] / l]; };
    const d1 = dir(ring[(apexIndex + 1) % ring.length]), d2 = dir(ring[(apexIndex - 1 + ring.length) % ring.length]);
    const radius = Math.max(...ring.map((p) => Math.hypot(p[0] - apex[0], p[1] - apex[1])));
    // Re-centre on the spine so the model's origin is the mast.
    const origin = lonLatAt(MODEL_SITES['burj-al-arab'].ll, apex);
    out['burj-al-arab'] = {
      origin,
      footprint: ring.map(([x, z]) => [Math.round((x - apex[0]) * 100) / 100, Math.round((z - apex[1]) * 100) / 100]),
      wings: [d1.map((v) => Math.round(v * 1e5) / 1e5), d2.map((v) => Math.round(v * 1e5) / 1e5)],
      radius: Math.round(radius * 10) / 10,
      hide: [tileId(12700546), tileId(1173799867)],
    };
  }

  // Museum of the Future: principal axis of the footprint; the fatter end of the torus is +x in the model.
  {
    const w = ways.get(1054289435);
    const ring = toLocal(w.geometry, MODEL_SITES['museum-of-the-future'].ll);
    const [cx, cz] = centroidOf(ring);
    let sxx = 0, szz = 0, sxz = 0;
    ring.forEach(([x, z]) => { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); });
    const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const pca = [Math.cos(theta), Math.sin(theta)];
    const along = (p) => (p[0] - cx) * pca[0] + (p[1] - cz) * pca[1];
    const across = (p) => -(p[0] - cx) * pca[1] + (p[1] - cz) * pca[0];
    const ext = ring.map(along), min = Math.min(...ext), max = Math.max(...ext);
    const widthNear = (lo, hi) => { const s = ring.filter((p) => along(p) >= lo && along(p) <= hi).map(across); return s.length ? Math.max(...s) - Math.min(...s) : 0; };
    const mid = (min + max) / 2;
    const centre = [cx + pca[0] * mid, cz + pca[1] * mid];
    const flip = widthNear(min, min + (max - min) * 0.25) > widthNear(max - (max - min) * 0.25, max);
    const axis = flip ? [-pca[0], -pca[1]] : pca;
    const origin = lonLatAt(MODEL_SITES['museum-of-the-future'].ll, centre);
    out['museum-of-the-future'] = {
      origin,
      footprint: ring.map(([x, z]) => [Math.round((x - centre[0]) * 100) / 100, Math.round((z - centre[1]) * 100) / 100]),
      axis: axis.map((v) => Math.round(v * 1e5) / 1e5),
      length: Math.round((max - min) * 10) / 10,
      hide: [tileId(1054289435)],
    };
  }

  console.log(`  landmark models: Burj Khalifa ${out['burj-khalifa'].parts.length} parts, Burj Al Arab sector r=${out['burj-al-arab'].radius} m, Museum of the Future ${out['museum-of-the-future'].length} m long`);
  await writeData('landmark-models.js', 'landmarkModels', out);
}

// ---------------------------------------------------------------- Downtown Dubai district
// Every building and building:part inside the Downtown Dubai community boundary, plus the landscape the 3D
// district needs (lake, pools, fountains, boardwalk, bridges, trees, gardens, streets). Coordinates are local
// metres around the Burj Khalifa model origin: x east, z south.

const DOWNTOWN_REL = 18471738;
const DOWNTOWN_ORIGIN = [55.274146, 25.197214];
const AREA_DT = `rel(${DOWNTOWN_REL});map_to_area->.dt;`;
const LEVEL_H = 3.5;

const parseLevels = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const tileIdFor = (osmId) => (osmId.startsWith('r') ? Number(osmId.slice(1)) * 10 + 3 : Number(osmId.slice(1)) * 10 + 2);

function ringAreaLocal(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
function pointInRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const localPolys = (geometry, origin) => polygons(geometry).map((poly) => poly.map((ring) => {
  const r = ring.map(([lon, lat]) => lonLatToLocal(lon, lat, origin));
  if (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1]) r.pop();
  return r;
}).filter((r) => r.length >= 3)).filter((p) => p.length);
const localLine = (coords, origin) => coords.map(([lon, lat]) => lonLatToLocal(lon, lat, origin));

// The modelled district: Downtown Dubai and the surroundings visible from it (Business Bay, DIFC and Sheikh
// Zayed Road, City Walk, Za'abeel). w, s, e, n in degrees.
const DISTRICT_EXTENT = [55.255, 25.180, 55.295, 25.216];

async function buildDowntown() {
  const admin0 = await overpass('admin', '');
  const bf = osmtogeojson(admin0).features.find((f) => f.id === `relation/${DOWNTOWN_REL}`);
  const [w0, s0, e0, n0] = DISTRICT_EXTENT, pad = 0.002;
  const BB = `${s0},${w0},${n0},${e0}`, BBP = `${s0 - pad},${w0 - pad},${n0 + pad},${e0 + pad}`;
  // buildings in four quadrant queries (lighter on busy Overpass servers), merged
  const quads = [];
  const midLon = (w0 + e0) / 2, midLat = (s0 + n0) / 2;
  for (const [a, b, c, d] of [[s0 - pad, w0 - pad, midLat, midLon], [s0 - pad, midLon, midLat, e0 + pad], [midLat, w0 - pad, n0 + pad, midLon], [midLat, midLon, n0 + pad, e0 + pad]]) {
    const q = `${a},${b},${c},${d}`;
    quads.push(await overpass(`district_buildings_${quads.length}`, `(way["building"](${q});way["building:part"](${q});relation["building"](${q});relation["building:part"](${q}););out body;>;out skel qt;`));
  }
  const seenEl = new Set();
  const bjson = { elements: quads.flatMap((j) => j.elements).filter((e) => { const k = e.type + e.id; if (seenEl.has(k)) return false; seenEl.add(k); return true; }) };
  const ejson = await overpass('district_env', `(nwr["natural"~"water|tree|tree_row"](${BB});nwr["water"](${BB});nwr["amenity"="fountain"](${BB});nwr["leisure"~"park|garden|playground|pitch"](${BB});nwr["landuse"~"grass|flowerbed"](${BB});way["highway"~"pedestrian|footway"]["area"="yes"](${BB});way["man_made"~"bridge|pier"](${BB});way["highway"~"footway|pedestrian"]["bridge"](${BB}););out body;>;out skel qt;`);
  const rjson = await overpass('district_roads', `way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|pedestrian|footway|cycleway|path)$"](${BBP});out body;>;out body qt;`);
  const origin = DOWNTOWN_ORIGIN;
  const boundary = localPolys(bf.geometry, origin)[0][0];
  const extentLocal = [lonLatToLocal(w0, n0, origin), lonLatToLocal(e0, n0, origin), lonLatToLocal(e0, s0, origin), lonLatToLocal(w0, s0, origin)];
  const inExtent = ([x, z], m = 0) => x >= extentLocal[0][0] - m && x <= extentLocal[1][0] + m && z >= extentLocal[0][1] - m && z <= extentLocal[2][1] + m;

  // ---- buildings
  const shortId = (fid) => fid.replace(/^(\w)\w*\//, '$1');
  const features = osmtogeojson(bjson).features.filter((f) => {
    if (!/Polygon/.test(f.geometry?.type)) return false;
    const ring = localPolys(f.geometry, origin)[0]?.[0];
    return ring ? inExtent(centroidOf(ring)) : false;
  });
  const records = [];
  for (const f of features) {
    const t = f.properties.tags || f.properties;
    if (!t.building && !t['building:part']) continue;
    const polys = localPolys(f.geometry, origin);
    if (!polys.length) continue;
    polys.forEach((p) => { if (ringAreaLocal(p[0]) < 0) p[0].reverse(); for (let i = 1; i < p.length; i++) if (ringAreaLocal(p[i]) > 0) p[i].reverse(); });
    const area = polys.reduce((a, p) => a + Math.abs(ringAreaLocal(p[0])) - p.slice(1).reduce((s, h) => s + Math.abs(ringAreaLocal(h)), 0), 0);
    const kind = t['building:part'] && !t.building ? 'part' : t.building;
    const levels = parseLevels(t['building:levels']);
    const minLevel = parseLevels(t['building:min_level']);
    let h = metresHigh(t.height), min = metresHigh(t.min_height);
    if (!h && levels) h = levels * LEVEL_H + (parseLevels(t['roof:levels']) || 0) * LEVEL_H;
    const estimated = !h;
    if (!h) h = area < 120 ? 3.5 : area < 1500 ? 10.5 : 14;
    if (!min && minLevel) min = minLevel * LEVEL_H;
    if (min >= h) min = 0;
    records.push({
      id: shortId(f.id),
      name: nameEn(t),
      kind,
      use: t.amenity || t.tourism || t.shop || t.office || null,
      h: Math.round(h * 10) / 10,
      min: Math.round(min * 10) / 10,
      levels: levels || Math.max(1, Math.round((h - min) / LEVEL_H)),
      estimated,
      roof: t['roof:shape'] || null,
      material: t['building:material'] || null,
      colour: t['building:colour'] || null,
      area: Math.round(area),
      polys,
    });
  }
  // Outlines that are drawn as building:parts are containers: the parts render, the outline gives the name.
  const parts = records.filter((r) => r.kind === 'part');
  for (const r of records) {
    if (r.kind === 'part') continue;
    const inside = parts.filter((p) => pointInRing(centroidOf(p.polys[0][0]), r.polys[0][0]) && p.area < r.area * 1.05);
    const covered = inside.reduce((a, p) => a + p.area, 0);
    if (inside.length && covered >= r.area * 0.35) {
      r.container = true;
      inside.forEach((p) => { p.parent = r.id; if (!p.name) p.name = r.name; });
    }
  }
  const buildings = records.map((r) => ({ ...r, tile: tileIdFor(r.id) }));

  // ---- landscape
  const efeatures = osmtogeojson(ejson).features;
  const env = { water: [], fountains: [], fountainPoints: [], gardens: [], plazas: [], piers: [], bridges: [], footbridges: [], trees: [], treeRows: [] };
  for (const f of efeatures) {
    const t = f.properties.tags || f.properties, g = f.geometry;
    if (!g) continue;
    const id = shortId(f.id), name = nameEn(t);
    if (g.type === 'Point') {
      const p = lonLatToLocal(g.coordinates[0], g.coordinates[1], origin);
      if (t.natural === 'tree') env.trees.push([p[0], p[1], t.leaf_type === 'broadleaved' ? 1 : 0]);
      else if (t.amenity === 'fountain') env.fountainPoints.push({ id, name, p });
      continue;
    }
    if (/LineString/.test(g.type)) {
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      for (const line of lines) {
        const pts = localLine(line, origin);
        if (t.natural === 'tree_row') env.treeRows.push(pts);
        else if (t.bridge || t.man_made === 'bridge') env.footbridges.push({ id, name, layer: Number(t.layer) || 1, pts });
        else if (t.man_made === 'pier') env.piers.push({ id, name, line: pts });
      }
      continue;
    }
    const polys = localPolys(g, origin);
    if (!polys.length) continue;
    const item = { id, name, polys };
    if (t.amenity === 'fountain') env.fountains.push(item);
    else if (t.natural === 'water' || t.water) { if (polys.every((p) => p[0].every((q) => inExtent(q, 400)))) env.water.push({ ...item, kind: t.water || 'water' }); }
    else if (t.man_made === 'pier') env.piers.push(item);
    else if (t.man_made === 'bridge') env.bridges.push({ ...item, layer: Number(t.layer) || 1 });
    else if (t.highway) env.plazas.push(item);
    else env.gardens.push({ ...item, kind: t.leisure || t.landuse });
  }

  // ---- streets: centrelines with width, lanes, direction, level and per-vertex junction / crossing / signal flags
  const WIDTH = { motorway: 11, trunk: 10.5, primary: 10.5, secondary: 7.5, tertiary: 7, unclassified: 6.5, residential: 6.5, living_street: 5.5, service: 4.5, pedestrian: 5, footway: 2.5, cycleway: 2.5, path: 2 };
  const LANE_W = { motorway: 3.65, trunk: 3.6, primary: 3.5, secondary: 3.4, tertiary: 3.3 };
  const ri = index(rjson);
  const incidence = new Map();
  const VEHICLE = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)(_link)?$/;
  for (const w of ri.ways.values()) {
    if (!VEHICLE.test(w.tags?.highway || '')) continue;
    w.nodes.forEach((id, i) => incidence.set(id, (incidence.get(id) || 0) + (i === 0 || i === w.nodes.length - 1 ? 1 : 2)));
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  const streets = [];
  for (const w of ri.ways.values()) {
    const t = w.tags || {};
    if (t.area === 'yes' || !t.highway) continue;
    const nodes = w.nodes.map((id) => ri.nodes.get(id)).filter(Boolean);
    if (nodes.length < 2) continue;
    const pts = nodes.map((n) => lonLatToLocal(n.lon, n.lat, origin));
    if (!pts.some((p) => inExtent(p, 60))) continue;
    const cls = t.highway.replace('_link', ''), link = t.highway.endsWith('_link');
    const oneway = t.oneway === 'yes' || t.oneway === '1' || t.oneway === '-1' || t.junction === 'roundabout' || /motorway/.test(t.highway) ? 1 : 0;
    if (t.oneway === '-1') { pts.reverse(); nodes.reverse(); }
    let lanes = parseLevels(t.lanes);
    if (!lanes && VEHICLE.test(t.highway)) lanes = link ? 1 : { motorway: oneway ? 4 : 6, trunk: oneway ? 3 : 6, primary: oneway ? 3 : 4, secondary: oneway ? 2 : 2, tertiary: oneway ? 2 : 2 }[cls] || (oneway ? 1 : 2);
    const laneW = LANE_W[cls] || 3.2;
    const width = metresHigh(t.width) || (lanes ? lanes * laneW + (oneway && lanes > 1 ? 1.2 : 0.6) : WIDTH[cls] || 4);
    const flags = (pred) => nodes.map((n, i) => (pred(n) ? i : -1)).filter((i) => i >= 0);
    streets.push({
      id: `w${w.id}`, name: nameEn(t), cls, link: link ? 1 : 0,
      width: Math.round(width * 10) / 10, lanes: lanes || 0, laneW, oneway,
      bridge: t.bridge && t.bridge !== 'no' ? 1 : 0, tunnel: t.tunnel && t.tunnel !== 'no' ? 1 : 0, layer: Number(t.layer) || 0,
      sidewalk: t.sidewalk || null, surface: t.surface || null,
      pts: pts.map(([x, z]) => [r1(x), r1(z)]),
      j: VEHICLE.test(t.highway) ? flags((n) => (incidence.get(n.id) || 0) >= 3) : [],
      x: flags((n) => n.tags?.highway === 'crossing' || n.tags?.crossing),
      sg: flags((n) => n.tags?.highway === 'traffic_signals'),
      ends: [nodes[0].id, nodes[nodes.length - 1].id],
    });
  }

  const visible = buildings.filter((b) => !b.container);
  console.log(`  downtown: ${buildings.length} buildings (${visible.length} rendered, ${buildings.length - visible.length} containers), ${env.trees.length} trees, ${env.water.length} water bodies, ${streets.length} street segments`);
  await writeData('downtown.js', 'downtown', { origin, boundary, extent: extentLocal, extentLL: DISTRICT_EXTENT, buildings, env, streets });
}

// ---------------------------------------------------------------- main

await fs.mkdir(OUT, { recursive: true });
console.log('Fetching OpenStreetMap data for the Emirate of Dubai...');
await buildBoundary();
await buildCommunities();
await buildPlaces();
await buildCycleways();
await buildTransit();
await buildRoadGraph();
await buildTelecom();
await buildLandmarks();
await buildLandmarkModels();
await buildDowntown();
await writeData('meta.js', 'meta', { osm: osmTimestamp, built: new Date().toISOString() });
console.log('Done.');
