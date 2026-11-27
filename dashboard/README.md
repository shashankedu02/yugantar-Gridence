# Gridence dashboard

Plain static HTML, CSS and JavaScript. No build step, no CDN, no third-party code, no network access beyond our own server. It talks to `serve.py` (see [`docs/DASHBOARD_API.md`](../docs/DASHBOARD_API.md)) and is served separately:

```bash
python serve.py --port 8000                       # terminal 1
python -m http.server 5500 -d dashboard           # terminal 2, then open http://localhost:5500
```

## Modules
`js/app.js` (wiring) · `api.js` (client, one request at a time) · `validate.js` (response checks) · `state.js` (store; one snapshot per run) · `scenario.js` (official and custom shocks) · `analysis.js` (energy by distance, impact proxies) · `cases.js` (demo inputs) · `config.js` (grid, channels, shock boxes) · `render.js`, `contour.js` (map) · `scale.js` (colour ranges) · `geo.js` (reference coastline) · `copy.js` (plain-language text, model names and dates) · `ui/` (legend, charts, banner, impact cards, status; `ui/colormap.js` colours both map and legend; `ui/chartkit.js` holds chart helpers).

`index.html` uses one stylesheet, `css/console.css`. `cases/` holds the demo input states. `vendor/` holds the reference coastline and its licence note.

## Display rules
- **Only colouring is chosen in the browser; values are never changed.** One data cell is one flat block. *Smooth the colours* interpolates values for display only and is labelled on the map.
- The canvas has one pixel per screen pixel (CSS size × device pixel ratio). Projection: equirectangular, cell edges 65–101°E and 6–38°N, used by cells, coastline, labels and pointer mapping alike.
- A colour range is the same for every day of a run and for baseline and scenario. Difference ranges are symmetric with a minimum span, so noise is not magnified. The legend states the basis and the share of values beyond its ends.
- Legend labels are placed at their exact position on the bar.
- Before a forecast the map shows the real input day or the shock preview, always labelled **not a forecast**. No impact number appears without a forecast.
- No marker is painted over cells: shocks are outlines.
- A button or list used with the mouse releases focus, so keyboard shortcuts keep working; keyboard users keep their focus.
- Text from the server or a file is never parsed as HTML. A model ID other than the two shipped ones is shown exactly as sent.
