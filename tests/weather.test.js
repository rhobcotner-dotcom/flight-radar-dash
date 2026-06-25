import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichWeatherConditions,
  fahrenheitFromCelsius,
  weatherCodeLabel,
  WEATHER_CODE_LABELS,
} from '../lib/weatherCodes.js';

test('weatherCodeLabel maps common open-meteo codes to two-word labels', () => {
  assert.equal(weatherCodeLabel(0), 'clear sunny');
  assert.equal(weatherCodeLabel(3), 'overcast cloudy');
  assert.equal(weatherCodeLabel(45), 'hazy fog');
  assert.equal(weatherCodeLabel(95), 'active thunderstorm');
  assert.equal(weatherCodeLabel(95, { precipitationMm: 0, cloudCoverPct: 54 }), 'partly cloudy');
  assert.equal(weatherCodeLabel(95, { precipitationMm: 1.2 }), 'steady rain');
  assert.equal(weatherCodeLabel(99), 'severe thunderstorm');
  assert.equal(weatherCodeLabel(null), 'mixed conditions');
});

test('weather code labels stay two words for known codes', () => {
  for (const label of Object.values(WEATHER_CODE_LABELS)) {
    assert.match(label, /^[^\s]+\s[^\s]+$/);
  }
});

test('enrichWeatherConditions adds fahrenheit and condition labels to legacy payloads', () => {
  const enriched = enrichWeatherConditions({
    temperatureC: 24,
    weatherCode: 95,
    precipitationMm: 0,
    cloudCoverPct: 54,
  });

  assert.equal(enriched.temperatureF, 75);
  assert.equal(enriched.conditionLabel, 'partly cloudy');
});

test('fahrenheitFromCelsius rounds to whole degrees', () => {
  assert.equal(fahrenheitFromCelsius(0), 32);
  assert.equal(fahrenheitFromCelsius(26), 79);
});
