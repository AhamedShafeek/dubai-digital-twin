/* Burj Khalifa: massing from the 29 OpenStreetMap tower parts (the real spiral setbacks of the Y-shaped plan),
 * skinned with a procedural curtain wall, stainless setback crowns and a lathed spire to 829.8 m. */
(function () {
  'use strict';

  DT.MODEL_DEFS['burj-khalifa'] = {
    title: 'Burj Khalifa',
    eyebrow: 'Detailed 3D model · Supertall',
    desc: 'Y-shaped tower whose three wings step back in a spiral of setbacks around a buttressed core, finishing in a steel spire. Massing follows the OpenStreetMap tower parts.',
    facts: [
      ['Height', '828 m (tip 829.8 m)'],
      ['Floors', '154 + 9 maintenance levels'],
      ['Top floor', '585.4 m'],
      ['Observation decks', '452 m (L124–125) · 555.7 m (L148)'],
      ['Setbacks', '27, spiralling up the three wings'],
      ['Cladding', '26,000+ reflective glass panels, stainless spandrels and vertical fins'],
      ['Architect', 'Adrian Smith, SOM'],
      ['Opened', '4 January 2010'],
    ],
    district: 'downtown',
    replaces: (data) => [...data.parts.map((p) => `w${p.id}`), 'w446646206'],
    shadow: { mapSize: 4096 },
    ground: 3600,

    build(K, T, data, ctx) {
      const group = new T.Group();
      const TILE_U = 22.4, TILE_V = 31.2; // 16 panels x 1.4 m, 8 floors x 3.9 m
      const tex = K.bkFacade(ctx.aniso);
      const facade = new T.MeshStandardMaterial({
        color: 0xffffff, map: tex.map, bumpMap: tex.bump, bumpScale: 2.5,
        roughnessMap: tex.rm, metalnessMap: tex.rm, roughness: 1, metalness: 1,
        emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.25,
      });
      const roof = new T.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.82, metalness: 0.05 });
      const crown = new T.MeshStandardMaterial({ color: 0xe7ebef, roughness: 0.28, metalness: 0.92, emissive: 0xf2f6ff, emissiveIntensity: 0 });
      const steel = new T.MeshStandardMaterial({ color: 0xe9edf1, roughness: 0.22, metalness: 0.95, emissive: 0xdfe8ff, emissiveIntensity: 0 });

      const walls = [], caps = [], crowns = [];
      const SPIRE_FROM = 712; // OSM parts above this are the slender pinnacle, rebuilt as a lathe below
      for (const part of data.parts) {
        if (part.h > SPIRE_FROM) continue;
        const ring = K.smoothRing(part.ring, 2, 55);
        const p = K.prism(ring, part.min || 0, part.h, { uScale: TILE_U, vScale: TILE_V, smoothDeg: 34 });
        walls.push(p.walls); caps.push(p.cap);
        // stainless crown band that wraps each setback (lit white at night, like the real tower)
        crowns.push(K.prism(K.scaleRing(ring, 1.014), part.h - 1.6, part.h + 0.9, { cap: false, uScale: 4, vScale: 4 }).walls);
      }
      const wallMesh = new T.Mesh(K.merge(walls), facade);
      const capMesh = new T.Mesh(K.merge(caps), roof);
      const crownMesh = new T.Mesh(K.merge(crowns), crown);
      group.add(wallMesh, capMesh, crownMesh);

      // Spire: stepped shaft with collars and a needle tip at 829.8 m.
      const spirePts = [[4.6, 708], [4.6, 714], [3.7, 716.5], [3.6, 720], [3.05, 722.5], [2.95, 739], [2.55, 741.5], [2.45, 758], [1.95, 760.5],
        [1.7, 772], [1.38, 790], [1.05, 806], [0.72, 818], [0.42, 825.5], [0.18, 828.8], [0, 829.8]].map(([r, y]) => new T.Vector2(r, y));
      const collars = [716.5, 722.5, 741.5, 760.5, 781, 800].map((y) => {
        const r = spirePts.reduce((best, p) => (Math.abs(p.y - y) < Math.abs(best.y - y) ? p : best)).x;
        const g = new T.TorusGeometry(r + 0.18, 0.22, 8, 36);
        g.rotateX(Math.PI / 2); g.translate(0, y, 0);
        return g;
      });
      const spire = new T.Mesh(K.merge([new T.LatheGeometry(spirePts, 32), ...collars]), steel);
      group.add(spire);

      // Aviation warning lights: red at the tip and spire collars, white strobes on the upper setbacks.
      const red = new T.MeshBasicMaterial({ color: 0xff2a1f, transparent: true, opacity: 0, depthWrite: false });
      const white = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const beacons = new T.Group();
      [[0, 830.3, 0, 1.6], [3.2, 760.5, 0, 1.2], [-3.2, 760.5, 0, 1.2], [0, 741.5, 3.4, 1.2], [0, 741.5, -3.4, 1.2]].forEach(([x, y, z, s]) => {
        const m = new T.Mesh(new T.SphereGeometry(s, 12, 8), red); m.position.set(x, y, z); m.userData.noShadow = true; beacons.add(m);
      });
      data.parts.filter((p) => p.h >= 405 && p.h <= SPIRE_FROM).forEach((p, i) => {
        const c = p.ring[Math.floor(p.ring.length / 2)];
        const m = new T.Mesh(new T.SphereGeometry(1.1, 10, 6), i % 2 ? white : red); m.position.set(c[0], p.h + 1.6, c[1]); m.userData.noShadow = true; beacons.add(m);
      });
      group.add(beacons);

      return {
        group,
        pickables: [wallMesh, capMesh, spire],
        setTheme(theme) {
          const night = theme === 'night', dusk = theme === 'dusk';
          facade.emissiveIntensity = night ? 1.1 : dusk ? 0.12 : 0;
          facade.envMapIntensity = night ? 0.9 : 1.25;
          crown.emissiveIntensity = night ? 1.6 : dusk ? 0.2 : 0;
          steel.emissiveIntensity = night ? 0.7 : 0;
        },
        animate(t, theme) {
          const on = theme === 'night' || theme === 'dusk';
          red.opacity = on ? (Math.sin(t * Math.PI * 1.2) > 0.2 ? 1 : 0.15) : 0;
          white.opacity = on ? (t % 1.5 < 0.08 ? 1 : 0) : 0;
          return on;
        },
      };
    },
  };
})();
