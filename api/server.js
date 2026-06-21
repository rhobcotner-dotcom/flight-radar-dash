import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handleLiveAlerts,
  handleLiveCount,
  handleLiveFlights,
  handleLiveGovFlights,
} from './routes/live.js';
import { handleTrendSummary, handleTrends } from './routes/trends.js';
import { handleDefaultSettings } from './routes/settings.js';

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
    sandbox: String(process.env.FR24_USE_SANDBOX || 'false').toLowerCase() === 'true',
  });
});

app.get('/api/live/flights', asyncHandler(handleLiveFlights));
app.get('/api/live/flights/gov', asyncHandler(handleLiveGovFlights));
app.get('/api/live/flights/count', asyncHandler(handleLiveCount));
app.get('/api/live/alerts', asyncHandler(handleLiveAlerts));
app.get('/api/trends', handleTrends);
app.get('/api/trends/summary', handleTrendSummary);
app.get('/api/settings/default', handleDefaultSettings);

const webDist = path.resolve(__dirname, '../web/dist');
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next();
  });
});

if (!isServerless) {
  app.listen(PORT, () => {
    console.log(`Flight radar API listening on http://localhost:${PORT}`);
  });
}

export default app;
