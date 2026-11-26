# Official online sources for Yugaantar DevForge, Track 2 "Multiverse of Monsoon" (source-verification register, as of 26 Nov 2026)

Status labels: **Verified (fetched)** = content retrieved and read this session; **Found-but-not-fetched** = URL located (search hit or HTTP redirect) but page body not read; **Not found** = searched, nothing located.

Register at a glance:

| # | Resource | URL | Status | Notes |
|---|---|---|---|---|
| 1 | Kit repo (public GitHub) | https://github.com/OfficialAbhinavSingh/yug-monsoon-kit | Verified (git clone of HEAD) | 1 commit, 1 tag v1.0.0, matches local kit |
| 2 | Release v1.0.0 assets (direct download URLs) | https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/releases/download/v1.0.0/{asset} | Verified via HTTP HEAD (sizes, dates); stats.json and API_CONTRACT.md read | india_climate_train.nc 122,831,709 B; wheel 23,182 B; stats.json 355 B; API_CONTRACT.md 6,245 B |
| 3 | Releases HTML page (full asset list, release notes) | https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/releases | Found-but-not-fetched (rate-limited 3x; API blocked in this session) | Cannot rule out extra assets beyond the 4 probed |
| 4 | Event listing (aggregator) | https://www.startupgrantsindia.com/competitions/the-devforge-hackathon | Verified (fetched) | Secondary source; names Scaler School of Technology as organiser |
| 5 | Official Unstop page | (unknown) | Not found | Aggregator says registration was via Unstop; no URL found |
| 6 | Organiser site / Instagram / LinkedIn / Devfolio / Devpost | (none) | Not found | |
| 7 | ISRO BAH 2026 Grand Finale page | https://www.isro.gov.in/Bharatiya_Antariksh_Hackathon_2026_Grand_Finale.html | Verified (fetched) | Does not list PS numbers |
| 8 | BAH 2026 explainer (Business Today) | https://businesstoday.in/education/story/isro-bharatiya-antariksh-hackathon-2026-how-to-apply-eligibility-more-536547-2026-06-12 | Verified (fetched) | Names the climate digital-twin PS but not its number |
| 9 | Hack2skill BAH 2026 portal | https://hack2skill.com/event/bah2026 | Found-but-not-fetched (redirect loop https->http) | |
| 10 | BAH 2026 shortlisted teams PDF | https://www.isro.gov.in/media_isro/pdf/BAH_2026_Shortlisted_Teams_16072026_Publication.pdf | Found-but-not-fetched | |
| 11 | WeatherBench 2 data guide | https://weatherbench2.readthedocs.io/en/latest/data-guide.html | Verified (fetched, first 100k of 207k chars) | ERA5 ends 2023-01-10 18:00 |
| 12 | ARCO-ERA5 README | https://github.com/google-research/arco-era5 | Verified (fetched, first 100k of 170k chars) | Store description confirmed |
| 13 | Google Cloud ERA5 public dataset page | https://cloud.google.com/storage/docs/public-datasets/era5 | Found-but-not-fetched (302 to docs.cloud.google.com/storage/docs/public-datasets) | |
| 14 | ERA5 licence (ECMWF / Copernicus) | https://apps.ecmwf.int/datasets/licences/era5 ; https://confluence.ecmwf.int/x/l-xCDQ | Found-but-not-fetched | CC BY 4.0 wording not verified from primary source |

## Q1. Public GitHub URL of yug-monsoon-kit, its Releases page and assets, and whether API_CONTRACT.md exists

### Takeaway
The kit is public at github.com/OfficialAbhinavSingh/yug-monsoon-kit (one commit, tag v1.0.0, pushed 26 Nov 2026 03:03 IST) and is identical in content to the team's local copy. The Release v1.0.0 serves india_climate_train.nc (~117 MiB), stats.json, the wheel, **and an `API_CONTRACT.md` asset that is byte-identical to `docs/R1_CONTRACT.md`**, which resolves the PDF/kit naming mismatch.

### Cited Findings
- GitHub repository search for "yug-monsoon-kit" (and "devforge monsoon") returns exactly one repo: `OfficialAbhinavSingh/yug-monsoon-kit`, last updated 2026-11-25T21:33:46Z. Searches for "monsoon-r1-kit" and "monsoon_r1" return 0 repos. — [GitHub repo](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit) (via `gh api search/repositories`)
- Repo history: a single commit `689c879`, 2026-11-26 03:03:33 +0530, author OfficialAbhinavSingh, message "Multiverse of Monsoon Round 1 team kit v1.0.0"; one tag `refs/tags/v1.0.0` pointing at that commit. — [GitHub repo](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit)
- Tracked files (bytes): .gitignore 56, LICENSE 1086, NOTICE 397, README.md 1758, docs/R1_CONTRACT.md 6245, monsoon_r1/__init__.py 0, build_dataset.py 11417, client.py 5351, contract.py 2925, repo_scan.py 8360, schema_validator.py 1968, scoring.py 9870, stats.py 1871, template/serve.py 2339, pyproject.toml 622. No API_CONTRACT.md in the tree; no .nc file in the tree. — [GitHub repo](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit)
- `diff -rq` of the public repo's `monsoon_r1/` against the local copy at /home/claude/kit_tests/monsoon_r1 shows no differences (excluding __pycache__). — [GitHub repo](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit)
- pyproject: name `monsoon-r1-kit`, version 1.0.0, description "Yugaantar DevForge, Multiverse of Monsoon, Round 1: API contract, scoring definitions, schema validator, repo scanner and dataset tooling", requires-python >=3.10, deps numpy>=1.26 and requests; extras `data` (xarray, netCDF4, scipy) and `serve` (fastapi, uvicorn). LICENSE: MIT, "Copyright (c) 2026 Yugaantar DevForge organisers". — [pyproject.toml](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/blob/main/pyproject.toml)
- Release v1.0.0 assets, confirmed by HTTP HEAD on `releases/download/v1.0.0/<name>` (302 to release-assets.githubusercontent.com, then 200):
  - `india_climate_train.nc`: Content-Length 122,831,709 bytes (~117.1 MiB), Last-Modified Wed 25 Nov 2026 21:34:14 GMT
  - `monsoon_r1_kit-1.0.0-py3-none-any.whl`: 23,182 bytes, Last-Modified 25 Nov 2026 21:34:10 GMT
  - `stats.json`: 355 bytes, Last-Modified 25 Nov 2026 21:33:57 GMT
  - `API_CONTRACT.md`: 6,245 bytes, Last-Modified 25 Nov 2026 21:33:57 GMT
  — [Release v1.0.0 download base](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/releases/download/v1.0.0/stats.json)
- `API_CONTRACT.md` (release asset) SHA-256 `e49e70c0...3db5513` equals SHA-256 of `docs/R1_CONTRACT.md` in the repo: the two are the same document under two names. — [API_CONTRACT.md asset](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/releases/download/v1.0.0/API_CONTRACT.md)
- `stats.json` content (read in full): channels [t2m, tp, u10, v10, msl, tcwv]; mean [292.3568, 3.6181, 0.8877, 0.1913, 101122.08, 30.0335]; std [13.4636, 7.5533, 2.8990, 2.4270, 619.02, 20.4944]. Six channels only (no static channels in stats.json). — [stats.json asset](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/releases/download/v1.0.0/stats.json)
- R1_CONTRACT.md states static channels `land_sea_mask`, `orography_m` are inside india_climate_train.nc as variable `static` (2 x 32 x 36); judge polls `/health` every 2 s up to 120 s; 8 `/simulate` calls, each 5.0 s limit, no retries; endpoint must stay up ~48 h only if self-hosted; default is organisers run repo offline. — [docs/R1_CONTRACT.md](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/blob/main/docs/R1_CONTRACT.md)
- `build_dataset.py` header: "WeatherBench2's ERA5 stops on 2023-01-10; later dates need ARCO"; WB2 path `gs://weatherbench2/datasets/era5/1959-2023_01_10-6h-360x181_equiangular_with_poles_conservative.zarr`; ARCO path `gs://gcp-public-data-arco-era5/ar/full_37-1h-0p25deg-chunk-1.zarr-v3`. — [build_dataset.py](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/blob/main/monsoon_r1/build_dataset.py)

### Inferences
- The release and repo were published ~21:33 UTC on 25 Nov 2026 (03:03 IST 26 Nov), i.e. within hours of the event start; teams should expect no earlier versions.
- The PDF's "API_CONTRACT.md" reference is satisfied: the organisers ship the same contract under that name as a release asset. No contradiction in content.
- The kit says it was built from the WB2 360x181 (1 degree) store; the WB2 data guide page I read did not list that particular file (see Q4), so its exact name is not independently confirmed, though the 2023-01-10 end date is.
- The ~117 MiB .nc file is under GitHub's normal size limits, but the README's "no .nc files in the repo" rule (repo_scan) means it must stay out of the submission repo.

### Gaps
- The Releases HTML page (release title, notes, full asset list, download counts) could not be read: WebFetch was rate-limited three times and the GitHub API for this repo is blocked in this session. Assets were found by probing the four expected names; there may be other assets not probed.
- Owner profile (who "OfficialAbhinavSingh" is, organiser affiliation) not fetched; the user API path is blocked in this session.
- No API_CONTRACT.md found in any other repository (GitHub code search for related strings found only unrelated repos, plus a participant-looking repo `AdityaNayak12/kaal-barish` with a CONTRACT.md that was not readable here).

## Q2. Official event page, host institution, dates, deadlines, rounds, prizes, team rules, pre-existing-code rules

### Takeaway
No primary organiser page (college site, Unstop, Devfolio, Devpost, social posts) was found. The only listing located is an aggregator (StartupGrantsIndia) naming **Scaler School of Technology (SST), Bengaluru** as organiser, with ₹50,000 prizes, teams of 2-4, a Round 1 design-document submission and a 24-hour offline Round 2; its round description and its "all code written during the hackathon" rule do not match the Track 2 kit's Round 1 model-serving workflow, so treat it with caution.

### Cited Findings
- Organiser: "The Scaler School of Technology (SST), Bengaluru"; tells participants to join "the official Yugaantar WhatsApp announcement channel" (no link given). — [StartupGrantsIndia listing](https://www.startupgrantsindia.com/competitions/the-devforge-hackathon)
- Listed period 3 Oct 2026 to 27 Nov 2026; registration deadline 9 Nov 2026 (shown closed); Round 1 submission deadline not stated; "Day 1 code freeze: 09:00 AM". — [StartupGrantsIndia listing](https://www.startupgrantsindia.com/competitions/the-devforge-hackathon)
- Rounds per the listing: Round 1 = register on Unstop, choose a problem statement, submit a plain-text/Markdown/PDF System Design Document (no PPTs); Round 2 = 24-hour overnight offline hackathon at SST campus, Bengaluru, with desk-side judging (PPT walkthrough, live demo, codebase analysis); Top 10 present at Grand Stage Finals. — [StartupGrantsIndia listing](https://www.startupgrantsindia.com/competitions/the-devforge-hackathon)
- Prizes ₹50,000 total: Winner ₹25,000, Runner-up ₹15,000, 2nd Runner-up ₹10,000. Teams of 2-4; open to college students across India; inter-college teams allowed. — [StartupGrantsIndia listing](https://www.startupgrantsindia.com/competitions/the-devforge-hackathon)
- Pre-existing code: pre-built projects not allowed; all code must be written during the hackathon (libraries/frameworks permitted); disqualification for pre-existing projects, cloned repos without substantial original contribution, fabricated Git history, or mockups/pre-rendered videos presented as live software. — [StartupGrantsIndia listing](https://www.startupgrantsindia.com/competitions/the-devforge-hackathon)
- The listing names no tracks and does not mention "Multiverse of Monsoon". — [StartupGrantsIndia listing](https://www.startupgrantsindia.com/competitions/the-devforge-hackathon)
- Circumstantial link between "Yugaantar" and SST: a GitHub org `SST-OSS` has a repo `yugaantar2024`; several personal repos named "Yugaantar" were created/updated 26 Nov 2026 (e.g. RakeshSabnis/Yugaantar, MadhurSikarwar/yugaantar, M20A03/Yugaantar). Not read (blocked). — [SST-OSS/yugaantar2024](https://github.com/SST-OSS/yugaantar2024)
- Kit README (organiser-authored) describes Round 1 for this track as an offline-run model repo scored on forecast (45), dynamics (25), repo (15), brief (15) with 8 blind requests. — [README.md](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/blob/main/README.md)

### Inferences
- Host is probably SST Bengaluru, with "Yugaantar" likely SST's fest/tech-event brand and DevForge the hackathon under it, but this rests on an aggregator plus a GitHub org name, not a primary page.
- **Contradiction to flag:** aggregator says Round 1 is a design document and code is written only during the 24-hour event; the Track 2 kit's Round 1 requires a trained model repo and a 2-page brief. Either Track 2 has a track-specific Round 1 (kit dated 25/26 Nov), or the aggregator copy is generic/outdated. The team should rely on the kit/PDF and ask organisers (WhatsApp channel) about the "code written during the hackathon" and "fabricated Git history" rules, since they bear on any code prepared before the event start. Keep honest, incremental commit history.
- The listing's end date (27 Nov) is consistent with an event on 26-27 Nov.

### Gaps
- No Unstop URL, SST/Yugaantar official page, Instagram, LinkedIn, Devfolio or Devpost page found (several searches: "Yugaantar DevForge hackathon 2026", "Yugaantar DevForge unstop", "unstop devforge Scaler School of Technology Yugaantar 2026", "Yugaantar hackathon Scaler School of Technology November 2026").
- Track 2 submission deadline, Round 2 date/time, track list and track-specific rules not found online.
- Yugaantar WhatsApp channel link not published on the aggregator.

## Q3. ISRO Bharatiya Antariksh Hackathon (BAH) "PS-5": AI-Powered Digital Twin of India's Climate

### Takeaway
BAH 2026 (ISRO with Hack2skill) published 15 problem statements; one was "an AI-powered digital twin of India's climate". Its PS number could not be confirmed from a fetched source, so "PS-5" remains as stated in the track PDF only.

### Cited Findings
- ISRO published 15 problem statements for BAH 2026; named examples include "An AI-powered digital twin of India's climate", Chandrayaan-2 radar subsurface ice, Aditya-L1 solar flare forecasting, exoplanets from noisy light curves, and generative-AI cloud removal. The article gives no PS numbers. — [Business Today, 12 Jun 2026](https://businesstoday.in/education/story/isro-bharatiya-antariksh-hackathon-2026-how-to-apply-eligibility-more-536547-2026-06-12)
- BAH 2026 dates: registration opened 10 Jun 2026; explainer sessions 15-16 Jun; registration closed 1 Jul; shortlist 20 Jul; 30-hour grand finale 6-7 Aug 2026; applications through the Hack2skill portal. — [Business Today](https://businesstoday.in/education/story/isro-bharatiya-antariksh-hackathon-2026-how-to-apply-eligibility-more-536547-2026-06-12)
- ISRO's own page: launched 10 Jun 2026, Grand Finale 6-7 Aug 2026 at NRSC Hyderabad, domains included geospatial technology, space science, image processing, AI/ML; does not list the 15 statements. — [ISRO BAH 2026 Grand Finale](https://www.isro.gov.in/Bharatiya_Antariksh_Hackathon_2026_Grand_Finale.html)
- Official portal: [Hack2skill BAH 2026](https://hack2skill.com/event/bah2026) (Found-but-not-fetched: redirect loop). Shortlist PDF: [ISRO BAH 2026 shortlisted teams](https://www.isro.gov.in/media_isro/pdf/BAH_2026_Shortlisted_Teams_16072026_Publication.pdf) (Found-but-not-fetched; may list PS numbers).

### Inferences
- The Track 2 PDF's "Inspired by ... PS-5 (AI-Powered Digital Twin of India's Climate)" is consistent with a real BAH 2026 statement; only the number is unverified.

### Gaps
- Full text, number and ISRO centre of the digital-twin statement not retrieved (Hack2skill page unreachable; shortlist PDF not read).

## Q4. WeatherBench 2 ERA5 end date and ARCO-ERA5 description (why train and hidden test use different paths)

### Takeaway
WeatherBench 2's ERA5 zarr stores end on 2023-01-10 (last 6-hourly step 18:00 UTC), so data after that date must come from ARCO-ERA5, Google's continuously updated 0.25-degree analysis-ready Zarr copy of ERA5. This matches the kit's statement and explains why hidden test windows (after 2023-01-10) go through a different regridding path (0.25 deg ARCO averaged to the 1 deg grid) than the training set (WB2 1 deg conservative).

### Cited Findings
- WB2 ERA5 files are named `1959-2023_01_10-...` (e.g. `gs://weatherbench2/datasets/era5/1959-2023_01_10-full_37-1h-0p25deg-chunk-1.zarr`, `...-6h-240x121_equiangular_with_poles_conservative.zarr`, `...-6h-64x32_equiangular_conservative.zarr`); the wb13 6-hourly set runs 1959-01-01 00:00 to 2023-01-10 18:00. — [WB2 data guide](https://weatherbench2.readthedocs.io/en/latest/data-guide.html)
- The `...-6h-360x181_equiangular_with_poles_conservative.zarr` store cited by the kit was not listed in the portion of the data guide read. — [WB2 data guide](https://weatherbench2.readthedocs.io/en/latest/data-guide.html)
- WB2 data guide says ERA5 was downloaded from the Copernicus Climate Data Store and to check LICENSE files in each bucket. — [WB2 data guide](https://weatherbench2.readthedocs.io/en/latest/data-guide.html)
- ARCO-ERA5: analysis-ready, cloud-optimised ERA5 in Zarr on Google Cloud Public Datasets, hourly, 1979 to present; `gs://gcp-public-data-arco-era5/ar/full_37-1h-0p25deg-chunk-1.zarr-v3` is a 0.25 deg equiangular lat-lon store with 37 pressure levels and all surface fields, hourly 00-23, ~2.05 PB, chunked time=1, described as a superset of GraphCast/NeuralGCM training data. Stable ERA5 updated monthly (~9th) with ~3-month lag; ERA5T ~1 week behind; check `valid_time_stop`. Repo code licence Apache-2.0. — [google-research/arco-era5](https://github.com/google-research/arco-era5)

### Inferences
- Because WB2 stops 2023-01-10, the organisers built training (2005-2021) from WB2 1 deg and hidden tests from ARCO 0.25 deg; the kit's `build_dataset.py` claims both are made consistent (4-point averaging to 1 deg cell centres). Small systematic differences between the two paths are possible, which is one reason to avoid overfitting to fine-scale training statistics.

### Gaps
- Exact existence/time range of the WB2 360x181 store not confirmed from the docs read (only first ~100k chars).
- Google Cloud ERA5 public-dataset page not fetched (redirected).

## Q5. ERA5 licence: CC BY 4.0 attribution in one line

### Takeaway
The kit NOTICE states ERA5 is CC BY 4.0 and uses the standard Copernicus wording ("Contains modified Copernicus Climate Change Service information"); I could not fetch a primary ECMWF/Copernicus page confirming the CC BY 4.0 terms this session.

### Cited Findings
- Kit NOTICE: "Contains modified Copernicus Climate Change Service information (ERA5, Hersbach et al. 2020), accessed through Google WeatherBench 2 (Rasp et al. 2024). ERA5 is licensed under CC BY 4.0." — [NOTICE](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/blob/main/NOTICE)
- A third-party licence page states "ERA5 data is generated by the Copernicus Climate Change Service" and that neither the European Commission nor ECMWF is responsible for any use made of it, pointing to the Copernicus Licence; it does not confirm CC BY 4.0. — [Contrails API licences](https://apidocs.contrails.org/licenses.html)
- Primary licence pages located but not fetched: [ECMWF ERA5 licence](https://apps.ecmwf.int/datasets/licences/era5), [ECMWF Confluence licence page](https://confluence.ecmwf.int/x/l-xCDQ).

### Inferences
- Suggested one-line attribution for the team brief/README (mirrors NOTICE): "Contains modified Copernicus Climate Change Service information [2026]; neither the European Commission nor ECMWF is responsible for any use of this information (ERA5, Hersbach et al. 2020, via WeatherBench 2, Rasp et al. 2024; CC BY 4.0)."

### Gaps
- CC BY 4.0 status of ERA5 not verified from an ECMWF/Copernicus primary page in this session (the kit asserts it; my background knowledge is that ECMWF moved Copernicus data to CC BY 4.0, but that is unverified here).
