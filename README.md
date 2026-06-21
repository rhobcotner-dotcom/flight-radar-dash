# Flight Radar Dash

Personal dashboard for flights in your area, powered by the [FlightRadar24 API](https://fr24api.flightradar24.com/).

Default metro: **Saint Peters, MO** (configurable in the app).

## Features

- Live map and flight table for your geographic area
- Military / government flight panel
- Alerts for emergency squawks, low-altitude heavies, and mil/gov traffic
- Local SQLite snapshots for trends (24h / 7d)
- Netlify-ready API proxy (keeps your FR24 token server-side)

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

Use `FR24_USE_SANDBOX=true` in `.env` during development to avoid consuming credits.

## Capture trend snapshots

Run manually or on a cron schedule (every 5–15 minutes):

```bash
npm run poll
```

Trends populate in the dashboard after a few snapshots.

## Tests

```bash
npm test
```

## Netlify deploy (later)

1. Create a Netlify site linked to this repo
2. Set environment variables: `FR24_API_TOKEN`, `FR24_USE_SANDBOX=false`
3. Deploy — API routes proxy through `netlify/functions/api.js`

## Security

Never commit `.env` or your FR24 API token. The browser only talks to `/api/*` on your backend.
