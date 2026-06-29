# St. Louis metro fire & EMS dispatch probe

Last reviewed: **2026-06-29**

Probe script: `node scripts/probe-stl-dispatch-coverage.mjs --write`  
Machine output: `config/stl-dispatch-probe.json`

| Class | Meaning |
|-------|---------|
| **LIVE** | PulsePoint or ArcGIS returning active incidents with coordinates now |
| **EMPTY** | PulsePoint agency wired and reachable, zero active incidents at probe time |
| **STALE** | Structured layer exists but newest timestamp >4 hours old |
| **PARTIAL** | Data exists without reliable coords or wrong domain (traffic/311) |
| **GAP** | Dead URL, blocked API, or no public feed found |

---

## Executive summary

**Root cause of “dark STL”:** PulsePoint **does** cover most St. Louis County fire protection districts via agency IDs `095xx`, but the original metro discovery only searched `"St Louis"` / `"Saint Louis Fire"` — which returned **out-of-state false positives** (e.g. Lancaster County PA when searching “Kirkwood”) and **missed the county FPD registry entirely**.

**Fix applied:** Wired **25** St. Louis County PulsePoint agencies into `config/emergency-pulsepoint-agencies.json` (2 **LIVE**, 23 **EMPTY** at probe time). Active incidents now produce map dots with GPS coordinates from PulsePoint.

**Still no feed found for:**

- St. Louis **City** Fire Department (separate from county FPDs)
- **Kirkwood** Fire (no MO PulsePoint agency; Kirkwood search → PA only)
- **Jennings** Fire
- **Rock Community** / **Central County** FPDs (no PulsePoint match)
- **Metro East IL** (St Clair, Madison, Belleville, Edwardsville — **0** IL PulsePoint agencies)
- St. Louis County **Police** dispatch (no public API)
- **MSHP Troop C** live incident GIS
- Any **ArcGIS live CAD** layer for STL city/county

---

## Wired — PulsePoint (25 agencies)

All poll via existing `api/lib/pulsePointIncidents.js` · health group **`pulsepoint`**.

| Agency ID | Agency | Primary area | Probe status | Sample active call (2026-06-29) |
|-----------|--------|--------------|--------------|----------------------------------|
| **09539** | Affton Fire | Affton, Marlborough | **LIVE** | S LACLEDE STATION RD, MARLBOROUGH, MO |
| **09522** | Richmond Hts Fire | Richmond Heights | **LIVE** | DALE AVE, RICHMOND HEIGHTS, MO |
| 09504 | Mehlville Fire | Oakville, Lemay, Sunset Hills | EMPTY | — |
| 0950x | Pattonville Fire | Bridgeton, Maryland Heights | EMPTY | — |
| 09530 | Black Jack Fire | Florissant | EMPTY | — |
| 09531 | Florissant Vly Fire | Florissant | EMPTY | — |
| 09501 | Robertson Fire | Hazelwood | EMPTY | — |
| 09525 | Clayton Fire | Clayton | EMPTY | — |
| 09523 | Shrewsbury Fire | Shrewsbury / south inner ring | EMPTY | — |
| 09514 | West Co Fire/EMS | Ballwin, Manchester, Winchester | EMPTY | — |
| 09507 | Metro West Fire | Chesterfield, Ballwin | EMPTY | — |
| 09510 | Creve Coeur Fire | Creve Coeur | EMPTY | — |
| 09521 | Monarch Fire | Creve Coeur | EMPTY | — |
| 09511 | Maplewood Fire | Maplewood | EMPTY | — |
| 09533 | University City Fire | University City | EMPTY | — |
| 09506 | Ladue Fire | Ladue | EMPTY | — |
| 09502 | Valley Park Fire | Valley Park | EMPTY | — |
| 09505 | Spanish Lake Fire | Spanish Lake | EMPTY | — |
| 09544 | North County Fire | Riverview | EMPTY | — |
| 09527 | Maryland Heights FPD | Maryland Heights | EMPTY | — |
| 09540 | Hazelwood Fire | Hazelwood | EMPTY | — |
| 09520 | Northeast Amb/Fire | Normandy / NE county | EMPTY | — |
| 09528 | Fenton Fire | Fenton | EMPTY | — |
| 09524 | Berkeley Fire | Berkeley | EMPTY | — |
| 09534 | Mid-County Fire | Pagedale, Wellston | EMPTY | — |

**Note:** Pattonville’s PulsePoint agency id is literally `0950x` (not a placeholder).

**Not on PulsePoint (confirmed dead end):**

| Target | Probe | Result |
|--------|-------|--------|
| Kirkwood FD | `searchagencies` Kirkwood | Only **Lancaster County 911 [PA]** — no MO agency |
| Jennings FD | `searchagencies` Jennings | **0** hits |
| St Louis City FD | `St Louis City`, `SLFD`, `City of St Louis Fire` | **0** MO hits |
| Rock Community FPD | `Rock Community` | **0** hits |
| Central County FPD | `Central County MO` | **0** hits |
| Metro East IL | Belleville, Edwardsville, St Clair, Madison County IL, East St Louis, O Fallon IL | **0** IL agencies |

---

## Angle 1 — ArcGIS / GIS portals

### ArcGIS Online search

Queries: `fire incidents St Louis County`, `911 dispatch St Louis`, `CAD St Louis County`, `St Clair County 911`, `Madison County Illinois fire`, `Missouri highway patrol incidents`

| Hit | URL | Class | Why |
|-----|-----|-------|-----|
| Montgomery Co PA 911 (false positive from broad index) | already wired nationally | — | Not STL |
| MO Sales Tax Boundaries | `services2.arcgis.com/kNS2ppBA4rwAQQZy/...` | GAP | Tax polygons, not dispatch |
| Ferguson historical layers | arcgis.com apps | GAP | Historical, not live CAD |
| Missouri First Responder COVID-19 | `services2.arcgis.com/jWXb6JPWtBjOCalT/...` | STALE | Pandemic-era static layer |

**No LIVE fire/EMS dispatch FeatureServer found for STL metro.**

### Direct GIS REST directories

| Portal | URL probed | Result |
|--------|------------|--------|
| St Louis County GIS | `https://gis.stlouisco.com/arcgis/rest/services` | **GAP** — connection failed / unreachable from probe network |
| St Louis City GIS | `https://stlouis-mo.gov/gis/rest/services` | **GAP** — HTTP 301 → HTML, not JSON REST catalog |
| St Clair County IL | `https://gis.co.st-clair.il.us/arcgis/rest/services` | **GAP** — HTML error page, not REST |
| Madison County IL | `https://gis.co.madison.il.us/arcgis/rest/services` | **GAP** — HTML error page, not REST |
| MODOT / MSHP GIS | `https://gis.modot.mo.gov/arcgis/rest/services` | **GAP** — connection failed |
| data.stlouisco ArcGIS host | `services.arcgis.com/8MUN8uU2L0O5p4j0/...` | **GAP** — Invalid URL / org not found |

---

## Angle 2 — County / city open data

| Source | URL | Result |
|--------|-----|--------|
| St Louis County open data | `https://data.stlouisco.com/` | **GAP** — redirects; no dispatch dataset surfaced in automated browse |
| STL Data regional portal | `https://www.stldata.org/api/views` | **GAP** — no 911/dispatch keywords in API response |
| Missouri data.mo.gov | `https://data.mo.gov/api/views?q=fire` | **GAP** — no STL live CAD dataset |
| St Louis City data | `https://www.stlouis-mo.gov/data.cfm` | **GAP** — HTTP **404** (page removed) |
| St Louis City Fire dept page | `https://www.stlouis-mo.gov/government/departments/fire/` | **GAP** — HTTP **404** |

---

## Angle 3 — CAD vendor embed pages (district websites)

Probed homepages + guessed paths (`/cad/currentcalls.aspx`, `/p2c/...`, `/active-calls`):

| District | URL | HTTP | CAD embed? |
|----------|-----|------|------------|
| Affton | `afftonfire.org` | fail | **GAP** — domain unreachable |
| Mehlville | `mehlvillefire.org` | fail | **GAP** |
| Pattonville | `pattonvillefire.org` | fail | **GAP** |
| Kirkwood | `kirkwoodfire.org` | 301 | **GAP** — no CAD keywords in HTML |
| Clayton | `claytonfire.org` | 200 | **GAP** — no public CAD table |
| Creve Coeur | `ccfire.org` | 200 | **GAP** — no public CAD table |
| Black Jack | `blackjackfire.org` | 200 | **GAP** — no public CAD table |
| Monarch, Robertson, U City, Maplewood, Ladue, Valley Park, Spanish Lake, West County EMS | various `*fire.org` | fail/404 | **GAP** |
| Maryland Heights | `marylandheights.com/.../fire-department` | not probed live | **GAP** — no known P2C pattern |
| St Louis City FD | `stlouis-mo.gov/.../fire/` | 404 | **GAP** |

**No Tyler P2C / CentralSquare / Spillman public CAD table found** on district sites checked. PulsePoint is the practical path for county FPDs.

---

## Angle 4 — St. Louis County Police / mutual aid

| Source | Result |
|--------|--------|
| St Louis County Police public CAD | **GAP** — no ArcGIS or open data layer; `stlouiscounty.com/government/county-police` unreachable from probe |
| Mutual aid via MSHP | **GAP** — see below |

---

## Angle 5 — Missouri State Highway Patrol Troop C

| Endpoint | Result |
|----------|--------|
| MSHP crash reports | `https://www.mshp.dps.mo.gov/MSHPWeb/PatrolDivision/Traffic/CrashReports` | **PARTIAL** — historical crash reports, not live dispatch map |
| MODOT GIS REST | `https://gis.modot.mo.gov/arcgis/rest/services` | **GAP** — unreachable |
| MODOT traveler incidents | Not STL-specific live fire/EMS | **GAP** — traffic collisions only |

Troop C does **not** publish a live geocoded fire/EMS mutual-aid feed suitable for map dots.

---

## Angle 6 — Missouri State Emergency Management (SEMA)

| URL | Result |
|-----|--------|
| `https://sema.dps.mo.gov/` | **GAP** — administrative site; no public live incident GIS/API for local fire/EMS |

---

## Angle 7 — Metro East (Illinois)

| County / city | GIS / PulsePoint | Result |
|---------------|------------------|--------|
| St Clair County | GIS REST + PulsePoint | **GAP** — both failed / zero agencies |
| Madison County | GIS REST + PulsePoint | **GAP** |
| Belleville, Edwardsville, Collinsville, East St Louis, O Fallon | PulsePoint search | **GAP** — 0 IL agencies |
| Illinois “strong county GIS” hypothesis | Not confirmed for live CAD in Metro East | **GAP** |

East St. Louis / Belleville remain **dark** until a county CAD layer or PulsePoint enrollment is found.

---

## Angle 8 — Broadcastify / OpenMHz / Waze

Same national conclusion as `docs/EMERGENCY_DISPATCH_EXPANSION.md`: **GAP** — no structured geocoded STL incident API.

---

## What would fix remaining gaps

| Gap | What would need to change |
|-----|---------------------------|
| **St Louis City FD** | City joins PulsePoint or publishes open CAD (Socrata/ArcGIS); separate from county `095xx` registry |
| **Kirkwood / Jennings** | District PulsePoint enrollment or county-wide consolidated feed |
| **Metro East IL** | St Clair/Madison county ArcGIS CAD layer or IL PulsePoint agencies |
| **County police mutual aid** | St Louis County 911 center public map API (currently none) |
| **ArcGIS path** | County GIS publishes `ActiveIncidents` FeatureServer on reachable host |

---

## Maintenance

```bash
# Re-run full STL probe
node scripts/probe-stl-dispatch-coverage.mjs --write

# Smoke wired PulsePoint (includes STL 095xx agencies)
node scripts/probe-emergency-coverage.mjs

# STL bbox spot check
curl 'http://localhost:3010/api/live/emergency-services?west=-90.6&south=38.5&east=-90.2&north=38.8' | jq '.sources.pulsepoint.count'
```

After API warm (~60–90s), expect **1–N** dispatch dots in St. Louis County when FPDs have active calls; count varies by time of day.

---

## Related

- `config/emergency-pulsepoint-agencies.json` — `pulsepoint-stl-*` entries
- `docs/EMERGENCY_DISPATCH_EXPANSION.md` — national expansion context
- `docs/COVERAGE_MAP.md` — master coverage totals
