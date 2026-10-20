/* Aerial imagery atlas for the district: Esri World Imagery tiles stitched at runtime into one canvas texture,
 * used to texture roofs and plazas with the real thing. Only low buildings use it: aerial photos show tall
 * towers leaning (relief displacement), so a tower's roof in the photo is metres away from its footprint.
 * Local frame as everywhere else: metres, x east, z south, origin = district origin. */
(function () {
  'use strict';

  const URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const EARTH_CIRC = 2 * Math.PI * 6371008.8;
  const mercX = (lon) => (180 + lon) / 360;
  const mercY = (lat) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

  /* origin [lon, lat]; centre [x, z] local metres of the area to cover; zoom; size in px (multiple of 256). */
  DT.orthoAtlas = function (T, { origin, centre = [0, 0], zoom = 18, size = 4096, onProgress = null }) {
    const k = EARTH_CIRC * Math.cos((origin[1] * Math.PI) / 180);
    const n = size / 256, scale = 2 ** zoom;
    const cx = (mercX(origin[0]) + centre[0] / k) * scale, cy = (mercY(origin[1]) + centre[1] / k) * scale;
    const tx0 = Math.floor(cx - n / 2), ty0 = Math.floor(cy - n / 2);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c9c4b8'; ctx.fillRect(0, 0, size, size);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = T.LinearMipmapLinearFilter;

    // local metres -> atlas uv (texture is flipY, so v counts up from the bottom row)
    const uv = (x, z) => {
      const tx = (mercX(origin[0]) + x / k) * scale, ty = (mercY(origin[1]) + z / k) * scale;
      return [(tx - tx0) / n, 1 - (ty - ty0) / n];
    };
    const covers = (x, z, margin = 0.002) => { const [u, v] = uv(x, z); return u > margin && u < 1 - margin && v > margin && v < 1 - margin; };
    const metresPerPixel = k / scale / 256;

    let loaded = 0, failed = 0, pending = 0;
    const queue = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) queue.push([i, j]);
    // nearest the centre first, so the middle sharpens before the edges
    queue.sort((a, b) => Math.hypot(a[0] - n / 2, a[1] - n / 2) - Math.hypot(b[0] - n / 2, b[1] - n / 2));
    const ready = new Promise((resolve) => {
      let dirtyTimer = null;
      const flush = () => { texture.needsUpdate = true; dirtyTimer = null; if (onProgress) onProgress(loaded / (n * n)); };
      const next = () => {
        if (!queue.length) { if (!pending) { flush(); resolve({ loaded, failed }); } return; }
        const [i, j] = queue.shift();
        pending++;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(img, i * 256, j * 256);
          loaded++; pending--;
          if (!dirtyTimer) dirtyTimer = setTimeout(flush, 400);
          next();
        };
        img.onerror = () => { failed++; pending--; next(); };
        img.src = URL(zoom, tx0 + i, ty0 + j);
      };
      for (let c = 0; c < 10; c++) next();
    });
    return { texture, uv, covers, metresPerPixel, ready, zoom, tiles: n * n };
  };

  // Rewrite a geometry's uv attribute so it samples the atlas at each vertex's x/z (plus an offset).
  DT.orthoUV = function (T, geom, atlas, ox = 0, oz = 0) {
    const pos = geom.getAttribute('position'), uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const [u, v] = atlas.uv(pos.getX(i) + ox, pos.getZ(i) + oz);
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
    geom.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return geom;
  };
})();
