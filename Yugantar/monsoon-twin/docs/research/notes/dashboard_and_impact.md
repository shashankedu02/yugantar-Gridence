# Premium, scientifically honest climate-simulation dashboard (plain HTML/JS) and impact indicators from a 1-degree daily India weather emulator

Context assumed throughout: local FastAPI `POST /simulate`; inputs/outputs are 32 x 36 grids (lat 6.5-37.5N, lon 65.5-100.5E, 1 degree), channels t2m (K), tp (mm/day), u10, v10 (m/s), msl (Pa), tcwv (kg/m2), 10+ daily steps, about 1 MB JSON per call, under 5 s. "Cited Findings" are facts from the sources shown. "Inferences" are this researcher's reasoning and design suggestions, not facts from the sources.

## 1. Offline visualization stack, India boundary data, licences, vendoring

### Takeaway
None of these needs a tile server. A 32 x 36 regular lat-lon grid is small enough to draw directly onto a 2D canvas in an equirectangular frame, with a local India boundary GeoJSON on top. Every candidate library has a permissive licence (MIT, ISC, BSD or Apache-2.0) and can be vendored as a local file. For the boundary, Natural Earth is public domain and has an India point-of-view (de jure) variant. Its default layer is de facto, though, and Survey of India certification applies to *published* maps that show India's external boundary.

### Cited Findings
**Library licences and versions (read from each package's package.json on jsDelivr, Nov 2026):**
- Leaflet 1.9.4 — licence "BSD-2-Clause" — [jsDelivr leaflet package.json](https://cdn.jsdelivr.net/npm/leaflet@1.9.4/package.json)
- D3 7.9.2 — licence "ISC" — [jsDelivr d3 package.json](https://cdn.jsdelivr.net/npm/d3/package.json)
- Plotly.js (dist-min) 4.2.0 — licence "MIT" — [jsDelivr plotly.js-dist-min package.json](https://cdn.jsdelivr.net/npm/plotly.js-dist-min/package.json)
- Apache ECharts 5.6.0 — licence "Apache-2.0" — [jsDelivr echarts package.json](https://cdn.jsdelivr.net/npm/echarts@5/package.json)
- deck.gl 9.4.2 — licence "MIT" — [jsDelivr deck.gl package.json](https://cdn.jsdelivr.net/npm/deck.gl/package.json)
- MapLibre GL JS uses the 3-Clause BSD licence. It began as an open-source fork of mapbox-gl-js after Mapbox moved to a non-OSS licence in December 2020, and the project warns that backporting newer mapbox-gl-js code is unacceptable. The README example loads its style from a URL (demotiles.maplibre.org) — [MapLibre GL JS README](https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/README.md)
- cmocean (the colormap package) is MIT-licensed — [matplotlib/cmocean GitHub](https://github.com/matplotlib/cmocean)

**India boundary data:**
- Natural Earth: "All versions of Natural Earth raster + vector map data ... are in the public domain." Use is allowed for personal, educational and commercial purposes, and attribution is optional (suggested credit: "Made with Natural Earth") — [Natural Earth Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/)
- The default Natural Earth Admin-0 layer shows **de facto** status ("who actually controls the situation on the ground"). Separate "point-of-view" files show **de jure** boundaries according to each country's law. One of them is an **India POV** file, `ne_10m_admin_0_countries_ind.zip` (version 5.1.1, 1:10m, about 4.7 MB) — [Natural Earth Admin 0 – Countries point-of-views](https://www.naturalearthdata.com/?p=5118); see also [Natural Earth disputed boundaries policy](https://www.naturalearthdata.com/about/disputed-boundaries-policy/)
- Survey of India (SOI) certifies India's external boundary, islands and coastline as shown on maps. The process: two hard-copy proofs of each map go to the Boundary Verification Wing in Dehra Dun, with a scrutiny fee of Rs 2450 per map (Rs 600 for each extra map of the same scale and layout). Certification is valid for 6 months. Maps at 1:4 million or larger also need Ministry of Defence clearance. "Maps without the boundary or coastline" do not need scrutiny — [SOI: Scrutiny of external boundary and coast line of India](https://surveyofindia.gov.in/pages/scrutiny-of-external-boundary-and-coast-line-of-india)
- Other references (found but not fetched): the National Map Policy PDF — [SOI National Map Policy](https://www.surveyofindia.gov.in/files/nmp/National%20Map%20Policy.pdf), which could not be fetched (robots.txt unreachable); SOI's Geo-Spatial Data Guidelines — [SOI Geospatial Guidelines](https://onlinemaps.surveyofindia.gov.in/GeospatialGuidelines.aspx); and community discussion of where to get boundary files that match India's official position — [DataMeet: officially approved India map borders?](https://groups.google.com/g/datameet/c/1o1Avz434Ck/m/Zx6M9-lEAwAJ)

**Precedent for drawing coarse grids on canvas plus local vector boundaries without tiles:**
- cambecc/earth (MIT) draws its animation "on an HTML5 Canvas over an SVG map". The map data are Natural Earth coastlines and lakes (50m and 110m) converted to TopoJSON. The weather data are 1-degree GFS grids, bilinearly interpolated in the browser — [cambecc/earth GitHub](https://github.com/cambecc/earth)

### Inferences
- **Recommended minimal offline stack (suggestion).** Use no map library. Plain `<canvas>` handles the raster: build a 36 x 32 `ImageData`, colour it through a LUT, and draw it scaled up. Set `imageSmoothingEnabled=false` for honest 1-degree blocks, or render a bilinear/contour version as a clearly labelled "smoothed" view. A second canvas or SVG layer holds the India boundary in the same equirectangular transform: x = (lon-65)/36·W, y = (38-lat)/32·H, where the grid cell edges run 65-101E and 6-38N. Optionally add D3 (ISC) for the projection, contours (`d3-contour`) and axes, and a light chart library for time series (ECharts Apache-2.0 or Plotly MIT). The result needs no WebGL, no tiles and no fonts from a CDN.
- **When the heavier libraries make sense (suggestion).** MapLibre GL suits pan/zoom with vector styling. Its style can, in principle, contain only local GeoJSON and image sources with no tile URLs, but text labels need glyph files, which would also have to be vendored. deck.gl's BitmapLayer can drape a raster over given bounds without a basemap. Both are well beyond what a 32 x 36 grid needs, and they add GPU/driver risk on an unknown demo laptop. These capabilities come from general knowledge and were not verified in this session.
- **Vendoring (suggestion).** Download the minified dist files once and commit them under `vendor/`, together with each LICENSE file. All of the libraries above allow this, provided their copyright and licence notices are kept (true of BSD, MIT, ISC and Apache-2.0 in general).
- **Boundary choice (suggestion).** Start from Natural Earth's India POV file, simplify it hard (for example with mapshaper) to tens of KB, and clip it to the grid domain. Add a visible disclaimer, for example "Boundaries indicative only; not to scale; not SOI-certified". If a map image will be *published* (in print, on a poster, or online), either get SOI certification or crop/omit the external boundary, since SOI says maps without the boundary or coastline need no scrutiny. A live, unpublished hackathon demo is a grey area; this is not legal advice.
- **Payload (suggestion).** About 1 MB of JSON is fine on localhost. Parse it once into `Float32Array`s, and precompute the baseline-minus-perturbed difference client-side so the slider runs at 60 fps without new requests.

### Gaps
- Exact minified/gzipped bundle sizes could not be measured: shell network access to npm and jsDelivr was blocked in this session. Check them on bundlephobia or the jsDelivr file listing before choosing.
- The National Map Policy 2005 text and the 2021 Geospatial Guidelines were not read, so the exact legal wording (including any penalties) is unverified.
- How the Natural Earth India POV file differs from SOI's official depiction was not checked. Do not assume it is SOI-compliant.

## 2. Wind visualisation on a coarse grid (particles, barbs, streamlines)

### Takeaway
Three mature open-source particle-flow implementations exist: earth (MIT), leaflet-velocity (a CSIRO BSD/MIT-style licence) and mapbox/webgl-wind (ISC). Earth itself runs on a 1-degree grid with bilinear interpolation, so 1 degree is a known-workable resolution. Over India, though, a 36 x 32 grid gives only about 1150 vectors. Particle motion looks smoother than the data really are, so pair it with grid-point arrows or barbs.

### Cited Findings
- cambecc/earth: MIT licence. It uses 1-degree GFS data converted from GRIB2 to JSON with `grib2json`. The browser bilinearly interpolates intermediate points, which the README calls "quite costly". It corrects particle paths for projection distortion using finite differences, and animates on HTML5 Canvas over SVG — [cambecc/earth](https://github.com/cambecc/earth)
- leaflet-velocity: released under "CSIRO's Open Source Software Licence Agreement (variation of the BSD / MIT License)". Its input matches the output of wind-js-server/grib2json. Options include `velocityScale` (example 0.005), `colorScale`, and `minVelocity`/`maxVelocity`. It supports Leaflet v1.0.3 and v0.7.7, and its core uses a modified WindJS (Esri), with earth (cambecc) credited — [leaflet-velocity README (unpkg)](https://unpkg.com/leaflet-velocity@2.1.4/README.md); repo [onaci/leaflet-velocity](https://www.github.com/onaci/leaflet-velocity)
- mapbox/webgl-wind: ISC licence. "Capable of rendering up to 1 million wind particles at 60fps". Its data pipeline produces PNG and JSON files from GRIB using ecCodes, and it credits earth, the US Wind Map and Chris Wellons' GPU particle tutorial — [mapbox/webgl-wind](https://github.com/mapbox/webgl-wind)
- Related packages (not evaluated in detail): [danwild/wind-js-leaflet](https://github.com/danwild/wind-js-leaflet), [dannycochran/windable](https://github.com/dannycochran/windable)

### Inferences
- **Suggested approach.** Write a small custom Canvas2D particle advector (about 150 lines) that reads the two 32 x 36 u10/v10 arrays directly. It needs bilinear interpolation, a few thousand particles, a fixed lifetime, and a fading trail drawn with `globalCompositeOperation` or a translucent fill. That avoids the grib2json header format and the Leaflet dependency. The data are regular lat-lon, so there is no projection distortion to correct, which removes the costliest step in earth. Credit earth/WindJS as inspiration if you borrow code, and keep their MIT notice.
- **Honesty (suggestion).** Particles imply sub-grid structure. Offer a "grid arrows" toggle with one arrow or barb per 1-degree cell, or every second cell, and show speed as a sequential colour field underneath. For daily-mean winds, label the layer "daily-mean 10 m wind", since daily averaging smooths out diurnal sea breezes and gusts.
- **Streamlines.** These can be traced from the same interpolator (Runge-Kutta steps) and drawn as static lines. They suit printed or poster frames better than particles do.

### Gaps
- The exact leaflet-velocity JSON header fields (for example nx, ny, lo1, la1, dx, dy, parameterNumber) were not confirmed from the fetched README. Check the repo's `demo/*.json` files.
- No source was found on minimum grid density for honest particle animation. That recommendation is the researcher's judgement.

## 3. Colour maps: perceptually uniform, colour-blind-safe palettes

### Takeaway
The peer-reviewed guidance agrees: avoid rainbow/jet. Use perceptually uniform maps whose lightness changes monotonically: sequential for t2m, precipitation, tcwv and wind speed, and diverging, centred on zero, for baseline-vs-perturbed anomalies. The citable sources are Crameri's Scientific colour maps, cmocean, viridis/cividis and ColorBrewer.

### Cited Findings
- Crameri, F., Shephard, G.E. & Heron, P.J. (2020), "The misuse of colour in science communication", *Nature Communications* (published 28 Oct 2020), DOI 10.1038/s41467-020-19160-7 — [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC7595127). Key points:
  - Rainbow-type maps distort data, and the visual error "can be >7% of the displayed data variation". Bright yellow draws the eye even though it is not at an end or the centre of the map. Red-green pairs of similar lightness are unreadable to many people.
  - About 0.5% of women and 8% of men have colour-vision deficiency.
  - Perceptually uniform maps should give equal perceived steps for equal data steps, change lightness monotonically so they survive greyscale, and always be shown with a colour bar. Do not stretch or squeeze them.
  - Classes: sequential, diverging, cyclic and multi-sequential. Use diverging or multi-sequential maps for data centred on a value such as zero.
  - Recommended sources: Scientific colour maps (Crameri: perceptually uniform, CVD-friendly, sequential/diverging/cyclic), cmocean, viridis and its relatives (magma, plasma, inferno), ColorBrewer (discrete, with a CVD-safe filter) and cividis (near-identical under red-green CVD).
- Thyng, K.M., Greene, C.A., Hetland, R.D., Zimmerle, H.M. & DiMarco, S.F. (2016). True colors of oceanography: Guidelines for effective and accurate colormap selection. *Oceanography* 29(3):9–13, https://doi.org/10.5670/oceanog.2016.66. The paper presents the perceptually uniform cmocean suite (MATLAB, Python, R, GMT, ODV) and is CC BY 4.0 — [TOS article page](https://tos.org/oceanography/article/true-colors-of-oceanography-guidelines-for-effective-and-accurate-colormap)
- cmocean software: MIT licence — [matplotlib/cmocean](https://github.com/matplotlib/cmocean)
- Scientific colour maps v8.0.1 (Zenodo, 5 Oct 2023) are perceptually uniform, CVD-friendly and open access. Documentation DOI: 10.5194/gmd-2017-328. The record page shown did not state a licence — [Zenodo record 8409685](https://zenodo.org/records/8409685); Python port: [cmcrameri](https://pypi.org/project/cmcrameri)

### Inferences
- **Suggested palette assignment** (map names from general knowledge; check them in the cmocean and Crameri docs):
  - t2m absolute: cmocean `thermal`, or Crameri `lajolla`/`batlow`
  - t2m anomaly (perturbed minus baseline): cmocean `balance` or Crameri `vik`, symmetric about 0
  - tp absolute: cmocean `rain`, or ColorBrewer `YlGnBu`/`Blues`, with 0 mm/day transparent or neutral
  - tp anomaly: brown-to-green/blue diverging (ColorBrewer `BrBG` or cmocean `tarn`), so dry reads as brown
  - tcwv: cmocean `haline` or `dense`
  - wind speed: cmocean `speed` or `amp`
  - msl: cmocean `diff`, or contour lines only
- **Implementation (suggestion).** Precompute 256-entry RGB LUTs as a JS array, taking the values from the published CSV/txt files of cmocean or Scientific colour maps. Keep the colour-bar range fixed across baseline, perturbed and all time steps, or the animation flickers and the comparisons mislead. Use symmetric limits for differences. For IMD categories (see question 6), use *discrete* steps with the category labels.

### Gaps
- The licence of the Scientific colour maps files was not confirmed from the Zenodo page. The researcher believes recent versions are MIT-licensed; check the LICENSE file inside the zip before vendoring.
- The names of the cmocean palettes for each variable were not confirmed from the fetched pages.

## 4. Design patterns for professional climate/scenario tools; typography and dark themes

### Takeaway
Only Copernicus Climate Pulse was checked in detail. It pairs a map view with a time-series view, states anomalies against an explicit 1991–2020 baseline, gives hover values, a full-screen mode, help buttons and CSV export, and labels data latency. A scenario tool should borrow these and add an explicit baseline / perturbed / difference triptych.

### Cited Findings
- Climate Pulse (C3S/ECMWF) shows two variables: surface air temperature and sea-surface temperature, as absolute values and as anomalies against 1991–2020. Its time series compare the latest year with earlier years, with toggles back to 1940 and daily values on hover. Maps (annual, monthly or daily, back to 1979) can be zoomed and panned, and v1.0 added Mercator and regional views, full-screen mode, help buttons and a reset button. Chart images and time-series CSV can be downloaded. Data are "two days behind real time", from ERA5 — [Copernicus: Climate Pulse, take the temperature of our planet at a glance](https://climate.copernicus.eu/climate-pulse-tool-take-temperature-our-planet-glance); app: [pulse.climate.copernicus.eu](https://pulse.climate.copernicus.eu/)
- The same page did not describe uncertainty or preliminary-data messaging — [same source](https://climate.copernicus.eu/climate-pulse-tool-take-temperature-our-planet-glance)

### Inferences (design suggestions, not sourced)
- **Layout.** Use three areas:
  - Left rail: scenario controls (shock type, magnitude, radius, start day, variable, preset "monsoon break", "heat dome" and "Bay of Bengal low"), plus a Run button with latency and status.
  - Centre: the main map, with a **Baseline | Perturbed | Difference** segmented control. A side-by-side small-multiples mode shows all three at once, with a shared colour bar for the first two and a diverging bar for the difference.
  - Bottom: a time scrubber (day 0…N) with play/pause and step controls, plus sparklines of domain- or region-mean indicators for baseline and perturbed.
  - Right rail: an impact card for each indicator (question 6).
- **Painting a shock.** Use pointer events on the map canvas to paint a Gaussian brush mask on the 32 x 36 grid. Show the mask as an outlined overlay and send it with the request as a mask array plus amplitude per channel. Show the exact cells perturbed so nothing is hidden.
- **Scientific-honesty affordances.**
  - Put a persistent "Emulator output, not a forecast" badge on screen, and state the model's training period and resolution.
  - Show lead day prominently, and grey out or annotate days beyond the emulator's validated horizon.
  - Flag perturbations outside the training range of the inputs.
  - Show difference maps rather than leaving users to compare two coloured maps by eye.
  - If an ensemble or several seeds are available, show spread (a stippling or hatching mask where |difference| < spread).
- **Visual style.** Use a dark neutral background (about #0f1115 to #15181d, not pure black) with the map as the only saturated element, and muted UI chrome. Use tabular (monospaced-digit) numerals for values, such as Inter with `font-feature-settings: "tnum"`, or IBM Plex Sans/Mono, vendored as local WOFF2 since the laptop may be offline. Always print units (°C rather than K for display, mm/day, m/s, hPa). Note that some palettes (for example viridis or `thermal`) start very dark, so the low end can vanish on a dark background. Add a thin outline or a slightly lighter map backdrop.

### Gaps
- ECMWF charts, Windy, NASA Worldview and Climate Reanalyzer were not fetched (tool budget), so no cited layout claims are available for them.
- No published typography or dark-theme standard specific to climate dashboards was found. The suggestions above are the researcher's judgement. The `dataviz`/`frontend-design` skills could inform this further.

## 5. Browser access to a local FastAPI API (CORS, static hosting)

### Takeaway
If the dashboard is served from a different origin than the API, add Starlette/FastAPI `CORSMiddleware` with explicit origins. An origin is protocol + domain + port. The simplest way to avoid CORS entirely is to serve the static dashboard from the same FastAPI app.

### Cited Findings
- An origin is the combination of protocol, domain and port. `http://localhost`, `https://localhost` and `http://localhost:8080` are different origins — [FastAPI docs: CORS](https://fastapi.tiangolo.com/tutorial/cors/)
- Configure it with `from fastapi.middleware.cors import CORSMiddleware` and `app.add_middleware(CORSMiddleware, allow_origins=[...], allow_credentials=..., allow_methods=[...], allow_headers=[...])`. Defaults: `allow_methods=['GET']`, `allow_headers=[]`, `allow_credentials=False`, `max_age=600` — [FastAPI docs: CORS](https://fastapi.tiangolo.com/tutorial/cors/)
- "None of `allow_origins`, `allow_methods` and `allow_headers` can be set to `['*']` if `allow_credentials` is set to `True`." — [FastAPI docs: CORS](https://fastapi.tiangolo.com/tutorial/cors/)
- The middleware intercepts preflight `OPTIONS` requests (those carrying `Origin` and `Access-Control-Request-Method` headers) and answers 200 or 400. `Accept`, `Accept-Language`, `Content-Language` and `Content-Type` are always allowed for simple requests — [FastAPI docs: CORS](https://fastapi.tiangolo.com/tutorial/cors/)

### Inferences
- **Suggested configuration.** Two setups work:
  - Separate servers: serve the dashboard with `python -m http.server 8080` and run the API on `uvicorn ... --port 8000`. Then set `allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"]`, `allow_methods=["POST", "GET", "OPTIONS"]`, `allow_headers=["Content-Type"]` and `allow_credentials=False`. `localhost` and `127.0.0.1` are different hosts, so list both.
  - Same origin: mount the dashboard with `app.mount("/", StaticFiles(directory="dashboard", html=True))` after the API routes. CORS is then not needed.
- `fetch` with `Content-Type: application/json` is not a CORS "simple" request, so expect a preflight. The middleware handles it, but forgetting `POST` in `allow_methods` (the default is GET only) is a common failure.
- Opening `index.html` by double-clicking (file://) gives an opaque "null" origin and breaks many things. Always serve over http on the demo laptop.
- **Performance (suggestion).** Enable `GZipMiddleware`, since grid JSON compresses well. Round floats to 2–3 decimals server-side, or return base64 Float32 arrays. Show a progress state, because a call takes up to about 5 s.

### Gaps
- MDN's CORS "simple request" rules were not fetched. The preflight claim for `application/json` comes from general knowledge of the Fetch/CORS standard.

## 6. Impact indicators computable from daily-mean t2m, daily rainfall, wind and moisture at 1 degree

### Takeaway
The defensible indicators, if labelled honestly, are:
- IMD rainfall-intensity categories, applied as *grid-mean* rainfall
- multi-day accumulated rainfall as a flood-*hazard* proxy
- percentage rainfall departure using IMD's Excess/Normal/Deficient bands
- the Rajeevan et al. (2010) monsoon break/active-spell index over the monsoon core zone
- t2m anomaly "heat-stress proxies"

IMD heatwave declarations themselves need daily *maximum* temperature at stations, so they cannot be reproduced from daily-mean t2m. Heat index and wet-bulb measures need near-surface humidity, which the channels lack (tcwv is a column total). Wind power at hub height can only be shown as a rough relative index.

### Cited Findings
**Heat (IMD):**
- An IMD heat wave needs a **maximum** temperature of at least 40°C in the plains or at least 30°C in hilly regions. It is then declared on either of two bases. Departure from normal: 4.5–6.4°C is a heat wave, above 6.4°C a severe heat wave. Actual maximum: 45°C or more is a heat wave, 47°C or more a severe heat wave. The criteria must be met at no fewer than 2 stations in a meteorological sub-division for at least two consecutive days, and the heat wave is declared on the second day. Coastal stations: departure of 4.5°C or more when the maximum is at least 37°C. Warm night (only when Tmax is 40°C or more): minimum-temperature departure 4.5–6.4°C; very warm night above 6.4°C. IMD notes that some countries instead use a heat index or percentiles — [IMD heat/cold definitions (mausam.imd.gov.in)](https://mausam.imd.gov.in/pdfs/heatcolduser/Definition.pdf); also [IMD FAQ heat wave](https://mausam.imd.gov.in/pdfs/heatcolduser/FAQ_heat_wave.pdf)
- A Business Standard headline (May 2026) reports that IMD will change its parameters for declaring heatwaves. The details were not verified — [Business Standard, 2026](https://www.business-standard.com/india-news/climate-change-crisis-imd-to-change-parameters-to-declare-heatwaves-126051600450_1.html)

**Heat index needs humidity:**
- The NWS heat index takes air temperature (°F) and **relative humidity (%)**. It uses a simple Steadman-based formula when the result is below about 80°F, and otherwise the Rothfusz (1990) regression, with adjustments for RH below 13% and above 85%. The regression is not valid outside the range of conditions Steadman considered — [NOAA WPC: The Heat Index Equation](https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml)

**Rainfall intensity (IMD):**
- IMD terms (mm): "Heavy rain: 64.5 – 115.5", "Very heavy rain: 115.6 – 204.4", "Extremely heavy rain: 204.5 or more". Spatial terms: Isolated <25%, A few 26–50%, Many 51–75%, Most 76–100% (of stations/area) — [IMD press release 24 Nov 2020](https://internal.imd.gov.in/press_release/20201124_pr_932.pdf)

**Rainfall departure categories (IMD):**
- Large Excess ≥60%; Excess 20% to 59%; Normal −19% to +19%; Deficient −20% to −59%; Large Deficient −60% to −99%; No Rain −100% — [IMD State rainfall distribution map legend](https://mausam.imd.gov.in/Rainfall/STATE_RAINFALL_DISTRIBUTION_COUNTRY_INDIA_cd.pdf)

**Monsoon break and active spells:**
- Daily criterion (July–August): take the normalized rainfall anomaly averaged over the Monsoon Core Zone (MZI, about 18–28°N, 65–88°E), from high-resolution daily gridded rainfall. A break is an anomaly below −1.0 for three or more consecutive days; an active spell is above +1.0 for three or more consecutive days. A pentad alternative (JJAS) uses ±40% of the long-term pentad mean. Source: Rajeevan et al. (2010) — [IITM ERPAS active/break selection](https://www.tropmet.res.in/erpas/files/active_break_selection.php); paper: [Rajeevan, Gadgil & Bhate 2010, J. Earth Syst. Sci. (IAS repository)](https://repository.ias.ac.in/15911); [Springer DOI 10.1007/s12040-010-0019-4](https://link.springer.com/doi/10.1007/s12040-010-0019-4)

**Wind power proxy:**
- The power law is v(z) = v(z_r)·(z/z_r)^α. α is about 1/7 (0.143) for neutral stability over open land and about 0.11 over open water. α varies with stability. A constant α ignores roughness, displacement and stability, can be "quite erroneous" near obstacles, and is generally acceptable only for height differences under about 50 m. The log profile is preferred when roughness and stability are known. The same mean speed can give different power density depending on the speed distribution — [Wikipedia: Wind profile power law](https://en.wikipedia.org/wiki/Wind_profile_power_law); research on height extrapolation: [OSTI: Height extrapolation of wind data](https://www.osti.gov/biblio/6019129-height-extrapolation-wind-data)

### Inferences (defensibility assessment; researcher's judgement)
- **IMD heatwave: not reproducible, so present a proxy.** IMD's criteria use station Tmax, a "normal" Tmax, a two-station sub-division rule and two consecutive days. Daily-mean t2m over a 1-degree cell sits well below Tmax, often by several °C in the pre-monsoon season. Defensible options:
  - (a) a "**heat-anomaly days**" indicator: daily-mean t2m anomaly against the emulator's own or ERA5 daily climatology above +4.5 K for 2 or more consecutive days. It mirrors IMD's departure logic but must be labelled as *not* an IMD heatwave.
  - (b) an estimated Tmax from a climatological Tmax-minus-Tmean offset per cell and month, precomputed offline from ERA5 or IMD gridded Tmax. This is only honest if the offset source is shown and its uncertainty stated.
  - The 2026 report that IMD may change its heatwave parameters means the thresholds should be put in config, not hard-coded.
- **Heat index, wet-bulb, Humidex, WBGT: not defensibly computable.** All need near-surface humidity (RH or dew point), and WBGT also needs radiation and wind. tcwv (kg/m², equal to mm of precipitable water) is a column integral, and turning it into 2 m humidity would need assumptions about the vertical profile. Say plainly in the UI that humid-heat stress needs dew point, which this emulator does not output. *Possible future work:* add d2m or q2m as an emulator channel.
- **Rainfall categories: computable with a caveat.** Apply the IMD 24-h thresholds to daily tp per cell. A 1-degree grid-mean value smooths out point extremes, so cell values crossing "heavy" are rarer than station reports. Label the layer "grid-mean rainfall in IMD intensity bands". The spatial-coverage terms (isolated/few/many/most) can be applied to the share of cells in a region, an honest analogue of the station-share terms.
- **Rainfall deficit and kharif stress: computable for the simulated window.** Use (Σ tp_perturbed − Σ tp_climatology) / Σ tp_climatology × 100 over the rollout days, shown in IMD's Excess/Normal/Deficient bands. Caveats:
  - IMD's categories are normally applied to seasonal or monthly cumulative totals per meteorological sub-division. A 10-day window is much noisier, so label it "10-day departure".
  - A climatology must be shipped, for example a daily cell climatology from IMD gridded rainfall or ERA5, smoothed in time.
  - The "baseline vs perturbed" departure (relative change caused by the shock) is the cleanest and needs no climatology.
- **Monsoon break index: highly defensible, and an excellent showcase.** The MZI box (18–28°N, 65–88°E) lies inside the grid. Area-average tp over the land cells in the box, normalise with a daily climatological mean and SD for July–August (precomputed offline), and flag runs of 3 or more days below −1.0 or above +1.0. A 10-day rollout can show a break forming or ending. Caveat: the criterion was defined on IMD's gridded rainfall, so emulator or ERA5 biases shift the anomaly. Ideally normalise with the emulator's own climatology, or bias-correct.
- **Flood-risk proxy: as a hazard indicator, not flood risk.** Use 3-day and 5-day accumulated rainfall per cell, compared against fixed thresholds (for example multiples of the IMD "heavy" threshold) or against climatological percentiles. Call it "extreme rainfall accumulation" or "flood-hazard proxy". Real flood risk depends on catchment hydrology, antecedent soil moisture, terrain, river routing and exposure, none of which the emulator has.
- **Wind power proxy: relative index only.**
  - Power density is 0.5·ρ·v³. With daily-mean 10 m wind, the cube of the mean underestimates the mean of the cube, because diurnal and gust variability is lost.
  - Extrapolating from 10 m to a hub height of about 100 m spans far more than the 50 m range where a constant α is acceptable.
  - A 1-degree cell averages terrain features such as coastal and ghat sites, where Indian wind farms sit.
  - Defensible output: "relative change in 10 m wind power density, perturbed vs baseline (%)". Optionally show hub-height speed with α = 1/7 as an illustrative estimate with a clear caveat. Do not show MW or capacity factor.
- **Moisture and monsoon dynamics indicators (suggestion).** tcwv anomalies, moisture transport (u10·tcwv, v10·tcwv as a crude near-surface proxy for vertically integrated transport) and a msl gradient across the monsoon trough are physically meaningful diagnostics. Present them as diagnostics, not impacts. A low-level jet proxy (u10 over the Arabian Sea) is suggestive only, because the real Somali jet/LLJ is defined near 850 hPa, not at 10 m.
- **UI pattern for impacts (suggestion).** Give each indicator a card with five parts: definition, source citation (IMD / Rajeevan 2010 / NWS), the "computed as" formula, a baseline vs perturbed value and delta, and a caveat tooltip. Colour categorical indicators with discrete IMD-style bands rather than a continuous ramp.

### Gaps
- IMD's lower rainfall categories (very light, light, moderate) and "exceptionally heavy" were not in the fetched press release. The researcher recalls very light 0.1–2.4, light 2.5–15.5 and moderate 15.6–64.4 mm/day, but these are unverified here. Check the IMD glossary before using them.
- The reference period for IMD's "normal" rainfall on the departure map was not stated in the fetched legend.
- The content of IMD's reported 2026 heatwave-criteria change is unknown.
- No source was fetched quantifying the typical Tmax minus daily-mean t2m gap over India by season, so no number should be quoted without a reference.
- No India-specific wind-shear exponent study was fetched.
