import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAmtrakTrain,
  isClassicRailTrain,
  isMetroTrain,
  mapAmtrakTrainMarkerLabels,
} from '../web/src/lib/trainUtils.ts';

test('isAmtrakTrain matches Amtrak passenger trains only', () => {
  assert.equal(isAmtrakTrain({ railroad: 'Amtrak', sourceLabel: 'Amtrak' }), true);
  assert.equal(isAmtrakTrain({ railroad: 'Metra', sourceLabel: 'Metra' }), false);
});

test('mapAmtrakTrainMarkerLabels uses Amtrak primary and to/from route line', () => {
  const labels = mapAmtrakTrainMarkerLabels({
    trainNum: '304',
    trainId: '304',
    routeName: 'Missouri River Runner',
    lat: 38.6,
    lon: -90.2,
    railroad: 'Amtrak',
    sourceLabel: 'Amtrak',
    originCode: 'KC',
    destCode: 'STL',
    originName: 'Kansas City',
    destName: 'St. Louis',
  });

  assert.equal(labels.bottomLabel, 'Amtrak');
  assert.deepEqual(labels.bottomRoute, {
    to: 'STL',
    from: 'KC',
  });
});

test('mapAmtrakTrainMarkerLabels abbreviates long station names', () => {
  const labels = mapAmtrakTrainMarkerLabels({
    trainNum: '303',
    trainId: '303',
    routeName: 'Lincoln Service',
    lat: 38.9,
    lon: -90.1,
    railroad: 'Amtrak',
    originName: 'Chicago Union Station',
    destName: 'Kansas City',
    destCode: 'KC',
  });

  assert.deepEqual(labels.bottomRoute, { to: 'KC', from: 'CHI' });
});

test('mapAmtrakTrainMarkerLabels falls back to station codes', () => {
  const labels = mapAmtrakTrainMarkerLabels({
    trainNum: '5',
    trainId: '5',
    routeName: 'California Zephyr',
    lat: 38.6,
    lon: -90.2,
    railroad: 'Amtrak',
    originCode: 'CHI',
    destCode: 'EMY',
  });

  assert.equal(labels.bottomLabel, 'Amtrak');
  assert.deepEqual(labels.bottomRoute, { to: 'EMY', from: 'CHI' });
});

test('mapAmtrakTrainMarkerLabels returns blank for non-Amtrak trains', () => {
  assert.deepEqual(
    mapAmtrakTrainMarkerLabels({
      trainNum: '1',
      trainId: '1',
      routeName: 'Red Line',
      lat: 42.3,
      lon: -71.0,
      railroad: 'MBTA',
      sourceLabel: 'MBTA',
    }),
    { bottomLabel: null, bottomRoute: null }
  );
});

test('isMetroTrain covers GTFS regional modes but not Amtrak or freight', () => {
  assert.equal(isMetroTrain({ trainKind: 'light_rail', railroad: 'MetroLink' }), true);
  assert.equal(isMetroTrain({ trainKind: 'subway', railroad: 'CTA' }), true);
  assert.equal(isMetroTrain({ trainKind: 'commuter', railroad: 'Metra' }), true);
  assert.equal(
    isMetroTrain({ trainKind: 'passenger', railroad: 'MBTA', sourceLabel: 'MBTA' }),
    true
  );
  assert.equal(
    isMetroTrain({ trainKind: 'passenger', railroad: 'Amtrak', sourceLabel: 'Amtrak' }),
    false
  );
  assert.equal(isMetroTrain({ trainKind: 'freight', railroad: 'UP' }), false);
  assert.equal(isClassicRailTrain({ trainKind: 'freight', railroad: 'UP' }), true);
  assert.equal(isClassicRailTrain({ trainKind: 'light_rail', railroad: 'MetroLink' }), false);
});
