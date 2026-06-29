export const MAP_LAYER_HELP = {
  flights:
    'All aircraft in the current map view from OpenSky + ADSB.lol — planes, jets, helicopters, and GA. Turn off to hide every flight marker while keeping other layers.',
  rail:
    'Amtrak, freight, crossings, and OpenStreetMap track lines for the current map view. Does not include urban metro/subway/commuter — use Metro for those.',
  metro:
    'Urban and regional transit rail nationwide: MetroLink, CTA, Metra, MBTA, SEPTA, WMATA, BART/511, Twin Cities, Denver RTD, LIRR/MNR, and more. Teal/red/amber dots for live vehicles; lilac lines for light-rail track geometry from OpenStreetMap.',
  weatherAlerts:
    'NWS warning polygons on the map: tornado, severe thunderstorm, flood, flash flood, winter, and heat alerts for MO/IL/IA/AR/KS. Refreshes every minute.',
  lightning:
    'Recent cloud-to-ground lightning strikes near your area (last ~30 min). White bolt icons flash when fresh and fade as strikes age. Source: Blitzortung.',
  helos:
    'Highlights helicopters on your existing ADSB feed: purple = general, pink = medevac, cyan = news, blue = law enforcement (best-effort callsign/type matching).',
  rivers:
    'Live USGS river gauge stage and flow on the Missouri/Mississippi near STL. Useful for flood context alongside weather alerts.',
  transit:
    'Deprecated map layer — MetroLink vehicles now use the Metro toggle. This checkbox no longer draws markers on the map.',
  roads:
    'Missouri DOT road conditions: closures, work zones, traffic delays, and winter impacts from mapping.modot.org. Red = closed, yellow = delay, cyan = winter.',
  aisVessels:
    'Large ships in the current map view (cargo, tanker, passenger, river tow) from Axiom AIS and optional AISHub. Pan to coasts, Great Lakes, or major rivers — light grey boat icons scale with zoom.',
  earthquakes:
    'USGS earthquakes in the last 24 hours within 500 mi. Orange circles scale with magnitude.',
  wildfires:
    'NASA FIRMS VIIRS wildfire hotspots within 200 mi. Requires free NASA_FIRMS_MAP_KEY from firms.modaps.eosdis.nasa.gov.',
  cameras:
    'US highway traffic cameras from state DOT feeds (Missouri DOT, ALDOT, MDOT, FL511, 511GA, AZ511, NVRoads, UDOT 511, CDOT, Idaho 511, NMRoads, Travel Midwest GTIS, OKTraffic, etc.). Hover for a snapshot; click for live video.',
  weatherCameras:
    'Sky- and landscape-facing weather cameras (ALERTWest, Wyoming scenic, optional Windy). Teal sun icons — hover for a snapshot, click for details and live view when available.',
  railCameras:
    '240+ rail cameras from YouTube networks. Hover shows a thumbnail still; click a dot for the live YouTube feed in the popup.',
  riverForecast:
    'NOAA NWPS river forecast gauges with flood categories and crest forecasts on the Missouri/Mississippi/Meramec. Complements USGS stage dots.',
  ebird:
    'Recent eBird observations within 25 mi. Requires free EBIRD_API_KEY from ebird.org/api/keygen — great during migration season.',
  inaturalist:
    'Recent iNaturalist wildlife/plant observations near you — coyotes, mushrooms, weird bugs. No API key required.',
  aprs:
    'Ham radio APRS positions (weather stations, balloons, vehicles). Requires free APRS_FI_API_KEY from aprs.fi account settings.',
  drought:
    'US Drought Monitor polygons (IEM) — shows abnormally dry through exceptional drought areas near STL.',
  railNetwork:
    'OpenStreetMap track geometry. Gray = freight/mainline rail (Rail toggle). Lilac/purple = light rail & tram (Metro toggle). Blue/red = subway. Enable this layer to show all track types regardless of Rail/Metro.',
  satellites:
    'Satellites above 5° elevation at your location (ISS, GPS, weather sats, etc.). Positions computed from CelesTrak TLEs — not ground tracks.',
  occupancy:
    'Capacity/crowding heat overlay on the map. Solid circles = measured agency data (GTFS-RT crowding, TSA waits, crossing sensors). Dashed circles = inferred proxies (flight phase, AIS draft ratio, river fill, road impact). Green → red ramp by load %.',
  emergencyServices:
    'NIFC/USFS wildfire perimeters (containment %, acres, cause), FEMA active disaster counties, nationwide NWS watches/warnings/emergencies, IPAWS public alerts, and city fire/EMS dispatches (NYC, Seattle). Orange/red polygons = active fire; purple = FEMA; NWS/IPAWS polygons by severity.',
  radar:
    'NEXRAD base reflectivity overlay (IEM, ~3–5 min scan lag). Composite tiles scale above zoom 9; with Radar on, click a storm cell for a meteorologist-style briefing (clear sky clicks do nothing). Between refreshes, recent frames are blended so echoes drift smoothly instead of jumping.',
  stormLiveOnly:
    'Storm cell briefings: when on, only verified live HLS/YouTube cameras are shown. Turn off to also allow DOT snapshot previews where live streams are unavailable (FL511, 511GA, AZ511, etc.).',
} as const;

export const PANEL_HELP = {
  home:
    'Your observer location. Distance rings, hearing-watch predictions, weather alerts, and map layers are all centered on this point. Edit to change address, fetch radius, and map zoom.',
  nearbyFlights:
    'Flights within your home radius for hearing watch and alerts. The map loads aircraft for whatever viewport you pan to worldwide (OpenSky + ADSB.lol).',
  nearbyTrains:
    'Amtrak + MetroLink passenger, live freight/crossings, APRS rail (with free aprs.fi key), FRA rail yards, and high-volume freight corridors. Refreshes every 10s.',
  liveMap:
    'Interactive map centered on your home (red ring = focus area). Pan and zoom anywhere — flights load for the current view worldwide. Toggle layers above for weather, rail, cameras, and more.',
  airportBoard:
    'Optional STL airport hub from FlightRadar24 — departures, arrivals, delays. Uses ~300–500 FR24 credits per load. Click "Load STL status" only when you want it.',
  alerts:
    'Unusual aircraft events in your area: emergency squawks (7500/7600/7700), low heavy jets, and military/government traffic flagged by heuristics.',
  hearingWatch:
    'Predicts which overhead aircraft you may hear indoors based on altitude, distance, aircraft type, and current weather. Top 5 likely audible passes; toasts when enabled.',
  weatherAlertsPanel:
    'Text list of official NWS watches, warnings, and advisories for your home point from weather.gov — complements the Alerts map polygons.',
  govMilitary:
    'Military and government aircraft currently in your fetch radius (amber icons on the map). Based on callsign, registration, and aircraft type patterns.',
  trends:
    'SQLite snapshot history from manual "Refresh map" clicks. Shows traffic volume, category mix, and alert counts over the last 24 hours or 7 days.',
  funZone:
    'Loony mode: ISS wave toasts, chemtrail satire, callsign roulette, disaster movie UI, Arch shadow nonsense, T-ravioli index, and other STL-area absurdity.',
  liveFacts:
    'Live dashboard panel: MISO electricity mix & hub price, Cardinals/Blues home games, FAA NAS delays for STL airports, aurora/Kp outlook, golden hour, and notes on data we cannot yet map (Ameren outages, PulsePoint, US pollen).',
} as const;

export const FUN_TOGGLE_HELP = {
  issWave:
    'Toast when the ISS passes above 25° elevation: “Go outside and wave.” Polls satellite positions every 30s.',
  chemtrails:
    'Draws fake dashed “chemtrail” lines behind jets above 25,000 ft. Satire only — contrails are just ice crystals.',
  birdPanic:
    'One daily toast when seasonal migration intensity spikes: “DUCKS INCOMING.” Based on spring/fall peak heuristics.',
  werewolf:
    'On full moon nights, tints the map purple and shows WEREWOLF MODE in the moon stat.',
  solarMoodRing:
    'Colors the map border by NOAA planetary Kp index — green when calm, yellow/orange/red when geomagnetic activity rises.',
  disasterMovie:
    'When NWS alerts + tornado/lightning/quake signals pile up, switches the UI to over-the-top 1996 disaster-movie styling.',
  monster:
    'After 10 pm (or before 4 am) on foggy/humid nights, spawns a blinky “unidentified surface contact” on the Mississippi.',
  trainHorns:
    'If two Amtrak markers are visible, draws a dashed line between them labeled “Estimated horn bearing: 100% fictional.”',
  windChimes:
    'Plays quiet synthesized chimes from current wind speed/direction (METAR or home weather). Off by default — can be annoying.',
  catMode:
    'Raises hearing-watch sensitivity (+6 dB) so only the loudest passes would wake an indoor cat. Syncs with hearing toasts.',
  celebrityStalker:
    'Toasts when known celebrity/billionaire tail numbers (N628TS, etc.) appear in your ADSB feed.',
  roulette:
    'Each day picks a random “holy grail” callsign; toasts if that callsign flies overhead.',
  radarNoir:
    'Aged treasure-map chart: burnt parchment, brown ink coastlines, typewriter popups, compass rose, and storm smudges like old cartographer weather notes.',
} as const;

export function friendlyApiError(message: string) {
  if (message.includes('Unknown API route')) {
    return 'Map layer API not loaded — stop and restart: npm run dev (the Node API must reload after code changes).';
  }
  if (/^fetch failed$/i.test(message) || message === 'Failed to fetch') {
    return 'Network blip — flight data feed unreachable. Will retry automatically.';
  }
  if (/ADSB\.lol request failed|adsb\.lol|ADSB flight feed unreachable/i.test(message)) {
    return 'Flight feed hiccup — showing last known positions.';
  }
  return message;
}
