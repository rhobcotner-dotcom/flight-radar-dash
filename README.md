# HomeScope

**A live map of what's moving and happening near you — and beyond.**

HomeScope started as a flight tracker for the view out the window. It grew into a personal situational-awareness dashboard: aircraft, weather, trains, boats, traffic cameras, and more — stacked on one map you control, mostly from free public feeds.

Default home: **Saint Peters, MO** (configurable in the app).

> Repo name `flight-radar-dash` is legacy; the product is **HomeScope**.

## What you get

| Layer | Examples |
|---|---|
| **Motion** | ADSB flights (smooth live map), passenger & freight rail, AIS boats, satellites |
| **Weather** | Radar, lightning, alert polygons, storm briefing + live cameras |
| **Ground truth** | ~38k nationwide traffic cameras, rail cams, river gauges, roads, transit |
| **Extras** | eBird, iNaturalist, APRS, earthquakes, wildfires, drought, fun modes |

Bottom banner: *Tracking X flights, X cams, X boats, X trains nationwide.*

## Data sources

| Feature | Source | Cost |
|---|---|---|
| Live map, flight list, alerts | [ADSB.lol](https://api.adsb.lol/docs) | Free |
| Routes & airline names | [adsbdb.com](https://api.adsbdb.com) | Free |
| Google Flights links | Generated in UI | Free |
| STL airport board (optional) | FlightRadar24 API | Uses FR24 credits |

## FlightRadar24 credits

FR24 is **only** used when you click **Load STL status** on the airport board (~5 calls, ~300–500 credits).

The live map uses ADSB.lol + adsbdb — not FR24.

- **Auto-refresh** defaults to every **5 seconds** for positions (route labels enrich in the background)
- **Manual Refresh map** runs full enrichment
- **Trend snapshots** — saved on manual map refresh only
- Set `FR24_API_TOKEN` only if you want the optional airport board

## Features

- Live map and flight table for your geographic area
- Military / government flight panel
- Hearing alerts for nearby aircraft (optional sound)
- Alerts for emergency squawks, low-altitude heavies, and mil/gov traffic
- Local SQLite snapshots for trends (24h / 7d)
- Netlify-ready API proxy (FR24 pulls disabled by default when deployed)

## Setup

```bash
cp .env.example .env
# Add FR24_API_TOKEN only if you want the optional airport board

npm install
cd web && npm install && cd ..
```

## Local development

```bash
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:3010 (or `PORT` from `.env`)

## Tests

```bash
npm test
```

## Netlify deploy

1. Create a Netlify site linked to this repo
2. Set environment variables: `FR24_API_TOKEN`, and only if you want remote pulls: `FR24_ENABLE_PULLS=true`
3. Deploy — API routes proxy through `netlify/functions/api.js`

## Security

Never commit `.env` or your FR24 API token. The browser only talks to `/api/*` on your backend.
