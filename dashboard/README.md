# Dashboard

Plain static HTML, CSS and JavaScript. No build step, no CDN, no network (libraries are vendored in `vendor/` with their licences). It talks only to our server (`docs/DASHBOARD_API.md`) and is served separately:

```powershell
python serve.py --port 8000                       # terminal 1
python -m http.server 5500 -d dashboard           # terminal 2, then open http://localhost:5500
```

## Modules
`js/app.js` (wiring) · `api.js` (client, one request at a time) · `validate.js` (response checks) · `state.js` (store; one snapshot per run) · `scenario.js` (official and custom shocks) · `analysis.js` (energy by distance, impact proxies) · `cases.js` (demo inputs) · `render.js`, `contour.js` (map) · `ui/` (legend, charts, banner, impact cards, status; `ui/colormap.js` colours both map and legend).

## Who edits what
| Path | Owner |
|---|---|
| `index.html`, `js/` (all except `js/ui/`), `vendor/` | W2 |
| `css/`, `assets/`, `js/ui/`, `ui-sandbox.html` | W3 |
| `cases/` (demo input states, generated) | W1 |

Nobody edits another owner's file. Ask, or send a PR the owner reviews.

## The W2 ↔ W3 contract
W3 builds **presentational ES modules** in `js/ui/`; W2 imports them from `js/` and feeds them data. A module:
- exports pure functions of the form `render…(container, data, options?)` that draw into the given DOM element and return nothing;
- never calls `fetch`, never reads global state, never touches elements outside `container`;
- uses CSS classes prefixed `mt-` defined in `css/` (W3), and CSS variables from `css/tokens.css`;
- works offline and has no dependency outside `vendor/`.

Agreed starting signatures (extend them by editing this file in a PR first):
| Module | Function | `data` |
|---|---|---|
| `ui/legend.js` | `renderLegend(el, data)` | `{channel, unit, min, max, ramp}` |
| `ui/charts.js` | `renderSeries(el, data)` | `{labels: [...], series: [{name, values: [...]}], unit}` |
| `ui/charts.js` | `renderEnergyByDistance(el, data)` | `{distances: [...], baseline: [...], scenario: [...]}` |
| `ui/impact.js` | `renderImpactCards(el, indicators)` | list of `{id, label, value, unit, status, note, isProxy}` |
| `ui/banner.js` | `renderModelBanner(el, model)` | the `model` object from `/meta` (must show the placeholder and unvalidated notices) |

W3 develops against `ui-sandbox.html` with mock data, so neither side waits for the other.

Map drawing, API access, the request queue, state and scenario logic stay in W2's `js/`.
