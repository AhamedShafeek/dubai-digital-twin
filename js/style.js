/* Map style for the Dubai digital twin.
 * Base: OpenFreeMap vector tiles (OpenMapTiles schema, OpenStreetMap data).
 * Overlays: local OSM extracts in data/*.js (communities, cycle network, transit, landmarks, telecom).
 * Every layer carries metadata["dt:group"] so the UI can toggle whole groups. */
(function () {
  'use strict';

  const OMT = 'omt';
  const FONT = { regular: ['Noto Sans Regular'], bold: ['Noto Sans Bold'], italic: ['Noto Sans Italic'] };
  const NAME = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];

  const THEMES = {
    day: {
      bg: '#EEE5D1', sand: '#EADBB9', landOpacity: 1, waterOpacity: 1,
      landuse: { residential: '#EBE3D3', commercial: '#E8DED2', industrial: '#E2DACD', institutional: '#EADFD6', cemetery: '#DCE2CC', sport: '#CFE3B5' },
      green: { park: '#C3DCA6', grass: '#CCE0AE', wood: '#ADCD8F', golf: '#B4D896', farmland: '#DDE5C0', wetland: '#C9DFD3' },
      water: '#8DD3E0', waterLine: '#74C0D0', waterLabel: '#2E7F92',
      aeroway: '#E3DBCB', runway: '#CFC7B8',
      road: {
        motorway: ['#FFCF7A', '#D69A47'], trunk: ['#FFDD9E', '#D8AE6E'], primary: ['#FFF4DC', '#CDB590'],
        secondary: ['#FFFFFF', '#D2C2A2'], tertiary: ['#FFFFFF', '#D6C8AC'], minor: ['#FFFFFF', '#DDD1BA'], service: ['#FBF7EF', '#DFD5C2'],
      },
      roadOpacity: 1, path: '#FFFFFF', rail: '#ADA493',
      bld: ['#F6F2EA', '#E6E4DF', '#CCD6DF', '#A9BFD3', '#86A7C7'], bldOpacity: 0.96,
      label: '#3E3A33', labelSoft: '#7C7366', halo: 'rgba(255,253,248,0.92)',
      communityLabel: '#5B4B35', communityLine: '#A0855F', districtLine: '#B8A585',
      mask: 'rgba(233,224,204,0.8)', boundary: '#C0762F', accent: '#D9922E', select: '#7C3AED', selectCase: '#FFFFFF',
      cycle: '#0FA968', cycleGlow: 'rgba(15,169,104,0.28)', transitCasing: '#FFFFFF', stationFill: '#FFFFFF', viaduct: '#E4DFD6',
      hillshade: { shadow: '#B79C74', highlight: '#FFF8EC', accent: '#C4A47A', exaggeration: 0.35 },
      sky: { 'sky-color': '#7DB9E8', 'horizon-color': '#F3E9D6', 'fog-color': '#F1E6D2', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85 },
      light: { anchor: 'map', color: '#FFF6E8', intensity: 0.35, position: [1.4, 215, 35] },
    },
    dusk: {
      bg: '#E9CBA7', sand: '#E6C39C', landOpacity: 1, waterOpacity: 1,
      landuse: { residential: '#E9CDB0', commercial: '#E6C8AE', industrial: '#DFC3AA', institutional: '#E5C9B0', cemetery: '#D8C9A6', sport: '#C9C79A' },
      green: { park: '#B9C08C', grass: '#C2C493', wood: '#A2AD78', golf: '#AEBB82', farmland: '#D7C99D', wetland: '#BDBFA8' },
      water: '#5E8FB0', waterLine: '#557FA0', waterLabel: '#24496A',
      aeroway: '#E0C3A6', runway: '#C7AA8F',
      road: {
        motorway: ['#FFB45E', '#C9773A'], trunk: ['#FFC77F', '#C98D55'], primary: ['#FFE3C2', '#C59C78'],
        secondary: ['#FCE8D2', '#C8A585'], tertiary: ['#FCE8D2', '#CBAA8B'], minor: ['#F9E6D3', '#CFAE90'], service: ['#F3DFCB', '#D3B79C'],
      },
      roadOpacity: 1, path: '#FFF1E2', rail: '#9C8574',
      bld: ['#F8E0C8', '#EDCBB4', '#D6B0A6', '#B396A8', '#8C84AE'], bldOpacity: 0.96,
      label: '#4A3428', labelSoft: '#80604E', halo: 'rgba(255,240,225,0.9)',
      communityLabel: '#5E3B2A', communityLine: '#A86E4C', districtLine: '#B98C6E',
      mask: 'rgba(226,194,158,0.78)', boundary: '#B4552E', accent: '#F08A2E', select: '#6D28D9', selectCase: '#FFF4E8',
      cycle: '#119A62', cycleGlow: 'rgba(17,154,98,0.3)', transitCasing: '#FFF4E8', stationFill: '#FFF8F0', viaduct: '#EBD5C2',
      hillshade: { shadow: '#9C6E52', highlight: '#FFE6CC', accent: '#B98A66', exaggeration: 0.4 },
      sky: { 'sky-color': '#5B6BA8', 'horizon-color': '#FFB27A', 'fog-color': '#F2B88C', 'sky-horizon-blend': 0.8, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8 },
      light: { anchor: 'map', color: '#FFD9AE', intensity: 0.32, position: [1.3, 255, 55] },
    },
    night: {
      bg: '#0D1320', sand: '#111827', landOpacity: 1, waterOpacity: 1,
      landuse: { residential: '#121A29', commercial: '#141B2B', industrial: '#131927', institutional: '#141B2B', cemetery: '#111B20', sport: '#10211D' },
      green: { park: '#0F2320', grass: '#10221E', wood: '#0E241C', golf: '#0F2620', farmland: '#121D1E', wetland: '#0E1E25' },
      water: '#071A2B', waterLine: '#0F3352', waterLabel: '#5E8DB5',
      aeroway: '#161D2C', runway: '#232C3E',
      road: {
        motorway: ['#C98535', '#4A2C0C'], trunk: ['#B9792F', '#43290D'], primary: ['#8E6638', '#2E2113'],
        secondary: ['#8C6E4A', '#2A2218'], tertiary: ['#6E5A42', '#221C16'], minor: ['#3A4152', '#1A1F2B'], service: ['#2C3242', '#161B26'],
      },
      roadOpacity: 1, path: '#3A4152', rail: '#3B4458',
      bld: ['#161D2B', '#1E2739', '#283752', '#344C78', '#4E74B0'], bldOpacity: 0.95,
      label: '#D5DEEA', labelSoft: '#8A97AB', halo: 'rgba(10,15,25,0.92)',
      communityLabel: '#E8C88E', communityLine: '#C89B55', districtLine: '#6D6250',
      mask: 'rgba(5,8,14,0.74)', boundary: '#FFB347', accent: '#FFB347', select: '#C4A5FF', selectCase: '#0D1320',
      cycle: '#2BF0A0', cycleGlow: 'rgba(43,240,160,0.4)', transitCasing: '#0D1320', stationFill: '#0D1320', viaduct: '#2C3649',
      hillshade: { shadow: '#000000', highlight: '#2A3550', accent: '#151C2B', exaggeration: 0.5 },
      sky: { 'sky-color': '#03060F', 'horizon-color': '#1B2A4A', 'fog-color': '#0D1526', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.9 },
      light: { anchor: 'map', color: '#9DB6FF', intensity: 0.25, position: [1.5, 180, 60] },
    },
  };
  // Realistic: aerial imagery is the ground (real roads, markings, sand and landscaping), the 3D district stands on
  // it, flat road overlays are off and the remaining basemap buildings take warm concrete-and-glass tones.
  THEMES.satellite = Object.assign({}, THEMES.day, {
    satellite: true, landOpacity: 0, waterOpacity: 0, roadOpacity: 0,
    road: {
      motorway: ['#FFD27F', 'rgba(0,0,0,0.35)'], trunk: ['#FFE3A8', 'rgba(0,0,0,0.3)'], primary: ['#FFFFFF', 'rgba(0,0,0,0.25)'],
      secondary: ['#FFFFFF', 'rgba(0,0,0,0.2)'], tertiary: ['#FFFFFF', 'rgba(0,0,0,0.2)'], minor: ['#F2F2F2', 'rgba(0,0,0,0.15)'], service: ['#E6E6E6', 'rgba(0,0,0,0.1)'],
    },
    bld: ['#EEE6D8', '#E4DED4', '#C8D0D8', '#A3B4C4', '#8197AE'], bldOpacity: 1,
    label: '#FFFFFF', labelSoft: '#F1F1F1', halo: 'rgba(0,0,0,0.78)', waterLabel: '#D8F3FF',
    communityLabel: '#FFFFFF', communityLine: 'rgba(255,230,160,0.7)', districtLine: 'rgba(255,243,196,0.6)',
    mask: 'rgba(20,16,10,0.42)', cycle: 'rgba(60,200,140,0.6)', cycleGlow: 'rgba(0,0,0,0)', boundary: '#FFD166', accent: '#FFD166', select: '#E9D5FF', selectCase: '#2E1065', transitCasing: '#FFFFFF',
    hillshade: { shadow: '#000000', highlight: '#FFFFFF', accent: '#000000', exaggeration: 0 },
  });

  const group = (g) => ({ 'dt:group': g });
  const vis = (on) => ({ visibility: on ? 'visible' : 'none' });
  const z = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];

  // Road hierarchy: [zoom, width px, ...]; links (ramp=1) draw at 60 %.
  const ROADS = [
    { key: 'service', match: ['service', 'track'], min: 13.5, w: [13, 0.4, 15, 2, 17, 6, 20, 20] },
    { key: 'minor', match: ['minor'], min: 12, w: [12, 0.5, 14, 1.8, 16, 5, 18, 12, 20, 26] },
    { key: 'tertiary', match: ['tertiary'], min: 10, w: [10, 0.5, 13, 1.6, 15, 4.5, 17, 10, 20, 32] },
    { key: 'secondary', match: ['secondary'], min: 9, w: [9, 0.6, 12, 1.6, 14, 3.8, 16, 8, 18, 18, 20, 38] },
    { key: 'primary', match: ['primary'], min: 8, w: [8, 0.7, 12, 2, 14, 4.5, 16, 10, 18, 22, 20, 44] },
    { key: 'trunk', match: ['trunk'], min: 6, w: [6, 0.8, 10, 1.6, 12, 2.8, 14, 5.5, 16, 12, 18, 26, 20, 52] },
    { key: 'motorway', match: ['motorway'], min: 5, w: [5, 0.8, 10, 1.8, 12, 3.2, 14, 6.5, 16, 14, 18, 30, 20, 60] },
  ];
  const casingExtra = (zoom) => (zoom <= 10 ? 0.4 : zoom <= 12 ? 0.8 : zoom <= 14 ? 1.4 : zoom <= 16 ? 2.2 : 3);

  function roadWidth(stops, casing) {
    const out = ['interpolate', ['exponential', 1.5], ['zoom']];
    for (let i = 0; i < stops.length; i += 2) {
      const w = stops[i + 1];
      const extra = casing ? casingExtra(stops[i]) : 0;
      out.push(stops[i], ['case', ['==', ['get', 'ramp'], 1], w * 0.6 + extra, w + extra]);
    }
    return out;
  }

  function roadLayers(T, on) {
    const layers = [];
    const brunnels = [
      { key: 'tunnel', filter: ['==', ['get', 'brunnel'], 'tunnel'] },
      { key: 'ground', filter: ['!', ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], true, false]] },
      { key: 'bridge', filter: ['==', ['get', 'brunnel'], 'bridge'] },
    ];
    for (const b of brunnels) {
      const tunnel = b.key === 'tunnel';
      if (b.key === 'ground') {
        layers.push({
          id: 'road-path', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 14, metadata: group('roads'),
          filter: ['all', b.filter, ['match', ['get', 'class'], ['path', 'pedestrian'], true, false]],
          layout: Object.assign({ 'line-join': 'round' }, vis(on.roads)),
          paint: { 'line-color': T.path, 'line-opacity': T.roadOpacity * 0.9, 'line-dasharray': [2, 1.2], 'line-width': z(14, 0.8, 17, 2, 20, 5) },
        });
        layers.push({
          id: 'road-rail', type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: 11, metadata: group('roads'),
          filter: ['all', b.filter, ['match', ['get', 'class'], ['rail', 'transit'], true, false]],
          layout: vis(on.roads),
          paint: { 'line-color': T.rail, 'line-opacity': T.roadOpacity, 'line-width': z(11, 0.5, 16, 1.5, 20, 3) },
        });
      }
      for (const r of ROADS) {
        layers.push({
          id: `road-${b.key}-${r.key}-case`, type: 'line', source: OMT, 'source-layer': 'transportation',
          minzoom: Math.max(r.min, r.key === 'minor' || r.key === 'service' ? 13 : 10.5), metadata: group('roads'),
          filter: ['all', b.filter, ['match', ['get', 'class'], r.match, true, false]],
          layout: Object.assign({ 'line-cap': tunnel ? 'butt' : 'round', 'line-join': 'round' }, vis(on.roads)),
          paint: Object.assign(
            { 'line-color': T.road[r.key][1], 'line-width': roadWidth(r.w, true), 'line-opacity': T.roadOpacity * (tunnel ? 0.5 : 1) },
            tunnel ? { 'line-dasharray': [0.6, 0.4] } : {},
          ),
        });
      }
      for (const r of ROADS) {
        layers.push({
          id: `road-${b.key}-${r.key}`, type: 'line', source: OMT, 'source-layer': 'transportation', minzoom: r.min, metadata: group('roads'),
          filter: ['all', b.filter, ['match', ['get', 'class'], r.match, true, false]],
          layout: Object.assign({ 'line-cap': tunnel ? 'butt' : 'round', 'line-join': 'round' }, vis(on.roads)),
          paint: { 'line-color': T.road[r.key][0], 'line-width': roadWidth(r.w, false), 'line-opacity': T.roadOpacity * (tunnel ? 0.45 : 1) },
        });
      }
    }
    layers.push({
      // spaced and capped so overzoomed z14 tiles stay under MapLibre's per-bucket icon limit
      id: 'road-oneway', type: 'symbol', source: OMT, 'source-layer': 'transportation', minzoom: 16, maxzoom: 18.6, metadata: group('roads'),
      filter: ['all', ['==', ['get', 'oneway'], 1], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false]],
      layout: Object.assign({ 'icon-image': 'oneway', 'symbol-placement': 'line', 'symbol-spacing': 240, 'icon-size': z(16, 0.5, 19, 0.9), 'icon-rotation-alignment': 'map' }, vis(on.roads)),
      paint: { 'icon-opacity': 0.45 },
    });
    return layers;
  }

  function buildStyle(themeName, on, D) {
    const T = THEMES[themeName] || THEMES.day;
    const C = D.communities;
    const layers = [
      { id: 'background', type: 'background', paint: { 'background-color': T.bg } },
      {
        id: 'satellite', type: 'raster', source: 'satellite', layout: vis(!!T.satellite),
        paint: { 'raster-fade-duration': 200, 'raster-saturation': 0.06, 'raster-contrast': 0.06, 'raster-brightness-min': 0.04 },
      },
      {
        id: 'landcover', type: 'fill', source: OMT, 'source-layer': 'landcover', metadata: group('base'),
        paint: {
          'fill-color': ['match', ['get', 'class'],
            'sand', T.sand, 'wood', T.green.wood, 'farmland', T.green.farmland, 'wetland', T.green.wetland, 'rock', T.sand,
            ['match', ['get', 'subclass'], 'golf_course', T.green.golf, T.green.grass]],
          'fill-opacity': T.landOpacity,
        },
      },
      {
        id: 'landuse', type: 'fill', source: OMT, 'source-layer': 'landuse', metadata: group('base'),
        filter: ['!', ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false]],
        paint: {
          'fill-color': ['match', ['get', 'class'],
            'residential', T.landuse.residential,
            ['commercial', 'retail'], T.landuse.commercial,
            ['industrial', 'garages', 'railway', 'quarry', 'dam', 'military'], T.landuse.industrial,
            ['school', 'university', 'college', 'kindergarten', 'hospital', 'library', 'bus_station'], T.landuse.institutional,
            'cemetery', T.landuse.cemetery,
            ['stadium', 'pitch', 'track', 'playground', 'theme_park', 'zoo'], T.landuse.sport,
            T.landuse.residential],
          'fill-opacity': T.landOpacity * 0.9,
        },
      },
      {
        id: 'park', type: 'fill', source: OMT, 'source-layer': 'park', metadata: group('base'),
        paint: { 'fill-color': T.green.park, 'fill-opacity': T.landOpacity * 0.85 },
      },
      {
        id: 'hillshade', type: 'hillshade', source: 'dem-hs', maxzoom: 14, metadata: group('hillshade'),
        layout: vis(on.hillshade && !T.satellite),
        paint: {
          'hillshade-shadow-color': T.hillshade.shadow, 'hillshade-highlight-color': T.hillshade.highlight,
          'hillshade-accent-color': T.hillshade.accent, 'hillshade-exaggeration': T.hillshade.exaggeration,
        },
      },
      {
        id: 'water', type: 'fill', source: OMT, 'source-layer': 'water', metadata: group('base'),
        filter: ['!=', ['get', 'intermittent'], 1],
        paint: { 'fill-color': T.water, 'fill-opacity': T.waterOpacity, 'fill-outline-color': T.waterLine },
      },
      {
        id: 'waterway', type: 'line', source: OMT, 'source-layer': 'waterway', minzoom: 10, metadata: group('base'),
        paint: { 'line-color': T.water, 'line-opacity': T.waterOpacity, 'line-width': z(10, 0.6, 16, 3, 20, 8) },
      },
      {
        id: 'aeroway-area', type: 'fill', source: OMT, 'source-layer': 'aeroway', minzoom: 10, metadata: group('base'),
        filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
        paint: { 'fill-color': ['match', ['get', 'class'], ['runway', 'taxiway'], T.runway, T.aeroway], 'fill-opacity': T.landOpacity },
      },
      {
        id: 'aeroway-line', type: 'line', source: OMT, 'source-layer': 'aeroway', minzoom: 10, metadata: group('base'),
        filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], ['runway', 'taxiway'], true, false]],
        paint: {
          'line-color': T.runway, 'line-opacity': T.satellite ? 0 : 1,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, ['match', ['get', 'class'], 'runway', 2, 0.5], 14, ['match', ['get', 'class'], 'runway', 30, 6], 18, ['match', ['get', 'class'], 'runway', 300, 60]],
        },
      },
      ...roadLayers(T, on),
      // Everything outside the emirate is faded so Dubai reads as the subject.
      { id: 'outside-mask', type: 'fill', source: 'mask', metadata: group('mask'), layout: vis(on.mask), paint: { 'fill-color': T.mask } },
      {
        id: 'cycle-glow', type: 'line', source: 'cycle', metadata: group('cycle'), layout: Object.assign({ 'line-join': 'round', 'line-cap': 'round' }, vis(on.cycle)),
        paint: { 'line-color': T.cycleGlow, 'line-width': z(9, 2, 13, 5, 17, 14), 'line-blur': z(9, 1, 17, 6) },
      },
      {
        id: 'cycle-line', type: 'line', source: 'cycle', metadata: group('cycle'), layout: Object.assign({ 'line-join': 'round', 'line-cap': 'round' }, vis(on.cycle)),
        paint: { 'line-color': T.cycle, 'line-width': z(9, 0.8, 13, 1.8, 17, 4.5, 20, 9) },
      },
      {
        id: 'comm-fill', type: 'fill', source: 'communities', minzoom: 8, metadata: group('communities'), layout: vis(on.communities),
        paint: { 'fill-color': T.accent, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.13, 0] },
      },
      {
        id: 'dist-fill', type: 'fill', source: 'districts', minzoom: 11, metadata: group('districts'), layout: vis(on.districts),
        paint: { 'fill-color': T.accent, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.1, 0] },
      },
      {
        id: 'dist-line', type: 'line', source: 'districts', minzoom: 11.5, metadata: group('districts'), layout: Object.assign({ 'line-join': 'round' }, vis(on.districts)),
        filter: ['!=', ['get', 'kind'], 'island'],
        paint: { 'line-color': T.districtLine, 'line-width': z(11.5, 0.6, 16, 1.4), 'line-dasharray': [1, 2], 'line-opacity': z(11.5, 0, 12.5, 0.75) },
      },
      {
        id: 'comm-line', type: 'line', source: 'communities', minzoom: 8, metadata: group('communities'), layout: Object.assign({ 'line-join': 'round' }, vis(on.communities)),
        paint: {
          'line-color': T.communityLine, 'line-dasharray': [3, 2],
          'line-width': z(8, 0.4, 12, 1, 15, 1.6, 18, 2.4),
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.8],
        },
      },
      {
        id: 'emirate-glow', type: 'line', source: 'emirate', metadata: group('boundary'), layout: Object.assign({ 'line-join': 'round' }, vis(on.boundary)),
        paint: { 'line-color': T.boundary, 'line-width': z(7, 4, 12, 10), 'line-blur': z(7, 3, 12, 8), 'line-opacity': 0.35 },
      },
      {
        id: 'emirate-line', type: 'line', source: 'emirate', metadata: group('boundary'), layout: Object.assign({ 'line-join': 'round' }, vis(on.boundary)),
        paint: { 'line-color': T.boundary, 'line-width': z(7, 1.2, 12, 2.4) },
      },
      { id: 'sel-fill', type: 'fill', source: 'selection', paint: { 'fill-color': T.select, 'fill-opacity': 0.1 } },
      { id: 'sel-glow', type: 'line', source: 'selection', paint: { 'line-color': T.select, 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.35 } },
      { id: 'sel-case', type: 'line', source: 'selection', layout: { 'line-join': 'round' }, paint: { 'line-color': T.selectCase, 'line-width': 6 } },
      { id: 'sel-line', type: 'line', source: 'selection', layout: { 'line-join': 'round' }, paint: { 'line-color': T.select, 'line-width': 3.2 } },
      {
        id: 'transit-tunnel', type: 'line', source: 'transit-segments', minzoom: 8, metadata: group('transit'), layout: Object.assign({ 'line-join': 'round' }, vis(on.transit)),
        filter: ['==', ['get', 'level'], 'tunnel'],
        paint: { 'line-color': ['get', 'colour'], 'line-width': z(8, 1.2, 12, 2.4, 16, 5, 19, 9), 'line-dasharray': [1.4, 1.2], 'line-opacity': 0.6 },
      },
      {
        id: 'transit-casing', type: 'line', source: 'transit-segments', minzoom: 8, metadata: group('transit'), layout: Object.assign({ 'line-join': 'round', 'line-cap': 'round' }, vis(on.transit)),
        filter: ['all', ['!=', ['get', 'mode'], 'train'], ['!=', ['get', 'level'], 'tunnel']],
        // elevated track is drawn by the 3D viaduct once it appears, so its flat line fades out
        paint: {
          'line-color': T.transitCasing, 'line-width': z(8, 2.5, 12, 5, 16, 10, 19, 18),
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 13.2, 0.9, 14.2, ['case', ['==', ['get', 'level'], 'elevated'], 0, 0.9]],
        },
      },
      {
        id: 'transit-line', type: 'line', source: 'transit-segments', minzoom: 8, metadata: group('transit'), layout: Object.assign({ 'line-join': 'round', 'line-cap': 'round' }, vis(on.transit)),
        filter: ['all', ['!=', ['get', 'mode'], 'train'], ['!=', ['get', 'level'], 'tunnel']],
        paint: {
          'line-color': ['get', 'colour'], 'line-width': z(8, 1.4, 12, 3, 16, 6, 19, 11),
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 13.2, 1, 14.2, ['case', ['==', ['get', 'level'], 'elevated'], 0.2, 1]],
        },
      },
      {
        id: 'rail-etihad', type: 'line', source: 'transit-segments', minzoom: 8, metadata: group('transit'), layout: Object.assign({ 'line-join': 'round' }, vis(on.transit)),
        filter: ['all', ['==', ['get', 'mode'], 'train'], ['!=', ['get', 'level'], 'tunnel']],
        paint: { 'line-color': ['get', 'colour'], 'line-width': z(8, 1.2, 14, 3, 18, 6), 'line-dasharray': [3, 1.5], 'line-opacity': 0.85 },
      },
      {
        id: 'transit-viaduct', type: 'fill-extrusion', source: 'transit-viaduct', minzoom: 13, metadata: group('transit'), layout: vis(on.transit),
        paint: {
          'fill-extrusion-color': ['match', ['get', 'part'], 'rail', ['get', 'colour'], T.viaduct],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.8, ['get', 'base']],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.8, ['get', 'top']],
          'fill-extrusion-opacity': 1,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        id: 'buildings-3d', type: 'fill-extrusion', source: OMT, 'source-layer': 'building', minzoom: 13, metadata: group('buildings'),
        filter: ['!=', ['get', 'hide_3d'], true], layout: vis(on.buildings),
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
            0, T.bld[0], 18, T.bld[1], 60, T.bld[2], 150, T.bld[3], 320, T.bld[4]],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.8, ['coalesce', ['get', 'render_height'], 6]],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.8, ['coalesce', ['get', 'render_min_height'], 0]],
          'fill-extrusion-opacity': T.bldOpacity,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        id: 'buildings-sel', type: 'fill-extrusion', source: OMT, 'source-layer': 'building', minzoom: 13,
        filter: ['==', ['id'], -1],
        paint: {
          'fill-extrusion-color': T.accent,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.95,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        id: 'water-names', type: 'symbol', source: OMT, 'source-layer': 'water_name', minzoom: 9, metadata: group('labels'),
        filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
        layout: { 'text-field': NAME, 'text-font': FONT.italic, 'text-size': z(9, 11, 14, 14), 'text-letter-spacing': 0.15, 'text-max-width': 7 },
        paint: { 'text-color': T.waterLabel, 'text-halo-color': T.halo, 'text-halo-width': 1 },
      },
      {
        id: 'water-names-line', type: 'symbol', source: OMT, 'source-layer': 'water_name', minzoom: 11, metadata: group('labels'),
        filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        layout: { 'text-field': NAME, 'text-font': FONT.italic, 'text-size': z(11, 11, 16, 14), 'text-letter-spacing': 0.15, 'symbol-placement': 'line' },
        paint: { 'text-color': T.waterLabel, 'text-halo-color': T.halo, 'text-halo-width': 1 },
      },
      {
        id: 'poi', type: 'symbol', source: OMT, 'source-layer': 'poi', minzoom: 16, metadata: group('pois'),
        filter: ['all', ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], ['<=', ['get', 'rank'], 14]],
        layout: Object.assign({
          'icon-image': ['match', ['get', 'subclass'], ['florist', 'furniture'], ['get', 'subclass'], ['get', 'class']], 'icon-size': 0.85,
          'text-field': NAME, 'text-font': FONT.regular, 'text-size': 10.5, 'text-max-width': 8, 'text-offset': [0, 0.9], 'text-anchor': 'top',
          'symbol-sort-key': ['get', 'rank'],
        }, vis(on.pois)),
        paint: { 'text-color': T.labelSoft, 'text-halo-color': T.halo, 'text-halo-width': 1, 'icon-opacity': 0.8 },
      },
      {
        id: 'road-names-minor', type: 'symbol', source: OMT, 'source-layer': 'transportation_name', minzoom: 15.5, metadata: group('roadLabels'),
        filter: ['match', ['get', 'class'], ['minor', 'service'], true, false],
        layout: Object.assign({ 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT.regular, 'text-size': z(15.5, 10, 18, 12.5) }, vis(on.roadLabels)),
        paint: { 'text-color': T.labelSoft, 'text-halo-color': T.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'road-names-major', type: 'symbol', source: OMT, 'source-layer': 'transportation_name', minzoom: 12.5, metadata: group('roadLabels'),
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false],
        layout: Object.assign({ 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT.bold, 'text-size': z(12.5, 10, 16, 12.5, 19, 15), 'text-letter-spacing': 0.03 }, vis(on.roadLabels)),
        paint: { 'text-color': T.label, 'text-halo-color': T.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'road-shields', type: 'symbol', source: OMT, 'source-layer': 'transportation_name', minzoom: 9, metadata: group('roadLabels'),
        filter: ['all', ['has', 'ref'], ['<=', ['get', 'ref_length'], 7], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false]],
        layout: Object.assign({
          'symbol-placement': ['step', ['zoom'], 'point', 11, 'line'], 'symbol-spacing': 420,
          'icon-image': ['case', ['in', 'E', ['get', 'ref']], 'shield-e', ['in', 'D', ['get', 'ref']], 'shield-d', 'shield-x'],
          'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 5, 2, 5],
          'icon-rotation-alignment': 'viewport', 'text-rotation-alignment': 'viewport',
          'text-field': ['get', 'ref'], 'text-font': FONT.bold, 'text-size': 10.5,
        }, vis(on.roadLabels)),
        paint: { 'text-color': '#FFFFFF' },
      },
      {
        id: 'telecom', type: 'symbol', source: 'telecom', minzoom: 10.5, metadata: group('telecom'),
        layout: Object.assign({
          'icon-image': 'ico-telecom', 'icon-size': z(10.5, 0.55, 15, 0.85), 'icon-allow-overlap': true,
          'text-field': ['step', ['zoom'], '', 15, ['coalesce', ['get', 'operator'], ['get', 'name'], 'Telecom mast']],
          'text-font': FONT.regular, 'text-size': 10, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true,
        }, vis(on.telecom)),
        paint: { 'text-color': T.labelSoft, 'text-halo-color': T.halo, 'text-halo-width': 1 },
      },
      {
        id: 'station-circle', type: 'circle', source: 'transit-stations', minzoom: 10, metadata: group('transit'), layout: vis(on.transit),
        paint: {
          'circle-radius': z(10, ['case', ['==', ['get', 'interchange'], 1], 3.5, 2.4], 14, ['case', ['==', ['get', 'interchange'], 1], 7, 5], 17, ['case', ['==', ['get', 'interchange'], 1], 10, 7.5]),
          'circle-color': T.stationFill, 'circle-stroke-color': ['get', 'colour'], 'circle-stroke-width': z(10, 1.2, 14, 2.5, 17, 3.5),
          'circle-opacity': ['case', ['in', 'under construction', ['to-string', ['get', 'lines']]], 0.6, 1],
          'circle-stroke-opacity': ['case', ['in', 'under construction', ['to-string', ['get', 'lines']]], 0.6, 1],
          'circle-pitch-alignment': 'map',
        },
      },
      {
        id: 'station-label', type: 'symbol', source: 'transit-stations', minzoom: 12.5, metadata: group('transit'),
        layout: Object.assign({
          // metro stations label from 12.5; tram, monorail and APM stops only once zoomed in
          'text-field': ['step', ['zoom'], ['match', ['get', 'kind'], 'metro', ['get', 'name'], ''], 15.5, ['get', 'name']],
          'text-font': FONT.bold, 'text-size': z(12.5, 10, 16, 12.5), 'text-max-width': 8,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.9, 'text-justify': 'auto',
        }, vis(on.transit)),
        paint: { 'text-color': T.label, 'text-halo-color': T.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'dist-labels', type: 'symbol', source: 'community-labels', minzoom: 12, metadata: group('districts'),
        filter: ['match', ['get', 'kind'], ['district', 'neighbourhood', 'island'], true, false],
        layout: Object.assign({
          'text-field': ['get', 'name'], 'text-font': ['match', ['get', 'kind'], 'island', ['literal', FONT.italic], ['literal', FONT.regular]],
          'text-size': z(12, 10, 16, 12.5), 'text-max-width': 8, 'text-letter-spacing': 0.04, 'text-padding': 6,
          'symbol-sort-key': ['-', 0, ['get', 'area_km2']],
        }, vis(on.districts)),
        paint: { 'text-color': T.labelSoft, 'text-halo-color': T.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'comm-labels', type: 'symbol', source: 'community-labels', minzoom: 9.5, metadata: group('communities'),
        filter: ['match', ['get', 'kind'], ['community', 'master', 'sector'], true, false],
        layout: Object.assign({
          'text-field': ['get', 'name'], 'text-font': FONT.bold, 'text-transform': 'uppercase', 'text-letter-spacing': 0.12,
          'text-size': z(9.5, 9, 12, 10.5, 15, 13, 18, 16), 'text-max-width': 8, 'text-padding': 8,
          'symbol-sort-key': ['-', 0, ['get', 'area_km2']],
        }, vis(on.communities)),
        paint: { 'text-color': T.communityLabel, 'text-halo-color': T.halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'place-city', type: 'symbol', source: OMT, 'source-layer': 'place', maxzoom: 11.5, metadata: group('labels'),
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        layout: { 'text-field': NAME, 'text-font': FONT.bold, 'text-size': z(7, 12, 11, 17), 'text-transform': 'uppercase', 'text-letter-spacing': 0.2 },
        paint: { 'text-color': T.label, 'text-halo-color': T.halo, 'text-halo-width': 1.6 },
      },
      {
        id: 'landmarks-minor', type: 'symbol', source: 'landmarks', minzoom: 12.5, metadata: group('landmarks'),
        filter: ['!', ['match', ['get', 'cat'], ['Icon', 'Transport'], true, false]],
        layout: Object.assign({
          'icon-image': ['concat', 'lm-', ['get', 'cat']], 'icon-size': z(12.5, 0.7, 16, 1), 'icon-allow-overlap': true,
          'text-field': ['get', 'name'], 'text-font': FONT.bold, 'text-size': z(12.5, 10.5, 16, 12.5), 'text-max-width': 9,
          'text-offset': [0, 1.25], 'text-anchor': 'top', 'text-optional': true,
        }, vis(on.landmarks)),
        paint: { 'text-color': T.label, 'text-halo-color': T.halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'landmarks-major', type: 'symbol', source: 'landmarks', minzoom: 9, metadata: group('landmarks'),
        filter: ['match', ['get', 'cat'], ['Icon', 'Transport'], true, false],
        layout: Object.assign({
          'icon-image': ['concat', 'lm-', ['get', 'cat']], 'icon-size': z(9, 0.7, 14, 1), 'icon-allow-overlap': true,
          'text-field': ['get', 'name'], 'text-font': FONT.bold, 'text-size': z(9, 10.5, 14, 13), 'text-max-width': 9,
          'text-offset': [0, 1.25], 'text-anchor': 'top', 'text-optional': true,
        }, vis(on.landmarks)),
        paint: { 'text-color': T.label, 'text-halo-color': T.halo, 'text-halo-width': 1.6 },
      },
    ];

    return {
      version: 8,
      name: `Dubai Digital Twin (${themeName})`,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
      sky: T.sky,
      light: T.light,
      sources: {
        omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a>' },
        satellite: {
          type: 'raster', tileSize: 256, maxzoom: 19,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
        },
        'dem-hs': { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 13, tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], attribution: 'Terrain: Mapzen / AWS Terrain Tiles' },
        'dem-terrain': { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 13, tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'] },
        emirate: { type: 'geojson', data: D.boundary.emirate },
        mask: { type: 'geojson', data: D.boundary.mask },
        communities: { type: 'geojson', data: C.admin },
        districts: { type: 'geojson', data: C.districts },
        'community-labels': { type: 'geojson', data: C.labels },
        cycle: { type: 'geojson', data: D.cycleways, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors' },
        'transit-segments': { type: 'geojson', data: D.transit.segments },
        'transit-viaduct': { type: 'geojson', data: D.transit.viaduct },
        'transit-stations': { type: 'geojson', data: D.transit.stations },
        landmarks: { type: 'geojson', data: D.landmarks },
        telecom: { type: 'geojson', data: D.telecom },
        selection: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers,
    };
  }

  window.DT = window.DT || {};
  window.DT.THEMES = THEMES;
  window.DT.buildStyle = buildStyle;
})();
