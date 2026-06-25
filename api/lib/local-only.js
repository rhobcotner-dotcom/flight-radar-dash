/**
 * FR24 pulls are limited to local dev by default to conserve entry-level API credits.
 * Set FR24_ENABLE_PULLS=true to override (e.g. future Netlify deploy).
 */
export function isFr24PullEnabled() {
  const override = process.env.FR24_ENABLE_PULLS;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return !process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME;
}

export function assertFr24PullEnabled() {
  if (isFr24PullEnabled()) return;
  const err = new Error(
    'FlightRadar24 API pulls are disabled outside local dev. Run the dashboard with npm run dev and click Refresh.'
  );
  err.status = 403;
  throw err;
}
