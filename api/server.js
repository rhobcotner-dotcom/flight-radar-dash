import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { warmNationwideCameraPool } from './lib/usTrafficCameras.js';
import {
  handleDashboardRefresh,
  handleLiveAlerts,
  handleLiveCount,
  handleLiveFlights,
  handleLiveGovFlights,
  handleAirportHub,
} from './routes/live.js';
import { handleTrendSummary, handleTrends } from './routes/trends.js';
import { handleDefaultSettings } from './routes/settings.js';
import { handleAircraftImage, handleAircraftLiveryImage, handleAircraftTypeImage, handleVesselImage, handleVesselTypeImage } from './routes/images.js';
import { handleHearingConfig, handleWeather, handleWeatherAlerts, handleTornadoPolygons } from './routes/hearing.js';
import {
  handleAisVessels,
  handleAirQuality,
  handleEarthquakes,
  handleLightning,
  handleMetar,
  handleNotams,
  handleRoadConditions,
  handleRiverGauges,
  handleSondes,
  handleTfrs,
  handleTransit,
  handleWeatherAlertPolygons,
  handleWildfires,
} from './routes/mapLayers.js';
import { handleGeocode } from './routes/geocode.js';
import { handleReverseGeocode } from './routes/reverseGeocode.js';
import { handleRadarFrames } from './routes/radar.js';
import { handleStormAnalysis } from './routes/stormAnalysis.js';
import { handleLiveTrains } from './routes/trains.js';
import { handleFreightDreamState } from './routes/freightDreamState.js';
import { handleLiveSatellites } from './routes/satellites.js';
import { handleFunStatus } from './routes/fun.js';
import { handleTrackingStats } from './routes/trackingStats.js';
import {
  handleAprs,
  handleDrought,
  handleEbird,
  handleINaturalist,
  handleLiveDashboard,
  handleMisoGrid,
  handleNasStatus,
  handleRiverForecast,
  handleSportsSchedule,
  handleTrafficCameras,
  handleCamerasNear,
  handleRailCameras,
  handleCameraImage,
  handleCameraHls,
  handleCameraHlsSegment,
} from './routes/liveData.js';
import { isFr24PullEnabled } from './lib/local-only.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

app.use(express.json());

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      res.status(err.status || 500).json({
        error: err.message || 'Internal error',
        details: err.details,
      });
    });
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mapDataSource: 'adsb.lol',
    routeDataSource: 'adsbdb.com',
    fr24PullsEnabled: isFr24PullEnabled(),
    fr24Usage: 'airport-board-only',
    pullMode: 'adsb-map-manual-or-auto',
    sandbox: String(process.env.FR24_USE_SANDBOX || 'false').toLowerCase() === 'true',
    mapLayers: {
      alertPolygons: true,
      lightning: true,
      metar: true,
      tfrs: true,
      riverGauges: true,
      transit: true,
      roadConditions: true,
      airQuality: true,
      aisVessels: true,
      notams: true,
      earthquakes: true,
      sondes: true,
      wildfires: true,
      funZone: true,
      trafficCameras: true,
      riverForecast: true,
      ebird: true,
      inaturalist: true,
      aprs: true,
      drought: true,
      liveDashboard: true,
    },
  });
});

app.get('/api/live/refresh', asyncHandler(handleDashboardRefresh));
app.get('/api/live/airport', asyncHandler(handleAirportHub));

app.get('/api/live/flights', asyncHandler(handleLiveFlights));
app.get('/api/live/flights/gov', asyncHandler(handleLiveGovFlights));
app.get('/api/live/flights/count', asyncHandler(handleLiveCount));
app.get('/api/live/trains', asyncHandler(handleLiveTrains));
app.get('/api/trains/dream-state', asyncHandler(handleFreightDreamState));
app.post('/api/trains/dream-state', asyncHandler(handleFreightDreamState));
app.get('/api/live/satellites', asyncHandler(handleLiveSatellites));
app.get('/api/live/alerts', asyncHandler(handleLiveAlerts));
app.get('/api/trends', handleTrends);
app.get('/api/trends/summary', handleTrendSummary);
app.get('/api/settings/default', handleDefaultSettings);
app.get('/api/images/aircraft', asyncHandler(handleAircraftImage));
app.get('/api/images/aircraft-livery', asyncHandler(handleAircraftLiveryImage));
app.get('/api/images/aircraft-type', asyncHandler(handleAircraftTypeImage));
app.get('/api/images/vessel', asyncHandler(handleVesselImage));
app.get('/api/images/vessel-type', asyncHandler(handleVesselTypeImage));
app.get('/api/weather', asyncHandler(handleWeather));
app.get('/api/weather/alerts', asyncHandler(handleWeatherAlerts));
app.get('/api/weather/tornado-polygons', asyncHandler(handleTornadoPolygons));
app.get('/api/weather/alert-polygons', asyncHandler(handleWeatherAlertPolygons));
app.get('/api/weather/lightning', asyncHandler(handleLightning));
app.get('/api/aviation/metar', asyncHandler(handleMetar));
app.get('/api/aviation/tfrs', asyncHandler(handleTfrs));
app.get('/api/live/river-gauges', asyncHandler(handleRiverGauges));
app.get('/api/live/transit', asyncHandler(handleTransit));
app.get('/api/live/road-conditions', asyncHandler(handleRoadConditions));
app.get('/api/live/ais-vessels', asyncHandler(handleAisVessels));
app.get('/api/live/earthquakes', asyncHandler(handleEarthquakes));
app.get('/api/live/sondes', asyncHandler(handleSondes));
app.get('/api/weather/air-quality', asyncHandler(handleAirQuality));
app.get('/api/aviation/notams', asyncHandler(handleNotams));
app.get('/api/weather/wildfires', asyncHandler(handleWildfires));
app.get('/api/geocode', asyncHandler(handleGeocode));
app.get('/api/reverse-geocode', asyncHandler(handleReverseGeocode));
app.get('/api/radar/frames', asyncHandler(handleRadarFrames));
app.get('/api/weather/storm-analysis', asyncHandler(handleStormAnalysis));
app.get('/api/hearing/config', handleHearingConfig);
app.get('/api/fun/status', asyncHandler(handleFunStatus));
app.get('/api/live/tracking-stats', asyncHandler(handleTrackingStats));
app.get('/api/live/dashboard', asyncHandler(handleLiveDashboard));
app.get('/api/live/traffic-cameras', asyncHandler(handleTrafficCameras));
app.get('/api/live/cameras-near', asyncHandler(handleCamerasNear));
app.get('/api/live/rail-cameras', asyncHandler(handleRailCameras));
app.get('/api/live/camera-image', asyncHandler(handleCameraImage));
app.get('/api/live/camera-hls', asyncHandler(handleCameraHls));
app.get('/api/live/camera-hls-segment', asyncHandler(handleCameraHlsSegment));
app.get('/api/live/river-forecast', asyncHandler(handleRiverForecast));
app.get('/api/live/ebird', asyncHandler(handleEbird));
app.get('/api/live/inaturalist', asyncHandler(handleINaturalist));
app.get('/api/live/aprs', asyncHandler(handleAprs));
app.get('/api/weather/drought', asyncHandler(handleDrought));
app.get('/api/live/miso-grid', asyncHandler(handleMisoGrid));
app.get('/api/live/sports-schedule', asyncHandler(handleSportsSchedule));
app.get('/api/aviation/nas-status', asyncHandler(handleNasStatus));

const webDist = path.resolve(__dirname, '../web/dist');
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `Unknown API route: ${req.path}` });
  }
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next();
  });
});

async function ensureAprsFiSession() {
  if (String(process.env.APRS_FI_API_KEY || '').trim()) return;
  const sessionPath = path.join(process.cwd(), 'data', 'aprsfi.session.json');
  try {
    await fs.access(sessionPath);
    return;
  } catch {
    // Best-effort bootstrap for the public aprs.fi map feed (no API key / no captcha signup).
    import('../scripts/bootstrap-aprsfi-session.mjs').catch((err) => {
      console.warn('aprs.fi session bootstrap failed:', err.message);
    });
  }
}

if (!isServerless) {
  ensureAprsFiSession().finally(() => {
    app.listen(PORT, () => {
      console.log(`Flight radar API listening on http://localhost:${PORT}`);
      warmNationwideCameraPool().catch((err) => {
        console.warn('Nationwide camera pool warm failed:', err.message);
      });
    });
  });
}

export default app;
