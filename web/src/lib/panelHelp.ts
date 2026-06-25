export const MAP_LAYER_HELP = {
  weatherAlerts:
    'NWS warning polygons on the map: tornado, severe thunderstorm, flood, flash flood, winter, and heat alerts for MO/IL/IA/AR/KS. Refreshes every minute.',
  lightning:
    'Recent cloud-to-ground lightning strikes near your area (last ~30 min). Yellow dots fade as strikes age. Source: Blitzortung.',
  metar:
    'Airport weather stations (KSTL, KSUS, KBLV, KUIN, KCPS). Badge color = flight category (VFR/MVFR/IFR). Click for raw METAR and TAF.',
  tfrs:
    'FAA Temporary Flight Restrictions — no-fly zones for VIP visits, disasters, stadium events, etc. Yellow dashed polygons from tfr.faa.gov.',
  helos:
    'Highlights helicopters on your existing ADSB feed: purple = general, pink = medevac, cyan = news, blue = law enforcement (best-effort callsign/type matching).',
  rivers:
    'Live USGS river gauge stage and flow on the Missouri/Mississippi near STL. Useful for flood context alongside weather alerts.',
  transit:
    'MetroLink and MetroBus vehicle positions from Metro GTFS-RT. Requires METRO_API_KEY in .env — request a free key at metrolinktrains.com.',
  roads:
    'Missouri DOT road conditions: closures, work zones, traffic delays, and winter impacts from mapping.modot.org. Red = closed, yellow = delay, cyan = winter.',
  airQuality:
    'US Air Quality Index at your home point from Open-Meteo (free). Optional AIRNOW_API_KEY upgrades to EPA monitor data when available.',
  aisVessels:
    'Large ships only (cargo, tanker, river tow) on nearby waterways. Pink boat icons. Live AIS via Axiom Overwatch — no API key required.',
  notams:
    'Airport NOTAMs for KSTL, KSUS, KCPS, KBLV, KUIN from FAA NMS API. Requires FAA_NMS_CLIENT_ID and FAA_NMS_CLIENT_SECRET (email NOTAMS@faa.gov).',
  earthquakes:
    'USGS earthquakes in the last 24 hours within 500 mi. Orange circles scale with magnitude.',
  sondes:
    'Amateur radio weather balloon sondes tracked by SondeHub — useful during severe weather season.',
  wildfires:
    'NASA FIRMS VIIRS wildfire hotspots within 200 mi. Requires free NASA_FIRMS_MAP_KEY from firms.modaps.eosdis.nasa.gov.',
  cameras:
    'US highway traffic cameras from free state DOT feeds. Pan/zoom the map to load cameras for the current view — coverage grows as you move across states.',
  railCameras:
    '240+ verified live rail cameras from 15 YouTube networks (Virtual Railfan, Live Trains, Steel Highway, SouthWest RailCams, Tehachapi, PU Tower, and more). Rebuild with npm run build:rail-cams. Amber dots within 125 mi of home.',
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
  satellites:
    'Satellites above 5° elevation at your location (ISS, GPS, weather sats, etc.). Positions computed from CelesTrak TLEs — not ground tracks.',
  radar:
    'NEXRAD base reflectivity overlay (IEM, ~3–5 min scan lag). Composite tiles scale above zoom 9; click the map for point weather.',
} as const;

export const PANEL_HELP = {
  home:
    'Your observer location. Distance rings, hearing-watch predictions, weather alerts, and map layers are all centered on this point. Edit to change address, fetch radius, and map zoom.',
  nearbyFlights:
    'Flights within your home radius for hearing watch and alerts. The map loads aircraft for whatever viewport you pan to worldwide (OpenSky + ADSB.lol).',
  nearbyTrains:
    'Amtrak + MetroLink passenger, live freight/crossings, APRS rail (with free aprs.fi key), FRA rail yards, and high-volume freight corridors. Refreshes every 10s.',
  liveMap:
    'Interactive map centered on your home (red ring = focus area). Pan and zoom anywhere — flights load for the current view, FlightRadar-style. Toggle layers above for weather, rail, cameras, and more.',
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
    'Loony mode: ISS wave toasts, chemtrail satire, black helicopter bingo, callsign roulette, disaster movie UI, Arch shadow nonsense, T-ravioli index, and other STL-area absurdity.',
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
} as const;

export function friendlyApiError(message: string) {
  if (message.includes('Unknown API route')) {
    return 'Map layer API not loaded — stop and restart: npm run dev (the Node API must reload after code changes).';
  }
  return message;
}
