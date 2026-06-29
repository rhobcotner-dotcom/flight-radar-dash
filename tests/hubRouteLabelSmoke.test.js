import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFlightRouteSubLabel } from '../lib/flightRouteLabels.js';
import { LOW_ALTITUDE_LABEL_FT } from '../lib/flightLabelThresholds.js';
import { HUB_ROUTE_LABEL_FIXTURES, US_HUBS } from './fixtures/hubRouteLabelFixtures.js';

const HUB_CODES = ['ATL', 'LAX', 'ORD', 'DFW', 'DEN'];

for (const fx of HUB_ROUTE_LABEL_FIXTURES) {
  test(`[${fx.hub}] ${fx.id}: ${fx.scenario}`, () => {
    const label = mapFlightRouteSubLabel(fx.flight);
    if (fx.expect === null) {
      assert.equal(label, null);
      return;
    }
    assert.deepEqual(label, fx.expect);
  });
}

test('each major hub has approach and departure fixture coverage', () => {
  for (const hub of HUB_CODES) {
    const cases = HUB_ROUTE_LABEL_FIXTURES.filter((fx) => fx.hub === hub);
    assert.ok(cases.some((fx) => fx.expect?.tone === 'from'), `${hub} missing approach fixture`);
    assert.ok(cases.some((fx) => fx.expect?.tone === 'to'), `${hub} missing departure fixture`);
  }
});

test('sublabels never use raw IATA codes without route cities', () => {
  const ga = HUB_ROUTE_LABEL_FIXTURES.find((fx) => fx.id === 'atl-ga-no-route');
  assert.ok(ga);
  const label = mapFlightRouteSubLabel(ga.flight);
  assert.equal(label, null);
  if (label?.text) {
    assert.match(label.text, /^(from|to) [A-Z]{3}$/, 'should not show bare IATA');
  }
});

test('near-origin flights never show from {origin}', () => {
  for (const fx of HUB_ROUTE_LABEL_FIXTURES) {
    const label = mapFlightRouteSubLabel(fx.flight);
    if (!label || label.tone !== 'from') continue;
    const hub = US_HUBS[fx.hub];
    if (!hub) continue;
    const near =
      Math.abs(fx.flight.lat - hub.lat) < 0.45 && Math.abs(fx.flight.lon - hub.lon) < 0.45;
    if (near && fx.flight.orig_city?.includes(hub.city.split('-')[0])) {
      assert.fail(`${fx.id} shows ${label.text} near ${fx.hub} origin`);
    }
  }
});

test('fixtures above altitude threshold are blank', () => {
  for (const fx of HUB_ROUTE_LABEL_FIXTURES) {
    if (Number(fx.flight.alt) >= LOW_ALTITUDE_LABEL_FT) {
      assert.equal(mapFlightRouteSubLabel(fx.flight), null, fx.id);
    }
  }
});

test('expected labels stay below altitude threshold', () => {
  for (const fx of HUB_ROUTE_LABEL_FIXTURES) {
    if (!fx.expect) continue;
    assert.ok(Number(fx.flight.alt) < LOW_ALTITUDE_LABEL_FT, fx.id);
  }
});
