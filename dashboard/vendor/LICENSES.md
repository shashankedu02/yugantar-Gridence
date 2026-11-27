# Dashboard third-party material

## Code

**No third-party code.** The dashboard is plain HTML, CSS and ES2020 modules.

## Data

| File | What it is | Licence |
|---|---|---|
| `geo/coastline-ne50m.json` | Reference coastline for the map: Natural Earth 1:50m `ne_50m_coastline`, release v5.1.2, clipped to 64–102°E, 5–39°N and rounded to 0.001°. Source file SHA-256 `271f1c4c1908312bac6b29d158ea1356544beafc129f260005300913aa5ea283` | **Public domain** ([Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/)) |

It is geography for orientation only: it is not weather data and does not make the 1° forecast finer. Only the coastline is included, **no political boundaries**: international datasets can draw India's boundaries differently from the official map. If the file cannot be read, the map falls back to the outline of the dataset's 1° land–sea mask.

The demo input states in `../cases/` contain modified Copernicus Climate Change Service information (ERA5, CC BY 4.0). See the root `README.md`.
