/* Dubai Digital Twin: map setup, interaction, search, info cards, tour. */
(function () {
  'use strict';

  const D = window.DUBAI;
  const DT = window.DT;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('dt:' + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('dt:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  // Camera from the aro.ae Downtown reference (maphash 15.3/44.5/-56.1/25.174387/55.311662/5238): its camera sits
  // 5.2 km up south-east of Downtown looking north-west, i.e. this target, zoom, pitch and bearing.
  const HOME = { center: [55.2772, 25.1952], zoom: 15.3, pitch: 44.5, bearing: -56.1 };

  const DEFAULT_LAYERS = {
    buildings: true, models: true, roads: true, roadLabels: true, pois: true, hillshade: true, terrain: false,
    communities: true, districts: true, boundary: true, mask: true,
    cycle: true, transit: true, traffic: true, trains: true,
    landmarks: true, telecom: false,
  };
  const state = {
    theme: store.get('theme.v2') || 'satellite',
    layers: Object.assign({}, DEFAULT_LAYERS, store.get('layers') || {}),
    speed: store.get('speed') || 6,
    density: store.get('density') || 'normal',
  };

  const KIND = { community: 'Community', master: 'Master community', sector: 'Rural sector', district: 'District', neighbourhood: 'Neighbourhood', island: 'Island' };
  const CAT = { Icon: '#D9922E', Tower: '#3E6FB0', Hotel: '#8E5BB5', Mall: '#D14D72', Culture: '#A0522D', Transport: '#2F7E8C', Leisure: '#E06A3A', Nature: '#3F9A54' };
  const CAT_GLYPH = { Icon: '★', Tower: '▲', Hotel: 'H', Mall: 'M', Culture: 'C', Transport: '✈', Leisure: '●', Nature: 'N' };

  // Numeric ids for feature-state hover and for mapping rendered features back to full geometries.
  D.communities.admin.features.forEach((f, i) => { f.id = i + 1; });
  D.communities.districts.features.forEach((f, i) => { f.id = i + 1; });
  const adminById = new Map(D.communities.admin.features.map((f) => [f.id, f]));
  const districtById = new Map(D.communities.districts.features.map((f) => [f.id, f]));

  // ------------------------------------------------------------------ geometry helpers

  function inRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inFeature(p, f) {
    const b = f.properties.bbox;
    if (b && (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3])) return false;
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polys.some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h)));
  }
  function metres(a, b) {
    const rad = Math.PI / 180, k = Math.cos(((a[1] + b[1]) / 2) * rad);
    const dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy) * rad * 6371008.8;
  }
  // Smallest admin community and district containing a point.
  function whereIs(p) {
    const smallest = (list) => list.filter((f) => inFeature(p, f)).sort((a, b) => a.properties.area_km2 - b.properties.area_km2)[0] || null;
    return {
      community: smallest(D.communities.admin.features),
      district: smallest(D.communities.districts.features.filter((f) => f.properties.kind !== 'island')) || smallest(D.communities.districts.features),
    };
  }
  const fmtLL = (c) => `${c[1].toFixed(6)}° N, ${c[0].toFixed(6)}° E`;
  const fmtNum = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

  // ------------------------------------------------------------------ map

  const style = DT.buildStyle(state.theme, state.layers, D);
  const GROUPS = {};
  style.layers.forEach((l) => { const g = l.metadata && l.metadata['dt:group']; if (g) (GROUPS[g] = GROUPS[g] || []).push(l.id); });
  const BUILDING_FILTER = style.layers.find((l) => l.id === 'buildings-3d').filter;
  // Inside the detailed district the 3D streets replace the flat road lines (except in Realistic mode, where both are off).
  const ROAD_FILTERS = Object.fromEntries(style.layers.filter((l) => /^road-/.test(l.id) && l.type === 'line').map((l) => [l.id, l.filter || null]));
  function districtRoadFilters() {
    const ex = D.downtown && D.downtown.extentLL;
    const within = ex && models && state.layers.models
      ? ['!', ['within', { type: 'Polygon', coordinates: [[[ex[0], ex[1]], [ex[2], ex[1]], [ex[2], ex[3]], [ex[0], ex[3]], [ex[0], ex[1]]]] }]]
      : null;
    for (const [id, f] of Object.entries(ROAD_FILTERS)) {
      if (!map.getLayer(id)) continue;
      map.setFilter(id, within ? (f ? ['all', f, within] : within) : f);
    }
  }

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: HOME.center, zoom: HOME.zoom, pitch: HOME.pitch, bearing: HOME.bearing,
    minZoom: 8, maxZoom: 20, maxPitch: 85,
    maxBounds: [[53.9, 24.2], [56.9, 25.95]],
    hash: true,
    attributionControl: false,
    canvasContextAttributes: { antialias: true },
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right');
  window.dtMap = map; // handy for debugging from the console

  // ------------------------------------------------------------------ generated icons

  function canvasIcon(w, h, draw, ratio = 2) {
    const c = document.createElement('canvas');
    c.width = w * ratio; c.height = h * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    draw(ctx);
    return { data: ctx.getImageData(0, 0, c.width, c.height), ratio };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function makeImage(id) {
    if (id.startsWith('shield-')) {
      const fill = { 'shield-e': '#B3202A', 'shield-d': '#1E5AA8', 'shield-x': '#4F5966' }[id];
      const { data, ratio } = canvasIcon(24, 20, (ctx) => {
        roundRect(ctx, 1, 1, 22, 18, 4); ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
      });
      return [data, { pixelRatio: ratio, stretchX: [[6 * ratio, 18 * ratio]], stretchY: [[6 * ratio, 14 * ratio]], content: [4 * ratio, 3 * ratio, 20 * ratio, 17 * ratio] }];
    }
    if (id.startsWith('lm-')) {
      const cat = id.slice(3);
      const { data, ratio } = canvasIcon(30, 30, (ctx) => {
        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
        ctx.beginPath(); ctx.arc(15, 15, 11.5, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.beginPath(); ctx.arc(15, 15, 9.5, 0, Math.PI * 2); ctx.fillStyle = CAT[cat] || '#555'; ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = '700 11px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(CAT_GLYPH[cat] || '•', 15, 15.5);
      });
      return [data, { pixelRatio: ratio }];
    }
    if (id === 'ico-telecom') {
      const { data, ratio } = canvasIcon(22, 26, (ctx) => {
        ctx.strokeStyle = '#6B3FA0'; ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(11, 9, 8.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(11, 8); ctx.lineTo(7, 24); ctx.moveTo(11, 8); ctx.lineTo(15, 24); ctx.moveTo(8.2, 19); ctx.lineTo(13.8, 19); ctx.stroke();
        ctx.beginPath(); ctx.arc(11, 8, 2, 0, Math.PI * 2); ctx.fillStyle = '#6B3FA0'; ctx.fill();
        ctx.beginPath(); ctx.arc(11, 8, 5, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
      });
      return [data, { pixelRatio: ratio }];
    }
    return [{ width: 1, height: 1, data: new Uint8Array(4) }, {}];
  }
  map.on('styleimagemissing', (e) => {
    if (map.hasImage(e.id)) return;
    const [img, opts] = makeImage(e.id);
    map.addImage(e.id, img, opts);
  });

  // ------------------------------------------------------------------ themes & layers

  function applyTheme(theme) {
    state.theme = theme;
    store.set('theme.v2', theme);
    document.documentElement.dataset.theme = theme;
    $$('.modes button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.theme === theme)));
    if (!map.isStyleLoaded() && !map.loaded()) return;
    const next = DT.buildStyle(theme, state.layers, D);
    for (const layer of next.layers) {
      if (!map.getLayer(layer.id)) continue;
      for (const [k, v] of Object.entries(layer.paint || {})) {
        if (JSON.stringify(map.getPaintProperty(layer.id, k)) !== JSON.stringify(v)) map.setPaintProperty(layer.id, k, v);
      }
    }
    map.setLayoutProperty('satellite', 'visibility', theme === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('hillshade', 'visibility', state.layers.hillshade && theme !== 'satellite' ? 'visible' : 'none');
    map.setSky(next.sky);
    map.setLight(next.light);
    if (sim) sim.setTheme(theme);
    if (models) models.setTheme(theme);
  }

  function setGroup(name, on) {
    state.layers[name] = on;
    store.set('layers', state.layers);
    const input = $(`[data-layer="${name}"]`);
    if (input) input.checked = on;
    if (name === 'terrain') { map.setTerrain(on ? { source: 'dem-terrain', exaggeration: 1.4 } : null); return; }
    if (name === 'traffic') { if (sim) sim.setTraffic(on); return; }
    if (name === 'trains') { if (sim) sim.setTrains(on); return; }
    if (name === 'models') { if (models) { models.setEnabled(on); map.setFilter('buildings-3d', buildingFilter()); districtRoadFilters(); } return; }
    for (const id of GROUPS[name] || []) {
      const visible = on && !(name === 'hillshade' && state.theme === 'satellite');
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }
  const isVisible = (id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none';

  // ------------------------------------------------------------------ simulation

  let sim = null;
  let models = null;
  map.on('load', () => {
    if (DT.createLandmarkModels && D.landmarkModels) {
      DT.createLandmarkModels(map, D, { theme: state.theme, enabled: state.layers.models, beforeId: 'water-names' })
        .then((m) => { models = m; window.dtModels = m; map.setFilter('buildings-3d', buildingFilter()); districtRoadFilters(); })
        .catch((err) => console.error('[twin] detailed 3D landmarks unavailable', err));
    }
    try {
      sim = DT.createSim(map, D, { theme: state.theme, traffic: state.layers.traffic, trains: state.layers.trains, speed: state.speed, density: state.density, beforeId: 'water-names' });
      window.dtSim = sim;
    } catch (err) {
      console.error('[twin] simulation unavailable', err);
    }
    if (!sim) $$('[data-layer="traffic"], [data-layer="trains"]').forEach((i) => { i.disabled = true; i.closest('label').classList.add('disabled'); });
    if (state.layers.terrain) setGroup('terrain', true);
    applyTheme(state.theme);
    updateStatus();
    map.once('idle', () => $('#loader').classList.add('done'));
  });
  setTimeout(() => $('#loader').classList.add('done'), 12000);

  // ------------------------------------------------------------------ hover

  const tooltip = $('#tooltip');
  let hover = null;
  function setHover(next) {
    if (hover && (!next || hover.source !== next.source || hover.id !== next.id)) map.setFeatureState(hover, { hover: false });
    if (next) map.setFeatureState(next, { hover: true });
    hover = next;
  }
  const POINTER_LAYERS = ['landmarks-major', 'landmarks-minor', 'station-circle', 'telecom', 'transit-line'];
  // Rendered community/district features back to their full geometry; the most specific (smallest) area wins.
  const fullArea = (r) => (r.source === 'districts' ? districtById.get(r.id) : adminById.get(r.id));
  const smallestArea = (rendered) => rendered
    .map((r) => ({ r, f: fullArea(r) }))
    .filter((x) => x.f)
    .sort((a, b) => a.f.properties.area_km2 - b.f.properties.area_km2)[0]?.r || null;

  map.on('mousemove', (e) => {
    $('#st-cursor').textContent = fmtLL([e.lngLat.lng, e.lngLat.lat]);
    if (automation) return;
    const pointer = map.queryRenderedFeatures(e.point, { layers: POINTER_LAYERS.filter(isVisible) });
    const areas = map.queryRenderedFeatures(e.point, { layers: ['dist-fill', 'comm-fill'].filter(isVisible) });
    map.getCanvas().style.cursor = pointer.length ? 'pointer' : '';
    const area = smallestArea(areas);
    if (area) {
      setHover({ source: area.source, id: area.id });
      const f = fullArea(area);
      tooltip.innerHTML = `<strong>${esc(f.properties.name)}</strong><span>${esc(KIND[f.properties.kind])}</span>`;
      tooltip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
      tooltip.hidden = false;
    } else {
      setHover(null);
      tooltip.hidden = true;
    }
  });
  map.getCanvas().addEventListener('mouseleave', () => { setHover(null); tooltip.hidden = true; });
  map.on('movestart', () => { tooltip.hidden = true; });

  // ------------------------------------------------------------------ click / inspect

  map.on('click', (e) => {
    const pick = (ids, pad = 0) => {
      const layers = ids.filter(isVisible);
      if (!layers.length) return null;
      const box = pad ? [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]] : e.point;
      return map.queryRenderedFeatures(box, { layers })[0] || null;
    };
    let f;
    const model = models && models.pick(e.point);
    if (model) return showModel(model);
    if ((f = pick(['landmarks-major', 'landmarks-minor'], 4))) return showLandmark(f);
    if ((f = pick(['station-circle', 'station-label'], 4))) return showStation(f);
    if ((f = pick(['telecom'], 4))) return showTelecom(f);
    if ((f = pick(['cycle-line'], 4))) return showCycle(f, e.lngLat);
    if ((f = pick(['transit-line', 'transit-tunnel', 'rail-etihad'], 3))) return showLine(f);
    if ((f = pick(['buildings-3d']))) return showBuilding(f, e.lngLat);
    const areaLayers = ['dist-fill', 'comm-fill'].filter(isVisible);
    const area = areaLayers.length && smallestArea(map.queryRenderedFeatures(e.point, { layers: areaLayers }));
    if (area) return selectArea(fullArea(area), false);
    closeInfo();
  });

  const info = $('#info');
  function showInfo({ eyebrow, color, title, arabic, desc, rows = [], chips = null, actions = [], note }) {
    info.innerHTML = `
      <button class="info-close" data-act="close" aria-label="Close">${ICON.close}</button>
      <div class="eyebrow">${color ? `<i style="background:${esc(color)}"></i>` : ''}${esc(eyebrow)}</div>
      <h2>${esc(title)}</h2>
      ${arabic ? `<div class="arabic" lang="ar" dir="rtl">${esc(arabic)}</div>` : ''}
      ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
      <dl>${rows.filter((r) => r && r[1] !== null && r[1] !== undefined && r[1] !== '').map(([k, v, raw]) => `<dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>
      ${chips ? `<div class="chips-title">${esc(chips.title)}</div><div class="chips">${chips.items.map((c) => `<button class="chip" data-chip="${esc(c.key)}">${c.dot ? `<i style="background:${esc(c.dot)}"></i>` : ''}${esc(c.label)}</button>`).join('')}</div>` : ''}
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <div class="actions">${actions.map((a, i) => `<button class="${i === 0 ? 'primary' : ''}" data-act="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div>`;
    info.hidden = false;
    info.scrollTop = 0;
    info.onclick = (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      if (btn.dataset.act === 'close') return closeInfo();
      const a = actions.find((x) => x.id === btn.dataset.act);
      if (a) a.run();
      if (btn.dataset.chip && chips) chips.run(btn.dataset.chip);
    };
  }
  function closeInfo() {
    info.hidden = true;
    map.getSource('selection').setData({ type: 'FeatureCollection', features: [] });
    clearBuilding();
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(() => toast('Copied ' + text), () => toast(text));
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  const osmLink = (id) => {
    if (!id) return null;
    const type = { n: 'node', w: 'way', r: 'relation' }[id[0]];
    return `<a href="https://www.openstreetmap.org/${type}/${id.slice(1)}" target="_blank" rel="noopener">${type} ${id.slice(1)}</a>`;
  };
  const whereRow = (c) => {
    const w = whereIs(c);
    return ['Community', [w.district && w.district.properties.name, w.community && w.community.properties.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || '—'];
  };
  const pointActions = (c, zoom = 16.6) => [
    { id: 'fly', label: 'Fly here', run: () => flyTo({ center: c, zoom, pitch: 64, bearing: map.getBearing() }) },
    { id: 'orbit', label: 'Orbit', run: () => flyTo({ center: c, zoom, pitch: 64, bearing: map.getBearing() }).then((ok) => ok && setOrbit(true)) },
    { id: 'copy', label: 'Copy coordinates', run: () => copy(`${c[1].toFixed(6)}, ${c[0].toFixed(6)}`) },
  ];

  function landmarkFeature(name) { return D.landmarks.features.find((f) => f.properties.name === name); }

  const MODEL_FOR_LANDMARK = { 'Burj Khalifa': 'burj-khalifa', 'Burj Al Arab': 'burj-al-arab', 'Museum of the Future': 'museum-of-the-future', 'The Dubai Mall': 'dubai-mall', 'Dubai Opera': 'dubai-opera' };
  function showLandmark(f) {
    const key = MODEL_FOR_LANDMARK[f.properties.name];
    if (key && models && state.layers.models && DT.MODEL_DEFS[key]) {
      const origin = D.landmarkModels[key]?.origin || landmarkFeature(f.properties.name)?.geometry.coordinates || f.geometry.coordinates;
      return showModel({ def: DT.MODEL_DEFS[key], origin, height: DT.MODEL_DEFS[key].height || { 'burj-khalifa': 830, 'burj-al-arab': 321, 'museum-of-the-future': 77 }[key] });
    }
    const p = f.properties, c = landmarkFeature(p.name)?.geometry.coordinates || f.geometry.coordinates;
    showInfo({
      eyebrow: `Landmark · ${p.cat}`, color: CAT[p.cat], title: p.name, desc: p.desc,
      rows: [['Height', p.height ? `${fmtNum(p.height, p.height % 1 ? 1 : 0)} m` : null], whereRow(c), ['Coordinates', fmtLL(c)], ['OSM', osmLink(p.id), true]],
      actions: pointActions(c),
    });
  }

  function showModel({ def, origin, height, info }) {
    clearBuilding();
    map.getSource('selection').setData({ type: 'FeatureCollection', features: [] });
    if (info) {
      return showInfo({
        eyebrow: info.eyebrow, color: CAT.Tower, title: info.title, desc: info.desc,
        rows: [...info.rows, whereRow(origin), ['Coordinates', fmtLL(origin)], ['OSM', osmLink(info.osm), true]],
        note: info.note,
        actions: [
          { id: 'orbit', label: 'Orbit', run: () => flyTo({ center: origin, zoom: height > 150 ? 16 : 17, pitch: 64, bearing: map.getBearing() }).then((ok) => ok && setOrbit(true)) },
          { id: 'copy', label: 'Copy coordinates', run: () => copy(`${origin[1].toFixed(6)}, ${origin[0].toFixed(6)}`) },
        ],
      });
    }
    showInfo({
      eyebrow: def.eyebrow, color: CAT.Icon, title: def.title, desc: def.desc,
      rows: [...def.facts, whereRow(origin), ['Coordinates', fmtLL(origin)]],
      note: 'Procedural 3D model: massing and position from OpenStreetMap, proportions and details from published dimensions and photographs.',
      actions: [
        { id: 'orbit', label: 'Orbit', run: () => flyTo({ center: origin, zoom: height > 400 ? 15 : 16.4, pitch: 66, bearing: map.getBearing() }).then((ok) => ok && setOrbit(true)) },
        { id: 'fly', label: 'Fly here', run: () => flyTo({ center: origin, zoom: height > 400 ? 15.2 : 16.6, pitch: 64, bearing: map.getBearing() }) },
        { id: 'copy', label: 'Copy coordinates', run: () => copy(`${origin[1].toFixed(6)}, ${origin[0].toFixed(6)}`) },
      ],
    });
  }

  function showStation(f) {
    const p = f.properties, c = f.geometry.coordinates;
    const lines = Array.isArray(p.lines) ? p.lines : JSON.parse(p.lines || '[]');
    showInfo({
      eyebrow: { metro: 'Dubai Metro station', tram: 'Tram stop', monorail: 'Monorail station', rail: 'Etihad Rail station' }[p.kind] || 'Station', color: p.colour,
      title: p.name, arabic: p.name_ar,
      rows: [['Lines', lines.join(', ') || '—'], ['Interchange', p.interchange ? 'Yes' : null], whereRow(c), ['Coordinates', fmtLL(c)], ['OSM', osmLink(p.id), true]],
      actions: pointActions(c, 17),
    });
  }

  function showTelecom(f) {
    const p = f.properties, c = f.geometry.coordinates;
    showInfo({
      eyebrow: p.kind === 'tower' ? 'Communications tower' : 'Telecom mast', color: '#6B3FA0',
      title: p.name || p.operator || 'Telecom mast',
      rows: [['Operator', p.operator], ['Height', p.height ? `${p.height} m` : null], whereRow(c), ['Coordinates', fmtLL(c)], ['OSM', osmLink(p.id), true]],
      actions: pointActions(c, 17.5),
      note: `${D.telecom.features.length} masts and towers are mapped in OpenStreetMap for Dubai; operator sites are not all public.`,
    });
  }

  function showCycle(f, ll) {
    const p = f.properties, c = [ll.lng, ll.lat];
    showInfo({
      eyebrow: p.kind === 'cycleway' ? 'Dedicated cycle track' : 'Shared path (bicycles designated)', color: state.theme === 'night' ? '#2BF0A0' : '#0FA968',
      title: p.name || 'Cycle track',
      rows: [['Surface', p.surface], ['Lit', p.lit], ['Bridge', p.bridge ? 'Yes' : null], whereRow(c), ['Network total', `${fmtNum(D.cycleways.km)} km mapped in Dubai`], ['OSM', osmLink(p.id), true]],
      actions: pointActions(c, 16.5),
    });
  }

  function showLine(f) {
    const feature = D.transit.lines.features.find((x) => x.properties.id === (f.properties.route || f.properties.id)) || f;
    const p = feature.properties;
    const coords = feature.geometry.coordinates.flat();
    const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
    const bb = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    const km = feature.geometry.coordinates.reduce((a, line) => a + line.reduce((s, c, i) => (i ? s + metres(line[i - 1], c) : 0), 0), 0) / 1000;
    showInfo({
      eyebrow: { subway: 'Dubai Metro', tram: 'Dubai Tram', monorail: 'Monorail / people mover', train: 'Etihad Rail' }[p.mode] || 'Rail', color: p.colour,
      title: p.name, rows: [['From', p.from], ['To', p.to], ['Mapped length', `${fmtNum(km, 1)} km`], ['OSM', osmLink(p.id), true]],
      actions: [{ id: 'fit', label: 'Show whole line', run: () => map.fitBounds(bb, { padding: fitPadding(), pitch: 40, duration: 1800 }) }],
    });
  }

  let selectedBuilding = null;
  // Tile buildings minus the ones replaced by detailed 3D models and minus the highlighted one.
  function buildingFilter() {
    const filter = ['all', BUILDING_FILTER];
    // match is a hash lookup, so hiding thousands of replaced tile buildings stays cheap
    if (models && state.layers.models && models.hiddenIds.length) filter.push(['match', ['id'], models.hiddenIds, false, true]);
    if (selectedBuilding !== null) filter.push(['!=', ['id'], selectedBuilding]);
    return filter;
  }
  function clearBuilding() {
    if (selectedBuilding === null) return;
    selectedBuilding = null;
    map.setFilter('buildings-3d', buildingFilter());
    map.setFilter('buildings-sel', ['==', ['id'], -1]);
  }
  function showBuilding(f, ll) {
    const p = f.properties, c = [ll.lng, ll.lat];
    const h = p.render_height ?? 0, base = p.render_min_height ?? 0;
    if (f.id !== undefined && f.id !== null) {
      selectedBuilding = f.id;
      map.setFilter('buildings-3d', buildingFilter());
      map.setFilter('buildings-sel', ['==', ['id'], f.id]);
    }
    map.getSource('selection').setData({ type: 'FeatureCollection', features: [] });
    showInfo({
      eyebrow: 'Building', color: state.theme === 'night' ? '#5A84C0' : '#86A7C7',
      title: h ? `${fmtNum(h, h % 1 ? 1 : 0)} m tall` : 'Building',
      rows: [['Height', `${fmtNum(h, 1)} m`], ['Base', base ? `${fmtNum(base, 1)} m` : null], ['Est. floors', h > 4 ? `≈ ${Math.max(1, Math.round((h - base) / 3.3))}` : null], whereRow(c), ['Clicked at', fmtLL(c)]],
      note: 'Height comes from OpenStreetMap height / building:levels tags; untagged buildings fall back to a default.',
      actions: pointActions(c, 17.2),
    });
  }

  function areaStats(f) {
    const inside = (c) => inFeature(c, f);
    const stations = D.transit.stations.features.filter((s) => inside(s.geometry.coordinates));
    const landmarks = D.landmarks.features.filter((l) => inside(l.geometry.coordinates));
    const masts = D.telecom.features.filter((t) => inside(t.geometry.coordinates)).length;
    let cycle = 0;
    for (const w of D.cycleways.features) {
      const cs = w.geometry.coordinates;
      for (let i = 1; i < cs.length; i++) if (inside([(cs[i - 1][0] + cs[i][0]) / 2, (cs[i - 1][1] + cs[i][1]) / 2])) cycle += metres(cs[i - 1], cs[i]);
    }
    const subAreas = D.communities.districts.features.filter((d) => d !== f && d.properties.area_km2 < f.properties.area_km2 && inside(labelOf(d)));
    return { stations, landmarks, masts, cycleKm: cycle / 1000, subAreas };
  }
  const labelIndex = new Map(D.communities.labels.features.map((l) => [l.properties.id, l.geometry.coordinates]));
  const labelOf = (f) => labelIndex.get(f.properties.id) || [(f.properties.bbox[0] + f.properties.bbox[2]) / 2, (f.properties.bbox[1] + f.properties.bbox[3]) / 2];

  function selectArea(f, fly = true) {
    if (!f) return;
    clearBuilding();
    map.getSource('selection').setData(f);
    const p = f.properties, c = labelOf(f);
    const s = areaStats(f);
    const parent = p.level === null || p.kind === 'island' || p.kind === 'district' || p.kind === 'neighbourhood'
      ? D.communities.admin.features.filter((a) => a !== f && a.properties.area_km2 > p.area_km2 && inFeature(c, a)).sort((a, b) => a.properties.area_km2 - b.properties.area_km2)[0]
      : null;
    const chipItems = [
      ...s.stations.map((st) => ({ key: 'st:' + st.properties.id, label: st.properties.name, dot: st.properties.colour })),
      ...s.landmarks.map((l) => ({ key: 'lm:' + l.properties.name, label: l.properties.name, dot: CAT[l.properties.cat] })),
      ...s.subAreas.sort((a, b) => b.properties.area_km2 - a.properties.area_km2).slice(0, 24).map((d) => ({ key: 'd:' + d.id, label: d.properties.name })),
    ];
    showInfo({
      eyebrow: KIND[p.kind] + (p.level ? ` · admin level ${p.level}` : ''), color: CAT.Icon,
      title: p.name, arabic: p.name_ar,
      rows: [
        ['Area', `${fmtNum(p.area_km2, p.area_km2 < 10 ? 2 : 1)} km²`],
        ['Part of', parent ? parent.properties.name : null],
        ['Metro / tram stops', s.stations.length || null],
        ['Cycle tracks', s.cycleKm >= 0.05 ? `${fmtNum(s.cycleKm, 1)} km` : null],
        ['Telecom masts', s.masts || null],
        ['Sub-areas', s.subAreas.length || null],
        ['Centre', fmtLL(c)],
        ['OSM', osmLink(p.id), true],
      ],
      chips: chipItems.length ? {
        title: 'Inside this area', items: chipItems,
        run(key) {
          const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
          if (kind === 'st') { const st = D.transit.stations.features.find((x) => x.properties.id === id); flyTo({ center: st.geometry.coordinates, zoom: 17, pitch: 60, bearing: map.getBearing() }); showStation(st); }
          if (kind === 'lm') { const lm = landmarkFeature(id); flyTo({ center: lm.geometry.coordinates, zoom: 16.6, pitch: 64, bearing: map.getBearing() }); showLandmark(lm); }
          if (kind === 'd') selectArea(districtById.get(Number(id)));
        },
      } : null,
      actions: [
        { id: 'fit', label: 'Fit to area', run: () => fitArea(f) },
        { id: 'copy', label: 'Copy centre', run: () => copy(`${c[1].toFixed(6)}, ${c[0].toFixed(6)}`) },
      ],
    });
    if (fly) fitArea(f);
  }

  function fitPadding() {
    const wide = window.innerWidth > 900;
    const layersOpen = !$('#layers').hidden && wide;
    return wide
      ? { top: 110, bottom: 110, left: layersOpen ? 360 : 80, right: 420 }
      : { top: 120, bottom: Math.round(window.innerHeight * 0.45), left: 30, right: 30 };
  }
  function fitArea(f) {
    stopAutomation();
    map.fitBounds(f.properties.bbox, { padding: fitPadding(), pitch: 50, bearing: map.getBearing(), maxZoom: 16.5, duration: 2000 });
  }

  // ------------------------------------------------------------------ camera automation (fly, orbit, tour)

  let automation = null; // 'orbit' | 'tour' | null
  let tourToken = 0;

  function flyTo(cam) {
    return new Promise((resolve) => {
      const token = tourToken;
      map.flyTo(Object.assign({ speed: 0.9, curve: 1.4, essential: true }, cam));
      map.once('moveend', () => resolve(token === tourToken));
    });
  }

  function setOrbit(on) {
    if (on && automation === 'tour') stopAutomation();
    automation = on ? 'orbit' : automation === 'orbit' ? null : automation;
    $('[data-act="orbit"]').classList.toggle('active', automation === 'orbit');
    if (automation === 'orbit') {
      const spin = () => {
        if (automation !== 'orbit') return;
        map.setBearing(map.getBearing() + 0.1);
        requestAnimationFrame(spin);
      };
      requestAnimationFrame(spin);
    }
  }

  function stopAutomation() {
    if (!automation) return;
    tourToken++;
    automation = null;
    map.stop();
    $('[data-act="orbit"]').classList.remove('active');
    $('[data-act="tour"]').classList.remove('active');
    $('#caption').hidden = true;
  }
  ['mousedown', 'touchstart', 'wheel'].forEach((ev) => map.getCanvasContainer().addEventListener(ev, stopAutomation, { passive: true }));

  const TOUR = [
    { title: 'Downtown Dubai', sub: 'Every building modelled in detail around the Burj Khalifa', cam: { center: [55.2770, 25.1950], zoom: 15.2, pitch: 64, bearing: -40 } },
    { title: 'Burj Khalifa', sub: '828 m · the world\'s tallest building', cam: { center: [55.2744, 25.1972], zoom: 16.1, pitch: 70, bearing: -20 } },
    { title: 'The Dubai Fountain', sub: '275 m of jets in Burj Khalifa Lake, up to 150 m high', cam: { center: [55.2762, 25.1955], zoom: 16.9, pitch: 66, bearing: 10 } },
    { title: 'Souk Al Bahar & Old Town', sub: 'Arabic revival quarter of wind towers and arcades', cam: { center: [55.2765, 25.1935], zoom: 16.8, pitch: 60, bearing: -20 } },
    { title: 'The Dubai Mall', sub: 'Waterfront terraces, skylights and the Grand Atrium', cam: { center: [55.2790, 25.1975], zoom: 16.3, pitch: 60, bearing: -110 } },
    { title: 'Dubai Opera', sub: 'A dhow in glass and stone, prow to the Burj', cam: { center: [55.2720, 25.1958], zoom: 17.3, pitch: 62, bearing: -100 } },
    { title: 'Sheikh Zayed Road', sub: 'Dubai\'s spine: E11 lined by towers from DIFC to Trade Centre', cam: { center: [55.2815, 25.2135], zoom: 15.4, pitch: 68, bearing: -38 } },
    { title: 'Museum of the Future', sub: 'Torus of steel and Arabic calligraphy', cam: { center: [55.2821, 25.2192], zoom: 17, pitch: 64, bearing: 30 } },
    { title: 'Dubai Frame', sub: '150 m frame between old and new Dubai', cam: { center: [55.3004, 25.2355], zoom: 16.4, pitch: 62, bearing: -60 } },
    { title: 'Old Dubai & the Creek', sub: 'Al Fahidi, Al Seef and the Deira souks', cam: { center: [55.2985, 25.2645], zoom: 15.6, pitch: 60, bearing: 20 } },
    { title: 'Dubai International Airport', sub: 'DXB, in the heart of the city', cam: { center: [55.3650, 25.2528], zoom: 13.8, pitch: 55, bearing: -30 } },
    { title: 'Dubai Creek Harbour', sub: 'Waterfront city beside Ras Al Khor sanctuary', cam: { center: [55.3455, 25.2035], zoom: 15.2, pitch: 62, bearing: -30 } },
    { title: 'Business Bay', sub: 'Towers along the Dubai Water Canal', cam: { center: [55.2665, 25.1870], zoom: 15.4, pitch: 64, bearing: 60 } },
    { title: 'Burj Al Arab', sub: 'The sail on its own island', cam: { center: [55.1853, 25.1412], zoom: 16.6, pitch: 66, bearing: 140 } },
    { title: 'Palm Jumeirah', sub: 'Trunk, 16 fronds and an 11 km crescent', cam: { center: [55.1330, 25.1160], zoom: 13.3, pitch: 55, bearing: 10 } },
    { title: 'Atlantis The Royal & The Palm', sub: 'Resorts at the crescent\'s apex', cam: { center: [55.1220, 25.1340], zoom: 16, pitch: 64, bearing: 100 } },
    { title: 'Ain Dubai & Bluewaters', sub: 'Observation wheel off JBR', cam: { center: [55.1225, 25.0800], zoom: 16, pitch: 64, bearing: -120 } },
    { title: 'Dubai Marina', sub: 'A canal city of supertalls', cam: { center: [55.1405, 25.0800], zoom: 15.4, pitch: 68, bearing: 30 } },
    { title: 'Expo City Dubai', sub: 'Al Wasl Dome and the Expo 2020 legacy', cam: { center: [55.1507, 24.9608], zoom: 16, pitch: 60, bearing: 0 } },
    { title: 'Hatta', sub: 'Dubai\'s mountain enclave in the Hajar range', cam: { center: [56.1250, 24.7990], zoom: 13.2, pitch: 72, bearing: 40 }, terrain: true },
  ];

  async function startTour() {
    if (automation === 'tour') return stopAutomation();
    stopAutomation();
    automation = 'tour';
    const token = ++tourToken;
    $('[data-act="tour"]').classList.add('active');
    closeInfo();
    const caption = $('#caption');
    for (let i = 0; i < TOUR.length; i++) {
      const stop = TOUR[i];
      if (token !== tourToken) return;
      if (stop.terrain && !state.layers.terrain) setGroup('terrain', true);
      caption.innerHTML = `<span>${i + 1} / ${TOUR.length}</span><strong>${esc(stop.title)}</strong><em>${esc(stop.sub)}</em>`;
      caption.hidden = false;
      if (!(await flyTo(Object.assign({ speed: 0.6 }, stop.cam)))) return;
      await new Promise((resolve) => {
        map.easeTo({ bearing: stop.cam.bearing + 35, duration: 7000, easing: (t) => t });
        map.once('moveend', resolve);
      });
    }
    if (token === tourToken) stopAutomation();
  }

  // ------------------------------------------------------------------ search

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`ʼ]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
  const INDEX = [];
  const seen = new Set();
  function addIndex(entry) {
    const key = norm(entry.name) + '|' + entry.group;
    if (seen.has(key)) return;
    seen.add(key);
    entry.n = norm(entry.name);
    entry.a = entry.ar || '';
    INDEX.push(entry);
  }
  D.landmarks.features.forEach((f) => addIndex({ name: f.properties.name, group: 'Landmark', sub: f.properties.cat, color: CAT[f.properties.cat], run: () => { flyTo({ center: f.geometry.coordinates, zoom: 16.6, pitch: 64, bearing: map.getBearing() }); showLandmark(f); } }));
  D.communities.admin.features.forEach((f) => addIndex({ name: f.properties.name, ar: f.properties.name_ar, group: 'Community', sub: `${KIND[f.properties.kind]} · ${fmtNum(f.properties.area_km2, 1)} km²`, run: () => selectArea(f) }));
  D.communities.districts.features.forEach((f) => addIndex({ name: f.properties.name, ar: f.properties.name_ar, group: 'Area', sub: `${KIND[f.properties.kind]} · ${fmtNum(f.properties.area_km2, 2)} km²`, run: () => selectArea(f) }));
  D.transit.stations.features.forEach((f) => {
    const lines = Array.isArray(f.properties.lines) ? f.properties.lines : [];
    addIndex({ name: f.properties.name, ar: f.properties.name_ar, group: 'Station', sub: lines.join(', ') || f.properties.kind, color: f.properties.colour, run: () => { flyTo({ center: f.geometry.coordinates, zoom: 17, pitch: 60, bearing: map.getBearing() }); showStation(f); } });
  });
  D.places.forEach((p) => addIndex({ name: p.name, ar: p.name_ar, group: 'Place', sub: p.place, run: () => flyTo({ center: p.ll, zoom: 15, pitch: 55, bearing: map.getBearing() }) }));

  const GROUP_RANK = { Landmark: 0, Community: 1, Area: 2, Station: 3, Place: 4 };
  function search(q) {
    const coord = q.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (coord) {
      let a = parseFloat(coord[1]), b = parseFloat(coord[2]);
      if (a > 50 && b < 30) [a, b] = [b, a]; // accept "lon, lat" too
      return [{ name: `${a.toFixed(6)}, ${b.toFixed(6)}`, group: 'Coordinates', sub: 'Fly to this point', run: () => gotoPoint([b, a]) }];
    }
    const n = norm(q);
    if (!n) return [];
    const words = n.split(' ');
    const scored = [];
    for (const e of INDEX) {
      let score;
      if (e.n === n) score = 0;
      else if (e.n.startsWith(n)) score = 1;
      else if (e.n.split(' ').some((w) => w.startsWith(n))) score = 2;
      else if (words.every((w) => e.n.includes(w))) score = 3;
      else if (e.a && e.a.includes(q.trim())) score = 3;
      else continue;
      scored.push([score * 10 + GROUP_RANK[e.group], e]);
    }
    return scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).slice(0, 12).map((x) => x[1]);
  }

  let pointMarker = null;
  function gotoPoint(c) {
    if (pointMarker) pointMarker.remove();
    pointMarker = new maplibregl.Marker({ color: '#D9922E' }).setLngLat(c).addTo(map);
    flyTo({ center: c, zoom: 17, pitch: 60, bearing: map.getBearing() });
    showInfo({ eyebrow: 'Coordinates', color: '#D9922E', title: `${c[1].toFixed(6)}, ${c[0].toFixed(6)}`, rows: [whereRow(c), ['Position', fmtLL(c)]], actions: pointActions(c, 17) });
  }

  const input = $('#search'), results = $('#search-results');
  let current = [], active = -1;
  function renderResults() {
    results.hidden = !current.length;
    input.setAttribute('aria-expanded', String(!!current.length));
    results.innerHTML = current.map((r, i) => `
      <li role="option" id="sr-${i}" aria-selected="${i === active}" data-i="${i}">
        <i style="background:${esc(r.color || 'var(--muted)')}"></i>
        <span class="r-name">${esc(r.name)}</span>
        <span class="r-sub">${esc(r.group)}${r.sub ? ' · ' + esc(r.sub) : ''}</span>
      </li>`).join('');
    if (active >= 0) input.setAttribute('aria-activedescendant', `sr-${active}`); else input.removeAttribute('aria-activedescendant');
  }
  function choose(i) {
    const r = current[i];
    if (!r) return;
    stopAutomation();
    r.run();
    input.value = r.name;
    current = []; active = -1; renderResults();
    input.blur();
  }
  input.addEventListener('input', () => { current = search(input.value); active = current.length ? 0 : -1; renderResults(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(current.length - 1, active + 1); renderResults(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); renderResults(); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(active < 0 ? 0 : active); e.preventDefault(); }
    else if (e.key === 'Escape') { input.value = ''; current = []; renderResults(); input.blur(); }
  });
  input.addEventListener('focus', () => { if (input.value) { current = search(input.value); renderResults(); } });
  results.addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); choose(Number(li.dataset.i)); } });
  input.addEventListener('blur', () => setTimeout(() => { current = []; renderResults(); }, 120));

  // ------------------------------------------------------------------ status bar

  function updateStatus() {
    const c = map.getCenter();
    const w = whereIs([c.lng, c.lat]);
    const names = [w.district && w.district.properties.name, w.community && w.community.properties.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    $('#st-where').textContent = names.join(' · ') || 'Dubai';
    $('#st-view').textContent = `Z ${map.getZoom().toFixed(1)} · P ${Math.round(map.getPitch())}° · B ${Math.round(map.getBearing())}°`;
    $('#compass-needle').style.transform = `rotate(${-map.getBearing()}deg)`;
    $('[data-act="pitch"]').classList.toggle('active', map.getPitch() > 5);
  }
  map.on('moveend', updateStatus);
  map.on('rotate', () => { $('#compass-needle').style.transform = `rotate(${-map.getBearing()}deg)`; });
  $('#st-cursor').addEventListener('click', () => copy($('#st-cursor').textContent));

  // ------------------------------------------------------------------ controls

  const ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  const DESTINATIONS = [
    ['Overview', null],
    ['Downtown', { center: [55.2744, 25.1952], zoom: 15.6, pitch: 62, bearing: -30 }],
    ['Business Bay', { center: [55.2660, 25.1860], zoom: 15.2, pitch: 58, bearing: 20 }],
    ['DIFC', { center: [55.2800, 25.2120], zoom: 15.4, pitch: 60, bearing: -35 }],
    ['Marina', { center: [55.1405, 25.0805], zoom: 15.3, pitch: 62, bearing: 40 }],
    ['JBR & Bluewaters', { center: [55.1265, 25.0790], zoom: 15.4, pitch: 60, bearing: -60 }],
    ['Palm Jumeirah', { center: [55.1350, 25.1150], zoom: 13.2, pitch: 50, bearing: -20 }],
    ['Burj Al Arab', { center: [55.1853, 25.1413], zoom: 16, pitch: 62, bearing: 120 }],
    ['Old Dubai', { center: [55.2980, 25.2640], zoom: 15.2, pitch: 58, bearing: -10 }],
    ['Creek Harbour', { center: [55.3460, 25.2010], zoom: 15, pitch: 60, bearing: 30 }],
    ['Dubai Hills', { center: [55.2450, 25.1030], zoom: 14.6, pitch: 55, bearing: 0 }],
    ['DXB', { center: [55.3650, 25.2528], zoom: 13.6, pitch: 50, bearing: -30 }],
    ['Expo City', { center: [55.1500, 24.9620], zoom: 15.4, pitch: 58, bearing: 20 }],
    ['Jebel Ali', { center: [55.0600, 25.0050], zoom: 13, pitch: 50, bearing: 0 }],
    ['Hatta', { center: [56.1250, 24.7990], zoom: 13, pitch: 68, bearing: 30, terrain: true }],
  ];
  $('#dest').innerHTML = DESTINATIONS.map(([name], i) => `<button data-dest="${i}">${esc(name)}</button>`).join('');
  $('#dest').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    stopAutomation();
    const [, cam] = DESTINATIONS[Number(b.dataset.dest)];
    if (!cam) {
      map.fitBounds(D.boundary.bbox, { padding: fitPadding(), pitch: 30, bearing: 0, duration: 2200 });
      return;
    }
    if (cam.terrain && !state.layers.terrain) setGroup('terrain', true);
    flyTo(cam);
  });

  function toggleLayers(force) {
    const panel = $('#layers');
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    document.body.classList.toggle('layers-open', open);
    $('[data-act="layers"]').classList.toggle('active', open);
    $('[data-act="layers"]').setAttribute('aria-expanded', String(open));
  }

  function snapshot() {
    map.once('render', () => {
      const a = document.createElement('a');
      a.href = map.getCanvas().toDataURL('image/png');
      a.download = `dubai-twin-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.click();
    });
    map.triggerRepaint();
  }

  const ACTIONS = {
    layers: () => toggleLayers(),
    'zoom-in': () => map.zoomIn(),
    'zoom-out': () => map.zoomOut(),
    compass: () => map.easeTo({ bearing: 0, duration: 800 }),
    pitch: () => map.easeTo(map.getPitch() > 5 ? { pitch: 0, bearing: 0, duration: 900 } : { pitch: 60, duration: 900 }),
    orbit: () => setOrbit(automation !== 'orbit'),
    tour: () => startTour(),
    home: () => { stopAutomation(); flyTo(HOME); },
    snapshot,
    fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()),
    help: () => { const h = $('#help'); h.hidden = !h.hidden; },
  };
  $$('.toolbar [data-act], #help [data-act]').forEach((b) => b.addEventListener('click', () => ACTIONS[b.dataset.act]?.()));
  $('#layers-close').addEventListener('click', () => toggleLayers(false));

  $$('.modes button').forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.theme)));
  $$('[data-layer]').forEach((i) => {
    i.checked = !!state.layers[i.dataset.layer];
    i.addEventListener('change', () => setGroup(i.dataset.layer, i.checked));
  });

  const speed = $('#speed');
  speed.value = state.speed;
  $('#speed-val').textContent = `×${state.speed}`;
  speed.addEventListener('input', () => {
    state.speed = Number(speed.value);
    store.set('speed', state.speed);
    $('#speed-val').textContent = `×${state.speed}`;
    if (sim) sim.setSpeed(state.speed);
  });

  const densityButtons = $$('[data-density]');
  const showDensity = () => densityButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.density === state.density)));
  densityButtons.forEach((b) => b.addEventListener('click', () => {
    state.density = b.dataset.density;
    store.set('density', state.density);
    showDensity();
    if (sim) sim.setDensity(state.density);
  }));
  showDensity();

  // Layer counts from the data itself
  const counts = {
    communities: `${D.communities.admin.features.length}`,
    districts: `${D.communities.districts.features.length}`,
    cycle: `${fmtNum(D.cycleways.km)} km`,
    transit: `${D.transit.stations.features.length} stops`,
    landmarks: `${D.landmarks.features.length}`,
    telecom: `${D.telecom.features.length}`,
    traffic: `${fmtNum(D.roads.edges.length)} road links`,
  };
  Object.entries(counts).forEach(([k, v]) => { const el = $(`[data-count="${k}"]`); if (el) el.textContent = v; });
  $('#st-osm').textContent = D.meta?.osm ? `OSM data ${D.meta.osm.slice(0, 10)}` : '';
  $('#legend-cats').innerHTML = Object.entries(CAT).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('');

  // Keyboard shortcuts (MapLibre already handles arrows, +/- and shift+arrows)
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map1 = { '1': 'satellite', '2': 'day', '3': 'dusk', '4': 'night' };
    if (k === '/') { input.focus(); e.preventDefault(); }
    else if (map1[k]) applyTheme(map1[k]);
    else if (k === 'l') ACTIONS.layers();
    else if (k === 'r') ACTIONS.home();
    else if (k === 'n') ACTIONS.compass();
    else if (k === 'v') ACTIONS.pitch();
    else if (k === 'o') ACTIONS.orbit();
    else if (k === 't') ACTIONS.tour();
    else if (k === 'f') ACTIONS.fullscreen();
    else if (k === '?') ACTIONS.help();
    else if (k === 'escape') { stopAutomation(); closeInfo(); $('#help').hidden = true; }
  });

  // The layers panel starts closed (clean first view) and then remembers its last state.
  toggleLayers(window.innerWidth > 1100 && store.get('layersOpen') === true);
  new MutationObserver(() => store.set('layersOpen', !$('#layers').hidden)).observe($('#layers'), { attributes: true, attributeFilter: ['hidden'] });
  document.documentElement.dataset.theme = state.theme;
  $$('.modes button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.theme === state.theme)));
})();
