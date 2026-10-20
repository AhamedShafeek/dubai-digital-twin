# Dubai Digital Twin

An interactive 3D model of the Emirate of Dubai, from Hatta to Jebel Ali, built entirely from OpenStreetMap data. Every road, building footprint, community boundary, cycle track and rail line is placed at its real WGS84 coordinate.

**Live:** https://ahamedshafeek.github.io/dubai-digital-twin/

## Run it

Open `index.html` in Chrome, Edge, Safari or Firefox. No build step or server is needed, but it does need an internet connection for map tiles and the two libraries.

Or serve it locally:

```bash
npm run serve        # http://localhost:8080
```

## What's in it

| Layer | Source | Notes |
|---|---|---|
| 3D buildings | OpenStreetMap via OpenFreeMap vector tiles | Real heights where mapped (Burj Khalifa's tiers up to 828 m); untagged buildings get a default height. Click any building for its height and community. |
| Road network | OSM via OpenFreeMap | Motorway → service hierarchy, bridges, tunnels, one-way arrows, street names, E- and D-route shields. |
| Communities | OSM admin boundaries (`data/communities.js`) | 162 official community, master-community and rural-sector boundaries, with English and Arabic names and area. |
| Districts, projects, islands | OSM `place=*` areas | 426 named areas (Dubai Marina, JLT, Palm Jumeirah, The World, …). |
| Cycle tracks | OSM `highway=cycleway` | 687 ways, 513 km. |
| Metro, tram, monorail, Etihad Rail | OSM route relations | Red, Green and Blue (under construction) lines, Dubai Tram, Palm Monorail, DXB people movers, Etihad Rail. Elevated track is drawn as a 3D viaduct with pillars; tunnel sections are dashed. |
| Traffic flow | Simulated on the real road graph | Vehicles stream along every lane of 6,180 motorway, trunk and primary road links. |
| Moving trains | Simulated on the real track | Trains run at line speed and headway, on the viaducts, and disappear into tunnels. |
| Landmarks | OSM features (`scripts/build-data.mjs`) | 48 curated landmarks, each positioned from its OSM element. |
| Telecom | OSM `man_made=mast`, communication towers | 270 sites; off by default. |
| Relief and 3D terrain | AWS Terrain Tiles | Dune shading; switch on 3D terrain for the Hajar mountains around Hatta. |
| Satellite | Esri World Imagery | The fourth map mode. |

Everything outside the emirate is faded so Dubai stays the subject.

### Realistic mode (default)

The default **Realistic** mode matches photogrammetry-style maps. Aerial imagery is the ground, so you see real roads, lane markings, sand plots and landscaping. The 3D district stands on it, lit by a warm south-east sun with soft shadows, and the flat road overlays are switched off. Low buildings (up to 45 m) are roofed with the real aerial photo, loaded at runtime into a z18 atlas (~0.5 m/px) over Downtown and a z17 atlas (~1 m/px) over the rest. Towers keep modelled roofs, because aerial photos show tall buildings leaning away from their footprints. Day, Dusk and Night are the stylised alternatives.

### 3D streets

Inside the district every street is built in 3D from OSM centrelines, lane counts and tags (`js/models/downtown/roads.js`):

- **Carriageways:** asphalt with UAE-style markings: a yellow median edge and white kerb edge on divided roads, dashed lane dividers, and centre lines on two-way roads. Markings stop short of junctions.
- **Junctions:** 888 zebra crossings, 246 stop lines and signal masts.
- **Pavements:** raised with kerbs, respecting `sidewalk=*`; also footpaths and red cycle tracks.
- **Bridges:** lifted by their OSM layer, with ramps, deck edges, parapets and 800+ piers.

In Day, Dusk and Night the 3D streets replace the flat road lines. In Realistic mode the photo already shows the real roads, so only the elevated structures and signals are drawn. Simulated traffic rides on the 3D asphalt.

### Detailed 3D Downtown Dubai

Downtown Dubai and everything visible from it are detailed 3D models rather than boxes: about 5,800 buildings in a 4 × 4 km area covering Business Bay, DIFC, Sheikh Zayed Road, City Walk, Za'abeel, Al Wasl and Satwa. Each sits on its real OpenStreetMap footprint, height and floor count (`js/models/downtown/`):

- **Towers:** curtain walls with mullions, slab bands, fins, mechanical floors, lit crowns, roof plant, maintenance cranes and aviation lights; residential towers get balconies with glass balustrades and roof pools.
- **Houses and villas** (~1,800): a lighter level of detail with textured walls, a parapet band and the real roof from the aerial photo.
- **Old Town and Souk Al Bahar:** Arabic-revival stucco, arcades, mashrabiya screens, crenellated parapets, timber beam ends, wind towers and domes.
- **Podiums and car parks:** shopfronts, perforated geometric screens and skylights. Buildings under construction get exposed slabs, cores and tower cranes.
- **Signature buildings, hand-built:** The Dubai Mall (stone elevations, waterfront terraces, portals, skylight vaults, Grand Atrium dome), Dubai Opera (dhow hull with glass prow), Address Downtown, Address Boulevard, and Address Sky View with its sky bridge and pool.
- **Landscape:** animated lake water. The Dubai Fountain's ~500 jets follow its real OSM layout and run a choreographed show every two minutes. Also the Fountain Boardwalk, Souk Al Bahar bridge, the glazed Metro Link, gardens, ~1,000 palms and trees, and ~1,450 street lamps.
- **Night:** lit interiors, crowns, streets, signage and fountain glow.

Click any building for its name, height, floors, footprint and OSM link. Facade textures, balconies and crowns are generated from each building's type, so they are representative rather than surveyed.

### Detailed 3D landmarks

Three icons are replaced with detailed procedural models, rendered with three.js inside the map (`js/models/`). Each one sits on its exact OSM position, casts real-time shadows from a per-theme sun, reflects a matching sky, and lights up at night. Click a model for its architectural facts.

| Model | Built from |
|---|---|
| **Burj Khalifa** | All 29 OSM tower parts (the real spiral setbacks of the Y-plan), smoothed into rounded lobes. Curtain-wall texture at true scale: 1.4 m panels, 3.9 m floors, stainless fins and spandrels. Stainless crowns at every setback, a lathed spire with collars to 829.8 m, and aviation beacons. |
| **Burj Al Arab** | The V-plan fitted to the OSM footprint (spine at the sharp corner, sail on the arc). Elevation profiles measured from a side photograph and scaled to published heights. Blue duplex-glazed wings, 12 scalloped PTFE sail panels, the white arch-truss exoskeleton with lattice braces, mast to 321 m, helipad cone at 210 m and the Al Muntaha cantilever. At night the sail cycles through LED colours. |
| **Museum of the Future** | An asymmetric elliptical torus 77 m tall, whose depth at every point follows the OSM footprint. Brushed stainless skin with Arabic calligraphy windows that glow at night. Green-hill podium shaped to the OSM grass areas, with palms and arched entrances. |

The **Detailed 3D landmarks** layer toggles them; switched off, the plain OSM boxes return.

## Using it

- **Search** (`/`): communities, districts, landmarks, stations and places, in English or Arabic. You can also type coordinates (`25.1972, 55.2744`) to fly to an exact point.
- **Click** a community, building, station, landmark, cycle track or line for details. A community card counts the stations, cycle-track km, masts and sub-areas inside it.
- **Modes:** Realistic, Day, Dusk and Night (keys `1`–`4`).
- **Camera:** `V` toggles 2D/3D, `O` orbits, `T` starts a 15-stop cinematic tour, `N` resets north, `R` returns to the reference view. The destination bar has one-click views.
- **Layers** (`L`): toggle every layer, set simulation speed and traffic density.
- The URL hash holds the exact camera (`#zoom/lat/lon/bearing/pitch`), so any view can be shared as a link.

The default camera reproduces the aro.ae reference view: zoom 14.1, pitch 44.5°, bearing −56.1°, looking north-west over Downtown and Business Bay.

## Accuracy, honestly

- **Coordinates** come straight from OSM, rounded to 6 decimals (about 0.1 m). Overlay geometry is simplified by at most about 1.5 m.
- **Communities:** OSM currently maps 162 admin boundaries. Dubai Municipality defines more communities than that. The official layer is published on Dubai Pulse; swapping it into `data/communities.js` would give the full official set.
- **Building heights** are only as good as OSM tagging. The towers are well mapped; many villas and low-rise buildings use defaults.
- **Traffic and trains are simulated.** They move on the real network at plausible speeds and headways, but Dubai has no open real-time vehicle feed.

## Refreshing the data

```bash
npm install
npm run build:data              # rebuild data/*.js from the cached Overpass responses
npm run build:data -- --refresh # re-download everything from OpenStreetMap
```

`scripts/build-data.mjs` queries the Overpass API for the Dubai emirate area (OSM relation 3766483). It writes compact `data/*.js` files, and caches raw responses in `scripts/.cache/`.

## Project layout

```
index.html              page shell and UI
css/app.css             UI styles (desktop and phone layouts)
js/style.js             map style: 4 themes, all base and overlay layers
js/app.js               interaction: search, info cards, tour, layers, shortcuts
js/sim.js               deck.gl traffic and train simulation (FlowLayer shader)
js/models/              detailed landmark models: kit (geometry + procedural textures), one file per
                        building, layer.js (three.js custom layer: lighting, shadows, picking)
js/models/ortho.js      aerial imagery atlas (Esri tiles stitched at runtime) for photo roofs
js/models/downtown/     Downtown district: textures, fabric (every building), roads (3D streets), landscape
                        (lake, fountain, trees, lamps), and the signature buildings
data/*.js               generated OSM extracts (do not edit by hand)
scripts/build-data.mjs  data pipeline (Overpass → GeoJSON → data/*.js)
```

Libraries: MapLibre GL JS 5.24 and deck.gl 9.3 (unpkg), three.js r170 (jsDelivr). For debugging, `dtMap` and `dtSim` are exposed in the browser console.

## Credits

Map data © OpenStreetMap contributors (ODbL). Tiles: OpenFreeMap / © OpenMapTiles. Imagery © Esri, Maxar, Earthstar Geographics. Terrain: Mapzen / AWS Terrain Tiles.
