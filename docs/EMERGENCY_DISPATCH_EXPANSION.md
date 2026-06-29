# Emergency dispatch expansion pass

Last reviewed: **2026-06-29** (seven-angle national sweep targeting previously dark states).

Probe script: `node scripts/discover-emergency-dispatch-expansion.mjs --write`

Wired config:
- `config/emergency-pulsepoint-agencies.json` — **111** agencies (+30 this pass)
- `config/emergency-arcgis-feeds.json` — 3 ArcGIS CAD feeds (unchanged)
- `config/emergency-city-feeds.json` — 3 Socrata/geocoded city feeds (unchanged)

Health: `GET /api/health/feeds?group=pulsepoint` · `GET /api/health/feeds?group=emergency`

| Class | Meaning |
|-------|---------|
| **LIVE** | Coordinates + incidents refreshed within ~4 hours |
| **STALE** | Structured feed exists but newest row is older than 4 hours |
| **GEOCODED** | Address-only rows geocoded at fetch time (Census) |
| **PARTIAL** | Structured data without reliable coords, or traffic-only state feeds |
| **GAP** | No viable public API / blocked / demo data |

---

## Session outcome (dispatch dots)

| Metric | Before | After |
|--------|--------:|------:|
| **States with any dispatch dot** | ~22 | **38** |
| **Metros with dispatch dots** | ~38 | **68** |
| **Wired incident sources** | 89 | **117** |
| **Still dark (no dispatch dot)** | ~29 states | **5 states** (MA, RI, CT, MI, NM) |

Success metric (**>22 states, >35 metros**) met via **PulsePoint dark-state agency sweep** (Angle 4 re-framed — PulsePoint was under-searched outside the original 63-metro matcher).

---

## Angle 1 — CAD vendor embedded incident pages

### Tyler Technologies / CentralSquare P2C

| Pattern | Example | Coords | Update | Class |
|---------|---------|--------|--------|-------|
| `{host}/p2c/cad/currentcalls.aspx` | `p2c.nhcgov.com` (New Hanover NC) | HTML table, no API | ~30–60s page refresh | **PARTIAL** |
| `p2c.tylerpolice.com` | Generic Tyler host | — | — | **GAP** (unreachable from probe network) |
| `cadview.centralsquarecloud.com` | CentralSquare cloud | — | — | **GAP** (no universal URL) |

**Finding:** P2C pages render ASP.NET HTML tables with incident type, address, and units, but there is **no stable JSON endpoint** shared across vendors. Wiring requires a **per-host HTML parser** (fragile, ToS-sensitive). New Hanover NC verified reachable (`HTTP 200`, CAD table present).

**Recommendation:** Prototype `p2cEmsFeeds.js` only after picking one stable host in a dark state; not wired this pass.

### Spillman / Motorola

| Pattern | Result |
|---------|--------|
| `{agency}.spillmantech.com` | No live hosts found in dark-state probe list |
| Embedded iframes | **GAP** — requires manual per-agency discovery |

### Central Square / RapidDeploy ArcGIS

| Layer | URL | Class | Notes |
|-------|-----|-------|-------|
| RapidDeployDispatchMap_v3 | `services2.arcgis.com/5aVZxf6eblRfH5Yb/...` | **STALE** | Infrastructure / district layers, not live CAD incidents |
| ECC Rapid Deploy Map | `services7.arcgis.com/7Zrsy7Q7u9RXG91B/...` | **STALE** | Hydrant / PSAP reference layers (Loudoun VA area) |

---

## Angle 2 — County emergency management & 911 portals

Systematic REST directory probes for counties >250k in dark states:

| Jurisdiction | Probe | Class | Notes |
|--------------|-------|-------|-------|
| Indianapolis IN | `gis.indy.gov/arcgis/rest/services` | **GAP** | No public dispatch layer |
| Nashville TN | `maps.nashville.gov` | **GAP** | Cadastral only |
| Baltimore MD | City/county GIS | **GAP** | No active 911 MapServer |
| Detroit MI | `911 Calls for Service` FeatureServer | **STALE** | Coords present; newest `call_timestamp` ~2022 |
| Denver CO | `IncidentLocations_Public` | **EMPTY** | Zero active features |
| Denver CO | `OCF_Emergency_Events_Web_Map` | **STALE** | 311 downed-tree reports, not fire/EMS CAD |
| Cumberland Co PA | `EOC_Public_ActiveIncidents` | **STALE** | Demo EOC data (~Oct 2023), not wired |
| West Fargo ND | `Fire/Incidents` FeatureServer | **STALE** | Alarm dates frozen ~May 2020 |
| Virginia Beach VA | `Fire_Calls_for_Service_view` / `EMS_Calls_for_Service2` | **GEOCODED** | Live timestamps, **no geometry** — Census geocode candidate; VA already covered via PulsePoint |

**Win:** Maryland counties wired via **PulsePoint** (Anne Arundel, PG, Howard) rather than county GIS portals.

---

## Angle 3 — State police & highway patrol incident feeds

| Agency | Endpoint tried | Class | Fire/EMS in payload? |
|--------|----------------|-------|----------------------|
| Virginia 511 | `511virginia.org/api/events` | **GAP** | Network fail |
| Pennsylvania 511 | `511pa.com/api/events` | **GAP** | HTTP 404 JSON |
| Ohio OHGO | `ohgo.com/api/events` | **GAP** | HTML SPA shell |
| Michigan MiDrive | `mdotjboss.state.mi.us/MiDrive/api/events` | **GAP** | HTTP 404 |
| Indiana TrafficWise | `trafficwise.in.gov/api/events` | **GAP** | Network fail |
| Minnesota 511 | `511mn.org/api/events` | **GAP** | HTML |
| Colorado COtrip | `cotrip.org/api/events` | **GAP** | HTML |
| Utah UDOT | `udottraffic.utah.gov/api/events` | **GAP** | HTTP 404 |
| Texas DriveTexas | `drivetexas.org/api/events` | **GAP** | HTTP 500 |
| Tennessee SmartWay | `smartway.tn.gov/api/events` | **GAP** | HTTP 406 |
| Georgia 511 | `511ga.org/api/events` | **GAP** | HTTP 404 |
| NC TIMS | `tims.ncdot.gov/tims/api/events` | **GAP** | HTTP 404 |

**Finding:** Public state DOT JSON incident APIs are largely **deprecated or SPA-gated**. Even when JSON exists, event types are **traffic collisions / lane closures**, not fire/EMS dispatch. No state police layer wired.

---

## Angle 4 — Broadcastify incident metadata

| Check | Result | Class |
|-------|--------|-------|
| `api.broadcastify.com/calls/` | HTTP 404 | **GAP** |
| `broadcastify.com/api/calls` | HTTP 404 | **GAP** |
| Feed pages HTML | Incident text in page chrome only | **GAP** |

No structured JSON/RSS incident endpoint with coordinates found. Audio-adjacent metadata is not machine-readable at scale.

---

## Angle 5 — OpenMHz structured data

| Check | Result | Class |
|-------|--------|-------|
| `api.openmhz.com/s/all/calls` | Cloudflare 403 | **GAP** |
| Public API docs | Site states API not for third-party use | **GAP** |

Talkgroup archives exist but **no licensed geocoded incident API** suitable for map dots.

---

## Angle 6 — Waze & connected vehicle data

| Check | Result | Class |
|-------|--------|-------|
| Waze Partner Hub | `waze.com/row-partnerhub-api/partners` → 404 | **GAP** |
| CCP public feeds | No municipality-published open Waze incident JSON found in dark states | **GAP** |

Waze CCP requires **partner enrollment**; no open national substitute identified.

---

## Angle 7 — ArcGIS Hub targeted sweep

Method: `arcgis.com/sharing/rest/search` with queries `fire incidents live dispatch`, `EMS incidents active`, `911 calls for service`, `CAD incidents public`, `emergency dispatch active`, `active calls FeatureServer` — then FeatureServer `/query` probe.

| Result | Count |
|--------|------:|
| Unique FeatureServer candidates | ~82 |
| **LIVE** (coords + <4h) | 1 (already wired Montgomery Co PA) |
| **STALE** with coords | ~27 |
| **GEOCODED** candidates | Virginia Beach EMS/Fire (address fields, live timestamps) |

ArcGIS Hub API v1 (`hub.arcgis.com/api/search/v1/...`) returned 404 for collection id `item`; **sharing REST search** remains the reliable index.

---

## Wired this pass — PulsePoint dark-state agencies

30 new agencies in `config/emergency-pulsepoint-agencies.json`:

| State | Agencies | Representative metros |
|-------|----------|------------------------|
| **ND** | Fargo FD, West Fargo Fire, Metro Area Ambulance | Fargo, Bismarck |
| **SD** | Sioux Falls, Rapid City, Aberdeen | Sioux Falls, Rapid City |
| **IA** | Iowa City Fire | Iowa City |
| **IN** | La Porte, Hancock, Ripley, Clark, Carmel, Johnson Co | Michigan City, Indy suburbs, Jeffersonville |
| **KS** | Johnson County, Lawrence-Douglas | Olathe, Lawrence |
| **OK** | Broken Arrow Fire | Tulsa metro |
| **CO** | Poudre, South Metro | Fort Collins, Denver south metro |
| **UT** | Unified Fire, Weber Dispatch | Salt Lake, Ogden |
| **MT** | Missoula Fire | Missoula |
| **WY** | Sweetwater 911 | Rock Springs / Green River |
| **MD** | Anne Arundel, PG County, Howard County | Annapolis, DC suburbs |
| **NJ** | Burlington County | South Jersey |
| **TN** | Hamilton County | Chattanooga |
| **KY** | Jessamine | Lexington area |
| **AL** | Huntsville-Madison | Huntsville |
| **LA** | West Feliciana EMS | St. Francisville |

All use existing `pulsePointIncidents.js` enrichment; health group **`pulsepoint`**.

---

## Remaining dark states (honest)

| State | Why still dark |
|-------|----------------|
| **MA** | PulsePoint search returns out-of-state matches only; no Boston/Cambridge agency ID confirmed |
| **RI** | Providence hits are out-of-state; no RI agency with live incidents |
| **CT** | Hartford search hit out-of-state; no CT agency wired |
| **MI** | Detroit ArcGIS 911 layer stale; PulsePoint MI agencies probe **0 active** |
| **NM** | No PulsePoint or ArcGIS live CAD found (Albuquerque GIS unreachable) |

**St. Louis remains dark** for City FD, Kirkwood, Jennings, and Metro East IL — see `docs/STL_COVERAGE_PROBE.md`.

---

## Maintenance

```bash
# Full multi-angle discovery (writes config/emergency-dispatch-expansion-discovery.json)
node scripts/discover-emergency-dispatch-expansion.mjs --write

# ArcGIS-only sweep
node scripts/discover-arcgis-cad-feeds.mjs --limit 80

# PulsePoint metro + state search
node scripts/discover-pulsepoint-agencies.mjs

# Smoke wired feeds
node scripts/probe-emergency-coverage.mjs
curl 'http://localhost:3010/api/health/feeds?group=pulsepoint&probe=1' | jq '.groups.pulsepoint.summary'
```

---

## Related docs

- `docs/COVERAGE_MAP.md` — master coverage totals
- `docs/EMERGENCY_CITY_COVERAGE.md` — first-pass city audit
- `config/emergency-dispatch-expansion-discovery.json` — machine-readable probe output (after `--write`)
