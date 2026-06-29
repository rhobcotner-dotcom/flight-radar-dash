# Emergency city & national incident coverage audit

Last reviewed: **2026-06-29** (three-track expansion: ArcGIS sweep, PulsePoint v1 API, Dallas geocoding).

Implementation: `api/lib/emsIncidentFeeds.js` aggregates **Socrata** (`cityEmsFeeds.js`), **ArcGIS FeatureServer** (`arcgisEmsFeeds.js`), and **PulsePoint** stub (`pulsePointIncidents.js`) → `/api/live/emergency-services` → map **Emergency services** overlay.

Probe script: `node scripts/probe-emergency-coverage.mjs`

| Column | Meaning |
|--------|---------|
| **Source type** | socrata · arcgis-featureserver · pulsepoint · nfirs/neris · cad-vendor · state-portal · county-911 · scanner-audio |
| **Coords** | yes · no · borough-centroid · inferred |
| **Recency** | real-time · hours · days · stale · static |
| **Wire status** | **WIRED** · **DISABLED** · **GAP** · **BLOCKED** |

---

## Wired sources (live coordinates)

| ID | City / region | Source type | Coords | Recency | Wire status | Endpoint |
|----|---------------|-------------|--------|---------|-------------|----------|
| `seattle-fire-911` | Seattle, WA | Socrata | yes | ~5 min | **WIRED** | `data.seattle.gov/.../kzjm-xkqj` |
| `nyc-fdny` | NYC | Socrata | borough centroid | portal ~90d lag | **WIRED** (stale labeled) | `data.cityofnewyork.us/.../8m42-w767` |
| `san-diego-sdfd-cad` | San Diego, CA | ArcGIS CAD | yes | live CAD | **WIRED** | `webmaps.sandiego.gov/.../SDFR/FireMap_Incidents` |
| `montgomery-county-pa-911` | Montgomery County, PA | ArcGIS 911 | yes | live dispatch | **WIRED** | `services1.arcgis.com/.../Montgomery_County_911_Incidents` |
| `flagler-county-fl-emergency` | Flagler County, FL | ArcGIS | yes | active points | **WIRED** | `services3.arcgis.com/.../mydata2` |
| `dallas-fire-dispatch` | Dallas, TX | Socrata + Census geocode | partial (~19% rows) | live dispatch | **WIRED** | `dallasopendata.com/.../9fxf-t2tr` |
| `pulsepoint-*` (81 agencies) | 34 US metros | PulsePoint v1 API | yes | live | **WIRED** | `api.pulsepoint.org/v1/webapp` — see roster below |

**National wired count with map points:** 8 Socrata/ArcGIS feeds + **81 PulsePoint agencies** across 34 metros (+ NYC borough centroids). Dallas partial geocode.

---

## Angle 1 — ArcGIS REST / Hub

Many agencies publish CAD or 911 layers as **FeatureServer** even without Socrata. Probed via ArcGIS Online search + direct REST catalog scans.

### Priority cities — results

| Target | Finding | Coords | Recency | Wire status |
|--------|---------|--------|---------|-------------|
| **Los Angeles / LA County** | LAFD `firegis.lafd.org` — 2024 **aggregate** incident points only; `n44u-wxe4` metrics lack lat/lon | no live | static/aggregate | **GAP** |
| **Dallas** | Socrata `9fxf-t2tr` live text dispatch | partial (Census) | real-time | **WIRED** — intersections geocode (~19%); no secondary ArcGIS incident layer found |
| **Houston** | No public live FeatureServer incident layer found on COH GIS | — | — | **GAP** |
| **Phoenix** | `maps.phoenix.gov` REST catalog 404 / no public fire incidents layer | — | — | **GAP** |
| **Philadelphia** | OpenDataPhilly — no live CAD FeatureServer discovered | — | — | **GAP** |
| **San Antonio** | `qagis.sanantonio.gov/SAFD/CADWaterRescue` — water rescue subset only | partial | unknown | **GAP** (niche) |
| **San Diego** | **SDFR FireMap_Incidents** — service text: *"publishes live incident data from San Diego Fire-Rescue CAD"* | yes | **real-time** | **WIRED** |
| **San Jose** | No live dispatch FeatureServer on `data.sanjoseca.gov` | — | — | **GAP** |
| **Austin** | No `AFD_Incidents` at guessed ArcGIS Online paths | — | — | **GAP** |
| **Jacksonville** | No reachable public REST CAD layer | — | — | **GAP** |
| **Columbus** | `gis.columbus.gov` REST unreachable / no incident layer | — | — | **GAP** |
| **Indianapolis** | `gis.indy.gov` REST 404 | — | — | **GAP** |
| **Charlotte** | `gis.charlottenc.gov` catalog — no incident-named services | — | — | **GAP** |
| **Memphis / Louisville / Baltimore** | Guessed `LFD_Incidents` / `BFD_Incidents` FeatureServer URLs → Invalid URL | — | — | **GAP** |
| **Milwaukee / Albuquerque / Tucson / Fresno / Sacramento** | No confirmed live CAD FeatureServer at probed paths | — | — | **GAP** |
| **Mesa / Kansas City / Atlanta** | REST catalogs reachable but no live incident layers in name scan | — | — | **GAP** |
| **Omaha / Colorado Springs / Raleigh / Long Beach / Virginia Beach / Minneapolis** | Not confirmed in this pass — ArcGIS Hub search returned no live CAD layers | — | — | **GAP** |
| **Montgomery County, PA** | **Montgomery County 911 Incidents** — fire/EMS/police dispatch with lat/lon (`outSR=4326`) | yes | **2026-06-28 dispatch times** | **WIRED** |
| **Flagler County, FL** | **Emergency Incident Points** — active incident ids `2026-*` | yes | inferred current | **WIRED** |
| **Washington DC** | `FEEDS/EMS_Fire_Incidents` → 404 Service not found | — | — | **GAP** |
| **Detroit** | `Fire_Incidents` FeatureServer — historical with **21-day publication delay** | yes | delayed | **GAP** (not live) |
| **Nashville** | `Nashville_Fire_Department_Active_Incidents_view` — **table only, no geometry** | no | unknown | **GAP** |
| **Chapel Hill** | Fire incidents by location — historical | yes | static | **GAP** |
| **Carbon County, WY** | Public incidents layer — **wildfire** events, not EMS CAD | yes | event-based | **GAP** (wrong domain) |
| **RapidDeploy** (`services2.arcgis.com/5aVZxf6eblRfH5Yb`) | Dispatch map **infrastructure layers**, not incident points | — | — | **GAP** (vendor basemap) |

**ArcGIS takeaway:** Live CAD FeatureServers exist but are **county/cluster scattered** (San Diego, Montgomery PA, Flagler FL). Major cities (Chicago, LA, Houston, Phoenix) generally **do not** expose live CAD to anonymous REST.

### National ArcGIS discovery sweep (2026-06-29)

Script: `node scripts/discover-arcgis-cad-feeds.mjs --limit 200` → `config/emergency-arcgis-discovery.json`

| Result | Count | Notes |
|--------|-------|-------|
| Probed FeatureServers | 80+ | ArcGIS Online search across priority states (FL, PA, TX, VA, NC, CO, WA, OR, AZ, GA, OH, MI, MN, WI, …) |
| **LIVE (24h) EMS CAD** | **0 new** | Existing 3 wired feeds remain the only confirmed live EMS CAD layers |
| LIVE wildfire (false positive) | 2 | WFTIIC Initial Attack (CA) — wildfire IA, not EMS |
| RECENT false positive | 1 | PAULIE (MN) — address points, not incidents |

### NEEDS_WORK — ArcGIS candidates (coords OK, not wired)

| Layer | URL | Issue |
|-------|-----|-------|
| **BRPD Ready_4_Life CAD** | `services7.arcgis.com/w9KefBd0vxjnp6IW/.../Ready_4_Life_CAD_Data` | Baton Rouge police CAD — **stale** (latest CallDate Nov 2024) |
| **Maine CAD Police** | `services3.arcgis.com/dty2kHktVXHrqO8i/.../CAD_Police` | Has coords; **no parseable recency field** |
| **RapidDeployDispatchMap_v3** | `services2.arcgis.com/5aVZxf6eblRfH5Yb/...` | Stale demo layers (Jan 2026 sample), infrastructure not incidents |
| **Crestwood IL CAD Map** | `services7.arcgis.com/uFAr0LUPy14bDaLg/...` | **Address points**, not dispatch incidents |
| **COSF Fire Incidences (ME)** | `services3.arcgis.com/y2BJK2GUfoTwH7py/...` | Historical (~May 2026), not live CAD |
| **County Active911Calls** (Wake, Fairfax, King, Maricopa, …) | Various guessed REST paths | **404, token required, or HTML** — need per-county portal discovery |

Config: `config/emergency-arcgis-feeds.json`

---

## Angle 2 — State open data portals

| State portal | Fire/EMS search | Coords | Recency | Wire status |
|--------------|-----------------|--------|---------|-------------|
| **California** `data.ca.gov` | No statewide live CAD incident layer with coordinates in catalog search | — | — | **GAP** |
| **Texas** `data.texas.gov` | CapMetro GTFS only in prior probes; no statewide EMS CAD | — | — | **GAP** |
| **Florida** `data.florida.gov` | County-level (Flagler) beats state aggregate | partial | — | use county ArcGIS |
| **New York** `data.ny.gov` | NYC Socrata stale; no statewide live layer | partial | stale | partial NYC |
| **Illinois** `data.illinois.gov` | Chicago real-time dataset **removed** (404) | — | — | **GAP** |
| **Pennsylvania** | Montgomery County ArcGIS (not state portal) | yes | live | **WIRED** (county) |
| **Ohio / Georgia / Michigan** | No statewide live EMS incident API identified | — | — | **GAP** |

**State takeaway:** States publish **historical NFIRS extracts** and dashboards, not live CAD maps. County ArcGIS is the better lever.

---

## Angle 3 — NFIRS / NEMSIS / NERIS

| System | Real-time public map API? | Notes | Wire status |
|--------|---------------------------|-------|-------------|
| **Legacy NFIRS** | **No** | Annual/batch exports to states; 2026 sunset in favor of NERIS | **GAP** |
| **NERIS** (successor) | **No public read API** | `api.neris.fsri.org` — OAuth **department credentials**; CAD **write** integration for enrolled FDs, not a national incident feed | **GAP** — register at [NERIS helpdesk](https://neris.atlassian.net/servicedesk/customer/portals) |
| **NEMSIS** | **No live public API** | EMS national database; hospital/EMS **reporting** system, independent of NERIS; no coordinate feed for mapping | **GAP** |

---

## Angle 4 — CAD vendors (Tyler, Central Square, Motorola, Spillman, RapidDeploy)

| Vendor | Public incident API? | Finding | Wire status |
|--------|---------------------|---------|-------------|
| **Tyler Technologies** | No national API | ArcGIS-hosted `TylerEPL` layers are **agency-specific** deployments, not multi-tenant | **GAP** |
| **Central Square / Motorola / Spillman** | No open multi-agency feed | Power 911 CAD for hundreds of agencies but feeds stay **behind agency GIS** or PulsePoint | **GAP** |
| **RapidDeploy** | ArcGIS layers probed | Map **infrastructure** only, not live incidents | **GAP** |
| **Embedded agency widgets** | Per-site HTML/JS | No stable URL pattern for systematic consumption; would require per-agency scraping (fragile, likely ToS issues) | **GAP** |

---

## Angle 5 — PulsePoint (national scale)

Last discovery: **2026-06-29** via `node scripts/discover-pulsepoint-agencies.mjs --write-config`

### API endpoints

| Endpoint | URL | Response (after AES decrypt) |
|----------|-----|------------------------------|
| **Search agencies** | `GET https://api.pulsepoint.org/v1/webapp?resource=searchagencies&token={query}` | `{ searchagencies: [{ Type, Display1, Display2, id, lat, lng, agencyid }] }` |
| **Incidents** | `GET https://api.pulsepoint.org/v1/webapp?resource=incidents&agencyid={id}` | `{ incidents: { active: [...], recent: [...], alerts: [...] } }` or `{ StatusCode, StatusMessage }` on error |

**searchagencies field reference:**

| Field | Example | Meaning |
|-------|---------|---------|
| `Type` | `"Agency"` | Result type |
| `Display1` | `"Seattle FD [WA]"` | Agency name + state in brackets |
| `Display2` | `"Seattle"` | Coverage area label |
| `id` | `"974"` | Internal PulsePoint id (not used for incidents fetch) |
| `lat` / `lng` | `47.6`, `-122.3` | Agency centroid |
| `agencyid` | `"17M15"` | **Use this** for `resource=incidents` |

**Incident fields:** `ID`, `AgencyID`, `Latitude`, `Longitude`, `PulsePointIncidentCallType` (`ME` = medical), `FullDisplayAddress`, `CallReceivedDateTime`, `Unit[]`.

### Discovery results (63 target metros)

| Metric | Count |
|--------|-------|
| Search queries run | 172 |
| Unique agencies matched + probed | **81** |
| **LIVE** (decrypt OK, incidents > 0) | **78** |
| **EMPTY** (decrypt OK, zero incidents) | **3** |
| **DEAD** (decrypt/HTTP failure) | **0** |
| Target metros with ≥1 agency | **34 / 63** |

**EMPTY agencies:** Atlanta `PID371` (Fulton Co 911), Fort Worth `PID337`, Seattle `17D50`.

**Metros with no PulsePoint agency found** (29): Boston, Providence, Hartford, New Haven, Albany, Buffalo, Philadelphia, Baltimore, Jacksonville, Tampa, Nashville, Memphis, Louisville, Birmingham, New Orleans, Detroit, Indianapolis, Minneapolis, St Louis, Des Moines, Dallas, Houston, San Antonio, Austin, Phoenix, Albuquerque, Denver, Colorado Springs, Salt Lake City.

**High-coverage metros (multi-agency):** Los Angeles (15+ LA County/LAFD layers), Seattle (9), Spokane (8), San Diego (3), Portland (2), Las Vegas (2), Cleveland (2), Fort Lauderdale (2).

Full roster: `config/emergency-pulsepoint-agencies.json` (81 entries). Probe audit: `config/emergency-pulsepoint-discovery.json`.

### Community / GitHub sources researched

| Source | Finding |
|--------|---------|
| [Podskio/pulsepoint](https://github.com/Podskio/pulsepoint) | Documents `agency_id` from network tab; `getAgencyByLatLng` uses different keys than `agencyid` |
| [pulsepoint.org/respond-embed-example](https://www.pulsepoint.org/respond-embed-example) | iframe `agencies=07035,07090` comma-separated IDs |
| [adamcarrier/pulsepoint_scrape](https://github.com/adamcarrier/pulsepoint_scrape) | Hampton Roads-only hardcoded list |
| [TrevorBagels/PulsepointScraperV2](https://github.com/TrevorBagels/PulsepointScraperV2) | Scans all agencies on 12h schedule — no published ID manifest |
| Reddit r/amateurradio / r/RTLSDR | No consolidated national agency ID list found |

### Implementation

| Component | Detail |
|-----------|--------|
| Fetcher | `api/lib/pulsePointIncidents.js` — sequential stagger (`PULSEPOINT_FETCH_DELAY_MS`, default 150ms), 60s cache |
| Cap | `PULSEPOINT_MAX_AGENCIES` env var limits agencies polled per request |
| Auto-disable | After 3 consecutive errors, agency skipped for 30 minutes (logged) |
| Map | `PulsePointClusterLayer` — Leaflet marker clustering, rose=medical, orange=fire |
| Health | `GET /api/health/feeds?group=pulsepoint&probe=1` — per-agency LIVE/EMPTY/OFFLINE |
| Disable | `PULSEPOINT_ENABLED=false` |

Official partner API (`lifeapi.pulsepoint.com/RestApi/`) remains OAuth-gated — not used for incident map.

Config: `config/emergency-pulsepoint-agencies.json`

---

## Angle 6 — Broadcastify / OpenMHz

| Platform | Incident location API? | Finding | Wire status |
|----------|------------------------|---------|-------------|
| **Broadcastify** | **No** | Premium audio streams; API is calls/feeds metadata, **not geocoded incidents** | **GAP** |
| **OpenMHz** | **No** | Scanner audio aggregation; no public incident coordinate API | **GAP** |

Scanner audio could supplement **situational awareness** but not map pins without CAD correlation.

---

## Angle 7 — Top 50 counties (911 / dispatch open data)

Sampled county portals and ArcGIS Hub for live dispatch with coordinates:

| County | Finding | Wire status |
|--------|---------|-------------|
| **Montgomery PA** | Live 911 incidents | **WIRED** |
| **Flagler FL** | Emergency incident points | **WIRED** |
| **Los Angeles CA** | No live county CAD REST | **GAP** |
| **Cook IL (Chicago)** | Dataset removed | **GAP** |
| **Harris TX (Houston)** | No public live layer | **GAP** |
| **Maricopa AZ (Phoenix)** | Service not found | **GAP** |
| **San Diego CA** | City CAD (not county) | **WIRED** via city layer |
| **Orange CA / Dallas TX / etc.** | Dallas: live Socrata + partial Census geocode; no county ArcGIS CAD | Dallas **WIRED** (partial) |

### Track 3 — Dallas coordinate gap

| Item | Finding |
|------|---------|
| **Primary feed** | Socrata `9fxf-t2tr` — live rows, fields `location`, `nature_of_call`, `date` |
| **Secondary ArcGIS** | No Dallas Fire-Rescue incident FeatureServer found for spatial join |
| **Census geocoder** | Free `geocoding.geo.census.gov` — **intersections** (`A / B` → `A & B, Dallas, TX`) geocode; single street names fail (~19% of active rows) |
| **Wire status** | **WIRED** with `geocodeNote` on each incident |

Full top-50 sweep: most populous counties **do not** publish live geocoded 911 to anonymous APIs. Exceptions cluster around **progressive county GIS programs** (PA, FL) and **individual city CAD** (San Diego).

---

## Socrata city portal summary (Angle 0 baseline)

See `config/emergency-city-feeds.json` — 16 cities documented. **Seattle** live lat/lon. **NYC** wired with stale fallback. **Dallas** wired with partial Census geocoding. **Chicago, LA, Houston, Phoenix, Philly, SA, SD, SJ, Austin, JAX, Columbus, Indy, Charlotte** — **GAP**.

---

## How to expand coverage next

1. **ArcGIS Hub crawler** — `scripts/discover-arcgis-cad-feeds.mjs` (run with higher `--limit`, add county portal URL list for pop>100k counties).
2. **PulsePoint agency registry** — expand `searchagencies` sweep for top-50 metros; wire agency IDs as found.
3. **Dallas geocoding** — add block-level geocoder or Dallas open address dataset to improve beyond intersection-only Census matches.
4. **NERIS read API** — if USFA publishes public incident query endpoints post-2026 onboarding, wire when available.
5. **County 911 consortium feeds** — target PA, FL, MD, VA counties with demonstrated ArcGIS 911 layers.

---

## API & health

- Live data: `GET /api/live/emergency-services?lat=&lon=&radiusMiles=`
- Feed health: `GET /api/health/feeds?group=emergency&probe=1`
- Master coverage: `docs/COVERAGE_MAP.md`

---

## Tests

```bash
node --test tests/emergencyEnrichment.test.js tests/feedHealth.test.js
node scripts/probe-emergency-coverage.mjs
```
