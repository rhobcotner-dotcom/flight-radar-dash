import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachEmergency,
  enrichWildfirePerimeter,
  enrichFemaDisaster,
  enrichNwsEmergencyAlert,
  enrichEmsIncident,
  isLiveEmergencySource,
  severityFromAcres,
} from '../api/lib/emergencyEnrichment.js';

test('attachEmergency normalizes severity level 0-100', () => {
  const row = attachEmergency({}, { label: 'Test', level: 150, source: 'test', kind: 'ems-incident' });
  assert.equal(row.emergencyLevel, 100);
});

test('enrichWildfirePerimeter builds containment label', () => {
  const feature = {
    properties: {
      poly_IncidentName: 'TEST FIRE',
      attr_PercentContained: 42,
      poly_GISAcres: 1200,
      attr_FireCause: 'Lightning',
    },
  };
  enrichWildfirePerimeter(feature);
  assert.match(feature.properties.emergencyLabel, /TEST FIRE/);
  assert.match(feature.properties.emergencyLabel, /42%/);
  assert.equal(feature.properties.emergencySource, 'nifc-wfigs');
  assert.equal(feature.properties.emergencyTimingClass, 'real-time');
});

test('enrichFemaDisaster marks static declarations', () => {
  const row = enrichFemaDisaster({
    declarationTitle: 'COTTONWOOD FIRE',
    designatedArea: 'Beaver (County)',
    declarationType: 'FM',
    state: 'UT',
  });
  assert.match(row.emergencyLabel, /COTTONWOOD/);
  assert.equal(row.emergencyTimingClass, 'static');
});

test('enrichNwsEmergencyAlert classifies warnings with CAP matrix', () => {
  const props = {
    event: 'Tornado Warning',
    headline: 'Tornado Warning for St. Louis County',
    severity: 'Extreme',
    urgency: 'Immediate',
    certainty: 'Observed',
    alertClass: 'nws-warning',
  };
  enrichNwsEmergencyAlert(props);
  assert.equal(props.emergencySource, 'nws-cap');
  assert.ok(props.emergencyLevel >= 90);
});

test('enrichEmsIncident labels city dispatch and preserves coordinates', () => {
  const row = enrichEmsIncident({
    city: 'Seattle',
    agency: 'Seattle Fire',
    source: 'seattle-fire-911',
    title: '3RED - 1 +1 + 1',
    address: '533 N 67th St',
    lat: 47.67781,
    lon: -122.352157,
    timingClass: 'real-time',
  });
  assert.match(row.emergencyLabel, /Seattle Fire/);
  assert.match(row.emergencyLabel, /533 N 67th St/);
  assert.equal(row.lat, 47.67781);
  assert.equal(row.lon, -122.352157);
});

test('severityFromAcres scales large fires', () => {
  assert.equal(severityFromAcres(50000), 90);
  assert.equal(severityFromAcres(10), 45);
});

test('isLiveEmergencySource identifies live feeds', () => {
  assert.equal(isLiveEmergencySource('nifc-wfigs'), true);
  assert.equal(isLiveEmergencySource('fema-open'), false);
});
