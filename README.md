# East Point Campus 3D

Interactive 3D virtual tour of the East Point campus (Engineering, Higher Education, Pharmacy, Nursing, Pre-University, Medical, hostels, sports ground), built with **Three.js + Vite**. The layout is traced from a Google Maps satellite screenshot.

## Features
- Orbit / zoom / pan (touch works on mobile)
- Click a building (or pick it from the list) to fly the camera to it and open an info panel
- Zoomed out you see college labels, zoomed in you see block labels
- Search box, hover highlight, clickable minimap
- Opens at the **main gate**. **Tour** drives from the gate along the road and stops at the first road diversion. **Map** shows the whole campus from above, **Gate** returns to the start view
- Day / Night mode (lit windows, street lights, stars, moon), labels toggle, fullscreen
- Solar-panel roofs, quadrangle courtyard block, sports ground, basketball court, forest, moving cars
- Keyboard: `←` / `→` previous / next building, `H` back to the gate, `M` map overview, `Esc` close panel

## Run it
```bash
npm install
npm run dev
```

## Build for deployment
```bash
npm run build
```
Upload the `dist/` folder to Netlify, Vercel, GitHub Pages, etc.

## Edit the campus: `src/data.js`
Everything is data-driven, in **screenshot pixels** (north = up, east = right). Open the satellite screenshot next to `data.js` and nudge numbers until it matches.

```js
{ id: 'eng1', group: 'eng', kind: 'block',
  name: 'Engineering Block 1', short: 'Engg Block 1',
  rects: [[375, 722, 422, 792]],   // [x1, y1, x2, y2] corners in pixels
  floors: 4, solar: true, color: 0xc9d6ee,
  desc: 'Text shown in the info panel',
  labs: ['Database Lab'], facilities: ['Seminar Hall'] }
```

| Field | Meaning |
|---|---|
| `kind` | `block`, `courtyard` (add `inner: [...]` for the lawn), `shed`, `ground`, `court`, `tank` |
| `rects` | Footprint corners in screenshot pixels (sheds can have several) |
| `floors` | Number of floors (height = floors × 3.4 m) |
| `solar` | `true` gives a solar-panel roof |
| `labs`, `facilities` | Chips in the info panel (hidden when empty) |
| `group` | Which college it belongs to (see `GROUPS`) |

Roads (`ROADS`), terrain colour patches (`ZONES`) and tree areas (`TREE_ZONES`) are in the same file. `S` (metres per pixel) sets the overall scale.

Names marked "(guess)" and all floor counts are estimates, so rename them to the real ones.

## Structure
```
index.html        page + UI markup
src/main.js       3D scene, interaction, UI logic
src/data.js       campus layout (edit this)
src/style.css     styling
```
