# HomeScope coverage map

Last reviewed: **2026-06-29** (dispatch expansion pass). Canonical feed health: **`GET /api/health/feeds?probe=1`**.

Status classes: **LIVE** · **STALE** · **DEGRADED** · **OFFLINE** · **EMPTY** · **SKIPPED** · **DISABLED**

Timing: **real-time** (minutes) · **delayed** (minutes–hours) · **static** (administrative)

---

## How to check what's working

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Fast liveness + feature flags; points to feeds endpoint |
| `GET /api/health/feeds` | Cached telemetry + config gaps (fast) |
| `GET /api/health/feeds?probe=1` | Live probes — emergency aggregate, GTFS occupancy scan, platform HEAD checks |
| `GET /api/health/feeds?group=emergency\|transit\|platform` | Single domain |

Silent failures (HTTP 200 but zero useful entities) are logged server-side as `[feed:<id>] …` and surfaced in feed telemetry.

---

## Map layers — occupancy

| Source | Coverage | Status (2026-06-29) | Freshness | Improve with |
|--------|----------|---------------------|-----------|--------------|
| **MBTA** GTFS-RT | Boston / nationwide positions | **LIVE REAL** | ~45s cache | — |
| **SEPTA** GTFS-RT | Philadelphia region | **LIVE REAL** | ~45s cache | — |
| **RTD Denver** GTFS-RT | Denver metro | **LIVE REAL** | ~45s cache | — |
| King County Metro / Sound Transit | Seattle | **DEGRADED GAP** | Reachable, no occupancy on wire | Agency APC export or `OBA_API_KEY` |
| Metro Transit MN, Metro STL, MTA LIRR/MNR | Midwest / NYC commuter | **DEGRADED GAP** | Positions only | Agency policy change |
| **TriMet** | Portland | **SKIPPED** | Needs key | Free `TRIMET_APP_ID` at developer.trimet.org |
| **LA Metro Swiftly** | Los Angeles | **OFFLINE** | 404 without key | `LA_METRO_SWIFTLY_KEY` from goswift.ly |
| **CTA Bus** | Chicago | **SKIPPED** | Needs key | `CTA_API_KEY` from transitchicago.com developers |
| **WMATA / Metra** | DC / Chicago rail | **SKIPPED** | Needs keys | `WMATA_API_KEY`, `METRA_API_TOKEN` |
| DART, Houston, MARTA, Muni, PACE, NJT, PATH, OCTA, etc. | National expansion list | **OFFLINE** | URLs 404/500/unreachable | Re-probe via `node scripts/probe-occupancy-national.mjs`; many agencies no longer publish public `.pb` URLs |
| Amtrak / freight | US rail network | **INFERRED** | Dream-state heuristics | No open coach-load API |
| ADS-B flights | US viewport | **INFERRED** | Phase + seat models | Gate density APIs commercial only |
| **AIS draft ratio** | US waters | **INFERRED** | Live draft ÷ type max-draft ratio | MMSI-specific max draft lookup (VesselFinder/MarineTraffic DWT not available on free tier) |
| TSA wait times | US airports | **DEGRADED** | MyTSA offline; checkpoint fallbacks | Per-airport authority JSON |

**Vessel load note:** HomeScope uses **live AIS draft** from Axiom with **type-based max-draft ratios** (`config/vessel-max-draft-ratio.json`). VesselFinder and MarineTraffic expose DWT/deadweight only on paid API tiers — not wired.

---

## Map layers — emergency services

| Source | Coverage | Status | Freshness | Improve with |
|--------|----------|--------|-----------|--------------|
| **NIFC WFIGS** perimeters | US wildfire season | **LIVE** | ArcGIS ~5 min | IRWIN legacy layer optional; BLM/USFS publish through WFIGS — no separate live perimeter API needed |
| **NIFC WFIGS** incidents | US | **LIVE** | Same | — |
| **FEMA** county declarations | US counties | **LIVE static** | Admin cadence | FEMA damage assessment polygons not in OpenFEMA v2; NEMA/FEMA HAZUS layers are research-grade not live incident geometry |
| **NWS CAP** emergency overlay | US (polygon alerts) | **LIVE** | ~60s | Point/circle alerts still omitted on NWS GeoJSON |
| **IPAWS CAP** | US when active | **EMPTY/LIVE** | ~120s | Circle geometry now parsed; geocode-from-areaDesc still future |
| **NYC FDNY** | NYC borough centroids | **STALE** | Portal ~90d lag | Fresh Socrata rows or geocoded alarm boxes |
| **Seattle Fire 911** | Seattle | **LIVE** | ~5 min portal | — |
| **San Diego SDFR CAD** | San Diego | **LIVE** | ArcGIS live CAD | `config/emergency-arcgis-feeds.json` |
| **Montgomery Co PA 911** | Suburban Philadelphia | **LIVE** | dispatch timestamps | ArcGIS FeatureServer |
| **Flagler County FL** | Northeast Florida | **LIVE** | active incident points | ArcGIS FeatureServer |
| **Dallas Fire** | Dallas | **LIVE partial** | Census geocode ~19% | Block geocoder or address dataset |
| **PulsePoint** (136 agencies) | 68+ US metros incl. **St Louis County** | **LIVE** | ~60s cache, 150ms stagger | STL: 25 county FPD agencies wired 2026-06-29 |
| **Chicago, LA, Houston, Phoenix, Philly, SA, SD, SJ, Austin, JAX, Columbus, Indy, Charlotte** | — | **DISABLED** | Researched 2026-06 | See `config/emergency-city-feeds.json` gap notes |

NWS alert types now classified: **AMBER**, **911 outage**, **civil emergency**, **law enforcement**, plus watch/warning/emergency/advisory. CAP **severity × urgency × certainty** matrix drives popout level.

---

## Platform data sources (selected)

| Source | Coverage | Typical status | Notes |
|--------|----------|----------------|-------|
| adsb.lol | Global ADS-B | LIVE | Primary flight map |
| api.weather.gov | US weather/alerts | LIVE | Regional + emergency overlay |
| USGS earthquakes | Global | LIVE | — |
| NASA FIRMS | Global hotspots | LIVE/SKIPPED | Needs `NASA_FIRMS_MAP_KEY` for some endpoints |
| Axiom AIS | US waters | LIVE | Vessel positions + draft |
| Nationwide traffic cameras | US | DEGRADED | Pool warming; state 511 variance |
| Satellites (TLE) | Overhead pass | OFFLINE in CI | Celestrak fetch failures in test env |
| GTFS-RT rail (regional) | Configured metros | Mixed | See `config/gtfs-rt-rail-feeds.json` |

---

## Dark spots — honest summary

1. **GTFS-RT occupancy outside MBTA/SEPTA/RTD** — most US agencies reachable but **do not export** `occupancy_status`; many former public `.pb` URLs are **dead**.
2. **City EMS / dispatch dots** — **142 wired incident sources** (3 Socrata + 3 ArcGIS + 136 PulsePoint) across **38 states** and **68+ metros** with map dots. Five states still dark (MA, RI, CT, MI, NM) — see `docs/EMERGENCY_DISPATCH_EXPANSION.md`.
3. **FEMA geometry** — county eligibility ≠ damage footprint; no open live structure-damage polygon feed identified.
4. **IPAWS / NWS** — alerts without polygon/circle still invisible on map.
5. **Vessel load** — inferred from draft ratios, not vessel-specific DWT.
6. **St. Louis local dispatch** — **25 county FPD PulsePoint agencies wired** (2 live at probe); City FD, Kirkwood, Jennings, and Metro East IL still **GAP** — see `docs/STL_COVERAGE_PROBE.md`.
7. **Test suite** — 5 pre-existing integration failures (511 cameras, satellites, flightGroundLevel import) unrelated to new layers.

---

## Related docs

- `docs/OCCUPANCY_AUDIT.md` — GTFS-RT probe classes and API key registry
- `docs/EMERGENCY_SERVICES_AUDIT.md` — per-source emergency audit
- `config/feed-registry.json` — platform probe registry
- `docs/EMERGENCY_CITY_COVERAGE.md` — multi-angle national incident audit (ArcGIS, PulsePoint, NFIRS, counties)
- `docs/EMERGENCY_DISPATCH_EXPANSION.md` — 2026-06-29 seven-angle dark-state sweep (+16 states via PulsePoint)
- `docs/STL_COVERAGE_PROBE.md` — St. Louis metro deep dispatch probe (2026-06-29)
- `config/emergency-city-feeds.json` — Socrata city EMS config + gaps
- `config/emergency-arcgis-feeds.json` — ArcGIS CAD/911 feeds
- `config/emergency-pulsepoint-agencies.json` — 136 PulsePoint agencies (incl. 25 St Louis County FPDs, 2026-06-29)
- `config/emergency-pulsepoint-discovery.json` — full probe audit

---

## Maintenance commands

```bash
node scripts/probe-occupancy-national.mjs   # GTFS-RT occupancy re-probe
curl 'http://localhost:3010/api/health/feeds?probe=1' | jq '.summary,.gaps'
npm test -- tests/feedHealth.test.js tests/emergencyEnrichment.test.js
```
