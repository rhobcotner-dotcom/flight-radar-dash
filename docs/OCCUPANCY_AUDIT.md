# Occupancy / load audit — HomeScope data sources

Last reviewed: 2026-06-29 (hardening pass). Every tracked entity gets `occupancyLabel` (+ optional `occupancyLevel` 0–100) when the feed or a defensible proxy supports it.

Implementation: `api/lib/occupancyEnrichment.js` → attached in each fetcher → map **Occupancy overlay** toggle (`web/src/components/OccupancyOverlayLayer.tsx`) + popouts via `occupancyUtils.ts`.

National GTFS-RT scanner: `api/lib/gtfsOccupancyScanner.js` + `scripts/probe-occupancy-national.mjs`. Feed health: `GET /api/health/feeds?group=transit&probe=1`.

---

## Live GTFS-RT crowding (real agency data)

Protobuf-level probe checks `hasOwnProperty('occupancyStatus')`, `occupancyPercentage`, and trip `departure_occupancy_status`.

| Feed | Class | Occupancy on wire | Notes |
|------|-------|-------------------|--------|
| **MBTA** | **REAL** | ✅ `occupancy_status` (JSON snake_case) | ~65% of vehicles; wired in `gtfs-rt-rail-feeds.json` |
| **SEPTA** | **REAL** | ✅ `occupancy_status` enum | ~62% of vehicles |
| **RTD Denver** | **REAL** | ✅ `occupancy_status` enum | ~83% of vehicles |
| **511 BART/Caltrain/ACE/SMART** | **GAP** | ❌ SIRI VehicleMonitoring only | GPS/route — no crowding in 511 JSON |
| **King County Metro** | **GAP** | ❌ | OBA feed reachable; no occupancy on wire |
| **Sound Transit** | **GAP** | ❌ | OBA agency 40; no occupancy |
| **Metro Transit MN** | **GAP** | ❌ | APC not exported publicly |
| **Metro St. Louis** | **GAP** | ❌ | Internal APC; public `.pb` omits occupancy |
| **MTA LIRR / MNR** | **GAP** | ❌ | Commuter positions without crowding |
| **TriMet / LA Metro / CTA / WMATA / Metra** | **UNKNOWN/SKIPPED** | ⏸ | Requires API keys — see `api/lib/transitAgencies.js` `AGENCY_KEY_DOCS` |
| **DART, Houston, MARTA, Miami-Dade, PACE, NJ Transit, PATH, Muni, OCTA, etc.** | **ERROR/OFFLINE** | ❌ | Re-probed 2026-06-29: most URLs 404/500/unreachable — not occupancy absence |

**2026-06-29 national probe:** Only **MBTA, SEPTA, RTD Denver** return REAL occupancy. Nine feeds reachable as GAP (positions, no crowding). TriMet 403 without key; LA Metro Swiftly 404 without key; DART/MARTA/SF Muni/PACE/NJ/PATH/OCTA/Houston fail at HTTP layer.

**Wired real sources:** MBTA, SEPTA, RTD (rail pipeline) + national scanner for overlay.

---

## Amtrak

| Source | Class | Signal |
|--------|-------|--------|
| Public GPS/schedule APIs | **GAP** | No coach load on wire |
| Booking UI capacity % | **INFERRED** | Purchase-time only |
| Commercial seat APIs | **INFERRED** | Not live onboard occupancy |

---

## Airports / flights

| Source | Class | Signal |
|--------|-------|--------|
| ADS-B | **INFERRED** | Phase + typical seats |
| MyTSA API | **GAP (2026)** | Redirects offline — `api/lib/tsaWaitTimes.js` wired with checkpoint fallback |
| Airport authority sites | **OPPORTUNITY** | Per-airport wait JSON/HTML |
| Gate crowding | **GAP** | No open gate-density API |

---

## Vessels (AIS)

| Source | Class | Signal |
|--------|-------|--------|
| Axiom `draft` | **REAL field** | Live draft meters |
| Type max draft ratios | **INFERRED** | `config/vessel-max-draft-ratio.json` → load % |
| MMSI spec / DWT lookup | **GAP** | VesselFinder & MarineTraffic DWT/deadweight require paid API — not available free |

---

## Roads & traffic volume

| Source | Class | Signal |
|--------|-------|--------|
| MoDOT | **INFERRED capacity** | Closures/delays wired |
| INRIX / HERE | **COMMERCIAL** | Not open |
| State 511 / PeMS | **OPPORTUNITY** | Speed/travel-time → utilization proxy |

---

## National Coverage Gaps and Opportunities

### Priority actions

1. **GTFS-RT keys + URL refresh** for CTA, WMATA, TriMet, LA Metro, Houston, MARTA — re-probe with `scripts/probe-occupancy-national.mjs`.
2. **TSA per-airport feeds** when MyTSA is down — STL/ORD/ATL authority pages.
3. **MMSI max-draft cache** for AIS load ratio.
4. **511 speed → corridor fill** where state DOT exposes travel time.

### Env keys

See `.env.example`: `API_511_KEY`, `WMATA_API_KEY`, `CTA_API_KEY`, `METRA_API_TOKEN`, `TRIMET_APP_ID`, `LA_METRO_SWIFTLY_KEY`, `OBA_API_KEY`, `RAILSTATE_API_TOKEN`.

### UI — Occupancy overlay

Map layer **Occupancy overlay**: solid circles = measured (`gtfs-rt`, `tsa-wait`, crossings, RailState); dashed = inferred. Green→red by `occupancyLevel`. API: `/api/live/occupancy`.

---

## Tests

```bash
node scripts/probe-occupancy-national.mjs
npm test
```
