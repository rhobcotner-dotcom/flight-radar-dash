# Camera Pipeline Status

Final inventory after the HLS sweep (June 2026). Counts come from a full-pool fetch across the US bbox (`west: -180, south: 18, east: -66, north: 72`) using `fetchDirectCameras()`.

## Summary

| Metric | Value |
|--------|------:|
| States + DC with any camera feed | **41 / 51** |
| Dark (no mapped cameras) | **10** |
| Total mapped cameras | **~41,450** |
| Mapped HLS URLs (`mediaType: hls`) | **~14,070** |
| Mapped snapshot URLs | **~26,900** |
| Weather cameras (AlertWest overlay) | **~600** |

**Estimated working HLS streams:** ~13,000–14,000 nationwide. Most HLS feeds are on Wowza/skyvdn/CDOT/CARS infrastructure with 80–100% probe success on verified states. Dead HLS URLs fall back to snapshot previews where the feed provides them (NY, IA, KS, NV, IN, MO).

---

## VERIFIED_HLS_OVERRIDES (final)

Per-state verified HLS cap (`96` unless noted). Default for unlisted HLS states is `24`.

| State | Cap | Basis |
|-------|----:|-------|
| WI | 96 | ~480 public cctv.dot.wi.gov HLS |
| OK | 96 | 386 streams; **20/20 probe OK** (final sweep) |
| MO | 96 | MoDOT ArcGIS + Springfield Ozarks HLS |
| AL | 96 | ALDOT Wowza HLS (~566 views) |
| MS | 96 | MDOT Wowza HLS (~1,030 views) |
| NV | 96 | NVRoads its.nv.gov HLS + snapshots |
| CO | 96 | CDOT CARS cotrip.org HLS (~815 views) |
| CA | 96 | Caltrans streamingVideoURL HLS (~1,957 views) |
| KS | 96 | KanDrive CARS skyvdn HLS (~191 HLS + snapshots) |
| IN | 96 | 511IN CARS trafficwise.org HLS (~737 views) |
| NY | 96 | 511NY skyvdn HLS (~1,544 views; ~95% reachability) |
| IA | 96 | Iowa DOT ArcGIS VideoURL HLS (~678 views) |
| VA | 96 | 511.vdot.virginia.gov HLS (~1,670 views; ~99% reachability) |
| TN | 96 | TDOT mcleansfs skyvdn HLS (~565 views; ~80% reachability) |
| SC | 96 | Iteris skyvdn HLS (~763 views) |
| DE | 96 | DelDOT video.deldot.gov HLS (356 views; **10/10 probe OK**) |

---

## HLS-primary states

States where the direct fetcher inventory is predominantly or exclusively HLS:

| State | HLS | Snap | Source |
|-------|----:|-----:|--------|
| OK | 386 | 0 | OKTraffic cameraPoles API |
| DE | 356 | 0 | DelDOT videocamera.json |
| VA | 1,670 | 0 | 511 Virginia GeoJSON |
| NY | 1,544 | 52 | 511NY getcameras (HLS + Url snapshot fallback) |
| MO | 1,717 | 13 | MoDOT ArcGIS + Ozarks streaming |
| CA | 1,957 | 5 | Caltrans ArcGIS |
| MS | 1,033 | 0 | MDOT LoadCameraData |
| SC | 763 | 0 | SC DOT Iteris geojson |
| IN | 737 | 2 | 511IN CARS |
| IA | 678 | 559 | Iowa DOT ArcGIS (mixed; HLS prioritized) |
| AL | 566 | 0 | ALDOT 511 |
| TN | 565 | 0 | TDOT ArcGIS |
| WI | 448 | 0 | 511WI list feed |
| CO | 812 | 0 | CDOT CARS |
| NV | 636 | 15 | NVRoads list feed |

---

## Snapshot-primary states

States in `SNAPSHOT_PRIMARY_STATES` — no public HLS in the feed (or auth-gated HLS ignored):

| State | Snap | Reason |
|-------|-----:|--------|
| FL | 4,867 | FL511 list — DIVAS HLS is auth-gated |
| GA | 4,043 | 511GA list — SKYLINE HLS is auth-gated |
| IL | 3,676 | Travel Midwest GTIS snapshots only |
| UT | 2,051 | UDOT 511 mapIcons `/map/Cctv/` |
| PA | 1,512 | 511PA mapIcons |
| OR | 816 | TripCheck RoadCams JPG (+ AlertWest weather overlay) |
| OH | 1,164 | OHGO multi-view snapshots |
| NC | 1,112 | DriveNC list — SKYLINE HLS auth-gated |
| WA | 715 | WSDOT ImageURL (+ AlertWest weather) |
| MI | 804 | MiDrive HTML snapshot URLs |
| ID | 740 | Idaho 511 mapIcons |
| AZ | 677 | AZ511 list snapshots |
| AK | 442 | 511 Alaska ArcGIS → `/map/Cctv/` previews |
| HI | 168 | HDOT ArcGIS → goakamai.org JPG snapshots |
| CT | 347 | CTroads mapIcons |
| LA | 336 | 511LA mapIcons |
| KY | 238 | Trimarc corridor snapshots |
| NM | 183 | NMRoads GetCameraImage |
| ME | 161 | New England 511 mapIcons |
| NH | 147 | New England 511 mapIcons |
| TX | 103 | Austin Mobility + Arlington local ArcGIS |
| SD | 190 | Iteris SD geojson snapshots |
| MA | 43 | New England 511 mapIcons |
| NE | 1,078 | 511NE CARS dot511.nebraska.gov STILL_IMAGE snapshots |
| WY | 4 | WYDOT ArcGIS JPEG links (sparse statewide coverage) |

**Not touched this sweep:** FL, GA, NC (auth-gated); OR, NE, WA, MT, SD, ND (confirmed snapshot-only or dark).

---

## Dark states (no mapped cameras)

| State | Reason |
|-------|--------|
| AR | iDrive Arkansas — no public mapIcons/getcameras API |
| MD | MDOT ArcGIS exists but chart.maryland.gov URLs return 404 |
| NJ | 511NJ mapIcons blocked; Turnpike layers not publicly queryable |
| ND | ND Roads — no public camera JSON feed |
| WV | WV511 dynamic CameraListing — no public JSON/snapshot pattern |
| DC | DDOT ArcGIS locations only — no free snapshot/stream URLs |
| MN | 511MN mapIcons unavailable; Travel Midwest returns 0 cameras in MN bbox |
| RI | New England 511 mapIcons feed has no RI-assigned cameras |
| VT | New England 511 mapIcons feed has no VT-assigned cameras |
| MT | Iteris MT geojson snapshots only — fetcher not registered (Iteris SD pattern exists) |

---

## Final mapper audit (Task 2)

Audited fetchers for **LA, CT, PA, ME, NH, RI, VT, NM, OH, MI, WY, TX, KY, MN**:

| State | Fetcher | IN-bug pattern? | Unmapped HLS fields? | Action |
|-------|---------|-----------------|----------------------|--------|
| LA | `fetchMapIcons511Cameras` | No | No — mapIcons snapshot only | None |
| CT | `fetchMapIcons511Cameras` | No | No | None |
| PA | `fetchMapIcons511Cameras` | No | No (list feed returns empty `data`) | None |
| ME | NE511 mapIcons | No | No | None |
| NH | NE511 mapIcons | No | No | None |
| RI | NE511 mapIcons | N/A | Feed has 0 RI cameras | None |
| VT | NE511 mapIcons | N/A | Feed has 0 VT cameras | None |
| NM | `mapNewMexicoCamera` | No | No — GetCameraImage JPEG only | None |
| OH | `mapOhgoSite` | No | No — SmallURL/LargeURL snapshots only | None |
| MI | MiDrive list parser | No | No — HTML img src snapshots only | None |
| WY | WYDOT ArcGIS | No | No — Camera_Link JPEG only | None |
| TX | Austin + Arlington ArcGIS | No | No — SCREENSHOT_ADDRESS / Pic_URL only | None |
| KY | `fetchTrimarcCameras` | No | No — snapshot field only | None |
| MN | Travel Midwest (shared) | No | GTIS has SnapShot only; 0 MN features | None |

**Fixes applied this session:** DE added to `VERIFIED_HLS_OVERRIDES` (96 cap). No mapper code changes — no confirmed IN-bug or missed HLS fields in audited states.

---

## Final sweep probe notes (Task 1)

### OK (OKTraffic)
- **Inventory:** 386 HLS cameras via `oktraffic.org/api/cameraPoles`
- **Probe:** 20/20 success (100%) on `stream.oktraffic.org` manifests
- **Mapper:** HLS-only — feed has no preview/snapshot fields (`streamDictionary.streamSrc` only). Already sets `liveUrl` + `streamUrl`. Additive pattern N/A (no snapshots in API).
- **Cap:** OK: 96 unchanged

### DE (DelDOT)
- **Inventory:** 356/356 rows have `urls.m3u8s` (100%)
- **Probe:** 10/10 success on `video.deldot.gov` HTTPS manifests
- **Mapper:** HLS-only — no `urls.jpg` in feed. `pickMediaUrl(m3u8s, m3u8)` → `normalizeCamera` infers `liveUrl`. Not an IN-bug; additive N/A.
- **Cap:** DE: 96 added

### NY skyvdn regional split
- **Prior 100-sample probe:** Downstate 92%, Western/Central 100%
- **Fresh 30-sample reprobe per region:** NYC 93%, Downstate 93%, Western/Central 90%, Upstate 100%
- **Conclusion:** Regional differences are **noise at sample size** — failures are consistently dead URLs (timeout both reprobes), not geography-dependent. No regional cap or routing changes warranted. Existing HLS→snapshot fallback handles dead skyvdn.

### AK (511 Alaska)
- **ArcGIS fields (10-row `outFields=*`):** `Url` points to `511.alaska.gov/map/Cctv/{Id}` — same as constructed snapshot path. Weather telemetry fields present; **no HLS/m3u8/stream fields**.
- **Status:** Snapshot-only confirmed

### HI (HDOT)
- **ArcGIS fields:** `URL` = goakamai.org JPG snapshot; `camerastill` = shared ArcGIS placeholder (not per-camera). **No video stream fields**.
- **Status:** Snapshot-only confirmed

---

## Known gaps and future opportunities

1. **MN** — No working public feed; Travel Midwest GTIS has zero features in MN envelope; 511MN mapIcons blocked.
2. **RI / VT** — New England 511 mapIcons feed assigns cameras to ME/NH/MA/NY only; dedicated RI/VT feeds not found.
3. **MT** — Iteris snapshot geojson exists (same vendor as SD/SC) but no fetcher registered.
4. **TX statewide** — Only Austin + Arlington local feeds (~103 cameras); no TxDOT statewide pool.
5. **WY** — Sparse ArcGIS coverage (4 cameras in full US fetch); additional wyoroad.info webcams partially mapped.
6. **Road511 API** — Optional aggregator when `ROAD511_API_KEY` is set; not counted in direct inventory above.
7. **Auth-gated HLS** — FL, GA, NC publish HLS URLs in list feeds but require DIVAS/SKYLINE authentication; intentionally snapshot-only.

---

## Do-not-touch list (this sweep)

- **Auth-gated:** FL, GA, NC
- **Confirmed snapshot-only / dark:** OR, NE, WA, MT, SD, ND
- **Credential feeds:** Any feed requiring account creation or API keys beyond optional Road511
