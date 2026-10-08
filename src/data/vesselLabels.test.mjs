import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  accentForVesselType,
  applyVesselOverlayPolicy,
  normalizeVesselType,
  vesselOverlayCohortLimit,
  vesselTypeCss,
} from './vesselLabels.js';

test('normalizeVesselType maps numeric AIS codes to type families', () => {
  assert.equal(normalizeVesselType('30'), 'FISHING');
  assert.equal(normalizeVesselType('31'), 'TOWING');
  assert.equal(normalizeVesselType('35'), 'MILITARY');
  assert.equal(normalizeVesselType('36'), 'SAILING');
  assert.equal(normalizeVesselType('37'), 'PLEASURE');
  assert.equal(normalizeVesselType('40'), 'HIGH-SPEED');
  assert.equal(normalizeVesselType('50'), 'PILOT');
  assert.equal(normalizeVesselType('51'), 'SAR');
  assert.equal(normalizeVesselType('52'), 'TUG');
  assert.equal(normalizeVesselType('60'), 'PASSENGER');
  assert.equal(normalizeVesselType('71'), 'CARGO');
  assert.equal(normalizeVesselType('84'), 'TANKER');
  assert.equal(normalizeVesselType('90'), 'OTHER');
});

test('normalizeVesselType preserves text and degrades unknown codes', () => {
  assert.equal(normalizeVesselType('Crude Oil Tanker'), 'Crude Oil Tanker');
  assert.equal(normalizeVesselType('0'), '');
  assert.equal(normalizeVesselType('25'), 'OTHER');
  assert.equal(normalizeVesselType(undefined), '');
});

test('vessel type CSS and card accents stay paired', () => {
  assert.equal(vesselTypeCss('Crude Oil Tanker'), '#e8ff9a');
  assert.equal(vesselTypeCss('Container Ship'), '#7dff6a');
  assert.equal(vesselTypeCss('Passenger/Ferry'), '#d7ffc8');
  assert.equal(vesselTypeCss('Fishing'), '#3dcc4a');
  assert.equal(vesselTypeCss('Tug'), '#c6e85a');
  assert.equal(accentForVesselType('Tanker'), '232, 255, 154');
  assert.equal(accentForVesselType('Cargo'), '125, 255, 106');
  assert.equal(accentForVesselType('Passenger'), '215, 255, 200');
  assert.equal(accentForVesselType('Fishing'), '61, 204, 74');
  assert.equal(accentForVesselType('Pilot Vessel'), '198, 232, 90');
  assert.equal(accentForVesselType('Dredger'), '94, 207, 120');
  assert.equal(accentForVesselType('84'), '232, 255, 154');
  assert.equal(vesselTypeCss('62'), '#d7ffc8');
});

test('vessel viewport cohort preserves the shipped 118px grid density', () => {
  assert.equal(vesselOverlayCohortLimit(1600, 900), 112);
  assert.equal(vesselOverlayCohortLimit(1920, 1080), 170);
  assert.equal(vesselOverlayCohortLimit(1920, 1080, 80), 80);
  assert.equal(vesselOverlayCohortLimit(10000, 10000), 900, 'the shipped row ceiling remains absolute');
  assert.equal(vesselOverlayCohortLimit(0, 1080), 0);
  assert.equal(vesselOverlayCohortLimit(1920, 1080, 0), 0);
});

test('vessel host policy uses always-on shared fade and protected selected lane', () => {
  const position = { x: 1, y: 2, z: 3 };
  const ambient = applyVesselOverlayPolicy({
    id: 'vessel:1', position, title: 'AMBIENT', gapPx: 10, selected: false,
  });
  assert.equal(ambient.variant, 'card');
  assert.equal(ambient.protected, false);
  assert.equal(ambient.collisionGroup, 'ambient-card');
  assert.equal(ambient.edgeFade, 'keyhole');
  assert.equal(ambient.maxDistance, 5_000_000);
  assert.equal(ambient.distanceFadeStartRatio, 0.7);
  assert.equal(ambient.cardStyle, 'tactical');
  assert.equal(ambient.verticalOnly, true);

  const selected = applyVesselOverlayPolicy({
    id: 'vessel:2', position, title: 'SELECTED', gapPx: 12, selected: true,
  });
  assert.equal(selected.variant, 'selected');
  assert.equal(selected.verticalOnly, false, 'selected detail can clear panels on either side');
  assert.equal(selected.protected, true);
  assert.equal(selected.collisionGroup, 'ambient-card');
  assert.equal(selected.maxDistance, Number.POSITIVE_INFINITY);
});

test('vesselLabels cannot resurrect a dedicated renderer', async () => {
  const source = await readFile(new URL('./vesselLabels.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'document.createElement',
    "createElement('canvas')",
    'postRender.addEventListener',
    'worldToWindowCoordinates',
    'requestAnimationFrame',
    "id = 'vessel-labels'",
  ]) {
    assert.equal(source.includes(forbidden), false, `dedicated renderer token returned: ${forbidden}`);
  }
});
