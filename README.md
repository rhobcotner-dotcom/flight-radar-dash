# Flight Radar Dash

Personal dashboard for flights in your area, powered by the [FlightRadar24 API](https://fr24api.flightradar24.com/).

Default metro: **Saint Peters, MO** (configurable in the app).

## Data sources

| Feature | Source | Cost |
|---|---|---|
| Live map, flight list, alerts | [ADSB.lol](https://api.adsb.lol/docs) | Free |
| Routes & airline names | [adsbdb.com](https://api.adsbdb.com) | Free |
| Google Flights links | Generated in UI | Free |
| STL airport board (optional) | FlightRadar24 API | Uses FR24 credits |

## API credit usage (FlightRadar24)

FR24 is **only** used when you click **Load STL status** on the airport board (~5 calls, ~300–500 credits).

The live map no longer uses FR24:

- **Auto-refresh** defaults to every **2 minutes** via ADSB.lol (free)
- **Manual Refresh map** also uses ADSB.lol + adsbdb route lookups
- **Trend snapshots** — saved on manual map refresh only (auto-refresh skips SQLite writes)
- Set `FR24_API_TOKEN` only if you want the optional airport board

## Features

- Live map and flight table for your geographic area
- Military / government flight panel
- Alerts for emergency squawks, low-altitude heavies, and mil/gov traffic
- Local SQLite snapshots for trends (24h / 7d)
- Netlify-ready API proxy (FR24 pulls disabled by default when deployed)

## Setup

```bash
cp .env.example .env
# Add FR24_API_TOKEN from https://fr24api.flightradar24.com/key-management

npm install
cd web && npm install && cd ..
```

## Local development

```bash
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:3001

Open the UI and click **Refresh** to pull live flight data.

## Optional manual snapshot script

`npm run poll` makes a standalone FR24 pull and saves a snapshot. It uses the same local-only guard — prefer clicking **Refresh** in the UI instead.

## Tests

```bash
npm test
```

## Netlify deploy (later)

1. Create a Netlify site linked to this repo
2. Set environment variables: `FR24_API_TOKEN`, and only if you want remote pulls: `FR24_ENABLE_PULLS=true`
3. Deploy — API routes proxy through `netlify/functions/api.js`

## Security

Never commit `.env` or your FR24 API token. The browser only talks to `/api/*` on your backend.
