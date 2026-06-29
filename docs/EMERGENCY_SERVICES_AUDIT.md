# Emergency Services audit — HomeScope data sources

Last reviewed: 2026-06-29. Implementation: `api/lib/emergencyEnrichment.js` + `api/lib/emergencyServices.js` → `/api/live/emergency-services` → map **Emergency services** overlay. Feed health: `/api/health/feeds?group=emergency`.

Timing classes: **real-time** (minutes or less), **delayed** (minutes–hours), **static** (administrative records).

---

## NIFC / USFS WFIGS wildfire data

| Layer | Endpoint | Timing | Wired |
|-------|----------|--------|-------|
| **Interagency perimeters** | `services3.arcgis.com/.../WFIGS_Interagency_Perimeters` | **Real-time** (~5 min ArcGIS cache) | ✅ Polygons with containment %, acres, cause |
| **Incident locations** | `.../WFIGS_Incident_Locations` | **Real-time** | ✅ Point markers |

**On the wire:** `poly_IncidentName`, `attr_PercentContained`, `poly_GISAcres`, `attr_FireCause`, `poly_DateCurrent`, IRWIN IDs.

**Filters applied:** visible + approved perimeters, not 100% contained, geometry intersecting viewport, perimeter `poly_DateCurrent` within ~21 days. Query uses `orderByFields=poly_DateCurrent DESC` so the record limit is not filled by legacy IRWIN polygons from 2022–2023.

**Gap:** Historical perimeters remain in service with incomplete `FireOutDateTime`; date filter reduces noise but is not perfect. Without `orderByFields`, ArcGIS returns oldest records first and active perimeters can be missed entirely. **IRWIN legacy layer** duplicates many stale polygons — WFIGS is the authoritative operational feed; querying both is not recommended without deduplication. BLM/USFS/NPS incidents feed into WFIGS — no separate live perimeter API identified beyond WFIGS + FIRMS hotspots.

---

## FEMA active disaster declarations

| Source | Endpoint | Timing | Wired |
|--------|----------|--------|-------|
| **OpenFEMA v2** | `fema.gov/api/open/v2/DisasterDeclarationsSummaries` | **Static** (updated on declaration events) | ✅ County overlays |

**Filter:** `incidentEndDate eq null` (open incidents).

**County geometry:** Census TIGERweb `State_County` layer joined by `GEOID` from `fipsStateCode` + `fipsCountyCode`.

**Gap:** Declaration polygon ≠ damage footprint — county fill shows *eligible area*, not impact zone. **FEMA damage assessment polygons** and HAZUS structure layers are not published as a live national API for active incidents; OpenFEMA v2 declarations remain the best open administrative source.

---

## NWS watches / warnings / emergencies

| Source | Endpoint | Timing | Wired |
|--------|----------|--------|-------|
| **Existing weather alerts layer** | `api.weather.gov/alerts/active?area=MO,IL,IA,AR,KS` | Real-time | ✅ Separate layer (regional) |
| **Emergency services NWS feed** | `api.weather.gov/alerts/active?status=actual` (national) | **Real-time** | ✅ Viewport-filtered |

**Beyond existing layer:** National scope, explicit **watch vs warning vs emergency** styling plus **AMBER**, **911 outage**, **civil emergency**, and **law enforcement** CAP classes. CAP severity × urgency × certainty matrix drives popout level.

**Gap:** Alerts without polygon geometry are omitted. Same CAP feed backs both layers — emergency overlay is the nationwide + typed view.

---

## IPAWS All-Hazards feed

| Source | Endpoint | Timing | Wired |
|--------|----------|--------|-------|
| **Production CAP feed** | `apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/public/recent/{timestamp}` | **Real-time** (poll ~120s) | ✅ When alerts active |
| **Legacy REST** | `apps.tsa.dhs.gov/.../ipaws/...` | — | ❌ 404 |
| **OpenFEMA archived** | `fema.gov/api/open/v1/IpawsArchivedAlerts` | **Delayed** (24h+ lag) | Not wired (archive only) |

**On the wire:** CAP 1.2 XML — headline, event, severity, areaDesc, polygon when provided.

**Gap:** Empty feed is normal when no public alerts are active. **Circle geometry** now parsed from CAP `<circle>` when polygon absent. Full CAP registration on IPAWS User Portal recommended for production polling etiquette.

---

## City EMS / fire open data

| City | Dataset | Timing | Wired | Notes |
|------|---------|--------|-------|-------|
| **NYC FDNY** | NYC | Delayed/stale | ✅ Borough centroids | Portal lag ~90d |
| **Seattle** | `kzjm-xkqj` Real-Time Fire 911 | Real-time | ✅ Lat/lon | Best US Socrata feed |
| **San Diego** | ArcGIS `SDFR/FireMap_Incidents` | Real-time | ✅ Live CAD lat/lon | Wired via `arcgisEmsFeeds.js` |
| **Montgomery Co PA** | ArcGIS 911 Incidents | Real-time | ✅ Lat/lon | County-wide dispatch |
| **Flagler Co FL** | ArcGIS Emergency Incident Points | Real-time | ✅ Lat/lon | Active incident points |
| **Dallas** | `9fxf-t2tr` Active Fire Incidents | Real-time | ❌ | Live rows, **no coordinates** — needs geocoding |
| **Los Angeles** | `n44u-wxe4` + LAFD ArcGIS | Delayed/aggregate | ❌ | Metrics lack coords; ArcGIS 2024 aggregates only |
| **Chicago** | `dr26-vqib` (removed) | — | ❌ | 404; OIG weekly dashboards only |
| **Houston, Phoenix, Philly, SA, SD, SJ, Austin, JAX, Columbus, Indy, Charlotte** | — | — | ❌ | Researched 2026-06 — see `config/emergency-city-feeds.json` |

Config: `config/emergency-city-feeds.json`. Full multi-angle audit: **`docs/EMERGENCY_CITY_COVERAGE.md`**. ArcGIS CAD feeds: `config/emergency-arcgis-feeds.json`.

**NYC dataset lag (2026-06):** Latest rows in Socrata were from **2026-03-31**, not live dispatch. When `hoursBack` yields zero rows, `staleFallbackHours` (90 days) still surfaces the newest available records with status **“Dataset lag”** and timing class **static** so the feed is visible but honestly labeled.

---

## Coverage gaps and opportunities

1. **Chicago** — Find replacement dataset or partner API when `dr26-vqib` returns.
2. **LA** — Wire LAFD CAD feed with coordinates or geocode dispatch addresses.
3. **IPAWS** — Parse CAP circles/geocodes when polygons absent; add WEA-only feed variant.
4. **FEMA** — Add tribal / state-wide declaration shading without county FIPS.
5. **NIFC** — Pull ICS-209 narrative fields; link perimeters to incident points by IRWIN ID.
6. **EMS nationwide** — PulsePoint, Active911, and regional CAD APIs are mostly restricted — city Socrata feeds remain best open option.

---

## UI

Map layer **Emergency services** (Tracking section, off by default):

| Visual | Meaning |
|--------|---------|
| Orange/red filled polygons | Active wildfire perimeters (darker = less contained) |
| Orange dots | WFIGS incident points |
| Purple hatched counties | Open FEMA declarations |
| Red/yellow NWS polygons | Warnings / watches / emergencies |
| Rose dashed polygons | IPAWS CAP polygons |
| Blue dots | City EMS/fire dispatches |

Popouts: incident name, status, severity, source, timing class, containment/acres/cause where available.

---

## API & tests

```bash
curl "http://localhost:3010/api/live/emergency-services?lat=38.78&lon=-90.58&radiusMiles=500"
npm test -- tests/emergencyEnrichment.test.js
```
