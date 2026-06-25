export const WEATHER_CODE_LABELS = {
  0: 'clear sunny',
  1: 'mostly sunny',
  2: 'partly cloudy',
  3: 'overcast cloudy',
  45: 'hazy fog',
  48: 'hazy fog',
  51: 'light drizzle',
  53: 'steady drizzle',
  55: 'heavy drizzle',
  56: 'freezing drizzle',
  57: 'freezing drizzle',
  61: 'light rain',
  63: 'steady rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'freezing rain',
  71: 'light snow',
  73: 'steady snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'rain showers',
  81: 'rain showers',
  82: 'heavy showers',
  85: 'snow showers',
  86: 'heavy snow',
  95: 'active thunderstorm',
  96: 'severe thunderstorm',
  99: 'severe thunderstorm',
};

function labelFromCloudCover(cloudCoverPct) {
  const cover = Number(cloudCoverPct);
  if (!Number.isFinite(cover)) return 'mixed conditions';
  if (cover >= 85) return 'overcast cloudy';
  if (cover >= 55) return 'mostly cloudy';
  if (cover >= 25) return 'partly cloudy';
  return 'mostly sunny';
}

function labelFromPrecipitation(precipitationMm) {
  const precip = Number(precipitationMm);
  if (!Number.isFinite(precip) || precip <= 0) return null;
  if (precip >= 2.5) return 'heavy rain';
  if (precip >= 0.8) return 'steady rain';
  if (precip >= 0.15) return 'light rain';
  return 'light drizzle';
}

export function weatherCodeLabel(code, options = {}) {
  const precipitationMm = Number(options.precipitationMm ?? 0);
  const cloudCoverPct = options.cloudCoverPct;
  const codeNum = Number(code);

  const precipLabel = labelFromPrecipitation(precipitationMm);
  if (precipLabel) return precipLabel;

  if (Number.isFinite(codeNum) && codeNum >= 95 && precipitationMm <= 0) {
    if (options.cloudCoverPct != null && Number.isFinite(Number(options.cloudCoverPct))) {
      return labelFromCloudCover(cloudCoverPct);
    }
    return WEATHER_CODE_LABELS[codeNum] || 'mixed conditions';
  }

  if (code == null || !Number.isFinite(codeNum)) {
    return labelFromCloudCover(cloudCoverPct);
  }

  return WEATHER_CODE_LABELS[codeNum] || labelFromCloudCover(cloudCoverPct);
}

export function fahrenheitFromCelsius(celsius) {
  if (celsius == null || !Number.isFinite(Number(celsius))) return null;
  return Math.round((Number(celsius) * 9) / 5 + 32);
}

export function enrichWeatherConditions(weather) {
  if (!weather || typeof weather !== 'object') return weather;

  const conditionLabel = weatherCodeLabel(weather.weatherCode, {
    precipitationMm: weather.precipitationMm,
    cloudCoverPct: weather.cloudCoverPct,
  });

  return {
    ...weather,
    temperatureF: weather.temperatureF ?? fahrenheitFromCelsius(weather.temperatureC),
    conditionLabel,
  };
}
