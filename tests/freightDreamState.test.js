import test from 'node:test';
import assert from 'node:assert/strict';
import { inferFreightDreamState } from '../api/lib/freightDreamState.js';
import { parseTrainSymbol } from '../api/lib/freightSymbolParser.js';
import { matchCargoKeywords, cargoFromSymbolType } from '../api/lib/freightCargoCatalog.js';
import { isAprsRailEntry } from '../api/lib/aprsRail.js';

test('cargoFromSymbolType maps coal and grain symbols', () => {
  assert.equal(cargoFromSymbolType('C')?.cargo, 'Coal');
  assert.equal(cargoFromSymbolType('G')?.cargo, 'Grain');
  assert.equal(cargoFromSymbolType('Z')?.cargo, 'Consumer goods');
});

test('matchCargoKeywords detects gas and coal in comments', () => {
  const hits = matchCargoKeywords('BNSF propane tank train north');
  assert.ok(hits.some((h) => h.cargo === 'Natural gas & LPG'));
  const coal = matchCargoKeywords('CSX unit coal train');
  assert.ok(coal.some((h) => h.cargo === 'Coal'));
});

test('parseTrainSymbol decodes coal unit symbol', () => {
  const symbol = parseTrainSymbol('BNSF C-PWR-STL', 'BNSF');
  assert.equal(symbol?.cargo, 'Coal');
});

test('isAprsRailEntry rejects Xastir PI beacons like APX216', () => {
  assert.equal(isAprsRailEntry({ callsign: 'APX216', comment: 'PI 4B XASTIR', speed: 198 }), false);
});

test('inferFreightDreamState returns specific commodity not intermodal jargon', async () => {
  const result = await inferFreightDreamState(
    {
      trainKind: 'freight',
      trainNum: 'W9RR',
      routeName: 'BNSF stack train 45mph',
      lat: 38.63,
      lon: -90.2,
      heading: 90,
      velocityMph: 45,
      railroad: 'BNSF',
    },
    { skipEnrich: true }
  );
  assert.equal(result.supported, true);
  assert.equal(result.primary?.cargo, 'Consumer goods');
  assert.match(result.primary?.detail || '', /container|boxed/i);
});

test('inferFreightDreamState hides markers without cargo clues', async () => {
  const result = await inferFreightDreamState(
    {
      trainKind: 'freight',
      trainNum: 'APX216',
      routeName: 'PI 4B XASTIR',
      lat: 38.78,
      lon: -90.58,
    },
    { skipEnrich: true }
  );
  assert.equal(result.supported, false);
});
