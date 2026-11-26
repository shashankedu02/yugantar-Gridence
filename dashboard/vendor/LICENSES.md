# dashboard/vendor — Third-party Licences

## Runtime dependencies

**No third-party code.** The dashboard is plain HTML, CSS and ES2020 modules.

## Third-party data

| File | What it is | Licence |
|---|---|---|
| `geo/coastline-ne50m.json` | Reference coastline for the map: Natural Earth 1:50m `ne_50m_coastline`, release v5.1.2, clipped to 64–102°E, 5–39°N and rounded to 0.001°. Source file SHA-256 `271f1c4c1908312bac6b29d158ea1356544beafc129f260005300913aa5ea283` | **Public domain** ([Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/)) |

It is geography for orientation only: it is not weather data and does not make the 1° forecast finer. Only the coastline is included, **no political boundaries**: international datasets can draw India's boundaries differently from the official map. If the file cannot be read, the map falls back to the outline of the dataset's 1° land–sea mask.

## W3-owned assets (not vendored here)

The following directories are owned by W3 and are not managed by W2:

- `dashboard/js/ui/`   — W3 UI component modules
- `dashboard/css/`     — W3 design-system stylesheets

W3 component files should carry their own licence headers and attribution.

## Note for W1

The dashboard expects `dashboard/cases/index.json` and individual case JSON
files conforming to the shape described in `docs/DASHBOARD_API.md`. W2 falls
back to a deterministic `SYNTHETIC TEST INPUT` case when no W1 case files
are present. W1 owns `dashboard/cases/`; no files in that directory are
created or modified by W2.

---
_Last updated: Stage 2D — W2 dashboard integration (MonsoonTwin, Track 2)_
