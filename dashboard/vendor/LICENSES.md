# dashboard/vendor — Third-party Licences

## Runtime dependencies

**None.**

The W2 dashboard is implemented in pure HTML5 and ES2020 module JavaScript
with no vendored third-party runtime libraries. All modules in
`dashboard/js/` (excluding the W3-owned `dashboard/js/ui/` directory) are
original W2-authored code.

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
