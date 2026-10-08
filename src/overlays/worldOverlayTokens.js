/**
 * @module worldOverlayTokens
 * @description Visual constants shared by the world-overlay host, painters,
 * and source presentation bridges. Keep source selection and data semantics in
 * their owning modules; this file is the single home for cross-source canvas
 * presentation values.
 */

/** Shared visual tokens used by every world-overlay source. */
export const WORLD_OVERLAY_STYLE = Object.freeze({
  background: 'rgba(4, 16, 8, 0.82)',
  selectedBackground: 'rgba(6, 28, 12, 0.94)',
  border: 'rgba(140, 220, 130, 0.28)',
  selectedBorder: 'rgba(125, 255, 106, 0.85)',
  title: 'rgba(215, 255, 200, 0.96)',
  detail: 'rgba(130, 190, 120, 0.92)',
  leader: 'rgba(90, 200, 100, 0.7)',
  accent: '#7dff6a',
  fontLabel: '500 10px "VT323", monospace',
  fontTrack: '600 10px "VT323", monospace',
  fontTitle: '600 12px "VT323", monospace',
  fontDetail: '500 10.5px "VT323", monospace',
  fontSelected: '600 13px "VT323", monospace',
  fontTrackedTitle: '600 13px "VT323", monospace',
  fontTrackedDetail: '500 11px "VT323", monospace',
  radius: 0,
  anchorDotRadius: 3.2,
  anchorDotStrokeWidth: 1,
  anchorDotStroke: 'rgba(4, 16, 4, 0.96)',
  leaderWidth: 1.35,
});

/** CCTV's field-tested thumbnail-card overrides on top of shared card chrome. */
export const CCTV_THUMBNAIL_STYLE = Object.freeze({
  padding: 4,
  titleHeight: 13,
  titleChars: 15,
  background: WORLD_OVERLAY_STYLE.background,
  titleColor: 'rgba(215, 255, 200, 0.95)',
  titleFont: '600 10px "VT323", monospace',
  accent: 'rgb(125, 255, 106)',
  leader: 'rgba(125, 255, 106, 0.65)',
  rule: 'rgba(125, 255, 106, 0.95)',
  ruleHeight: 2,
  radius: 0,
});

/** Detection fonts and compositor glow retained exactly from the source renderer. */
export const DETECTION_STYLE = Object.freeze({
  font: '10px VT323, monospace',
  microFont: '9px VT323, monospace',
  glowPx: 3,
});

/**
 * Alpha of the tracked readout card's backing plate — the legibility reference
 * every other backing is measured against. Derived from
 * `WORLD_OVERLAY_STYLE.background` and asserted against it in unit tests, so a
 * future retune of the card cannot silently desynchronize the ambient family.
 */
export const CARD_PLATE_ALPHA = 0.82;

/**
 * Ambient detection callouts carry a LIGHTER member of the card's backing
 * family: enough plate to hold small mono text against sunlit imagery, not so
 * much that a field of them reads as a wall of boxes. `calloutPlate` sits at
 * ~58% of `CARD_PLATE_ALPHA`; `calloutPlateSpace` is the owner-requested
 * "slightly higher opacity so the text pops" for space-tier (satellite)
 * contacts, which sit over the high-albedo lit Earth disc more often than
 * aircraft do.
 *
 * These are DARK plates painted with NORMAL blending, which makes them
 * self-adapting: over night terrain or space a dark plate on a dark scene is
 * nearly invisible, while over bright ground it does the full darkening job.
 * That is the same mechanism the tracked card uses, and the reason it survives
 * every style — see `PLATE_ALPHA_BAND` in the tests.
 */
export const DETECTION_PLATE_BAND = Object.freeze({ min: 0.5, max: 0.62 });

/**
 * What survives of a callout plate when SKY, not ground, is behind the label.
 *
 * The plate exists to hold small mono text against sunlit imagery. Against the
 * horizon it has no job to do — there is nothing bright and busy to separate
 * the text from — and at full strength it reads as a row of dark boxes pasted
 * on an empty sky, which is the one place the pre-plate bare-text look was
 * already better (owner field call, 2026-08-21).
 *
 * So the plate is SCALED here rather than replaced: every theme keeps its own
 * hue and its own relative weight, and the sky case lands at a whisper that is
 * visually the old bare text while still catching a bright cloud. Which case a
 * given label is in comes from `skyBackdropFactor`, blended across a band so
 * contacts crossing the horizon fade instead of popping.
 */
export const SKY_PLATE_SCALE = 0.22;

/**
 * Sensor-style palettes for the host-owned detection paint lane.
 * Every style stays in the phosphor green family. Hierarchy is brightness:
 * alerts and tracked contacts are the lightest greens, ambient contacts dimmer.
 */
const PHOSPHOR_TIERS = Object.freeze({
  civil: '#7dff6a',
  military: '#e8ff9a',
  sea: '#4ecf6a',
  space: '#c8ffb4',
  vehicle: '#3aaa4e',
  veh_jam: '#f4ffd0',
  veh_slow: '#c6e85a',
  veh_free: '#3dcc4a',
  veh_nodata: '#6d9478',
  transit_bus: '#5EF08A',
  transit_tram: '#d2ff70',
  transit_subway: '#f0ffc0',
  transit_rail: '#5ecf78',
  transit_ferry: '#248f4e',
  transit_unknown: '#8aaa92',
});

export const DETECTION_THEME_MAP = Object.freeze({
  retro: {
    line: 'rgba(198, 255, 90, 0.9)',
    label: 'rgba(232, 255, 190, 0.96)',
    labelBg: 'rgba(8, 20, 6, 0.72)',
    calloutPlate: 'rgba(8, 20, 6, 0.48)',
    calloutPlateSpace: 'rgba(8, 20, 6, 0.56)',
    glow: 'rgba(198, 255, 90, 0.45)',
    dim: 'rgba(170, 210, 140, 0.62)',
    cardBorder: 'rgba(190, 255, 170, 0.2)',
    blend: 'screen',
    filter: 'contrast(1.08) saturate(1.04)',
    scanline: 0.085,
    tiers: PHOSPHOR_TIERS,
  },
  surveillance: {
    line: 'rgba(120, 255, 130, 0.9)',
    label: 'rgba(225, 255, 210, 0.97)',
    labelBg: 'rgba(6, 16, 6, 0.78)',
    calloutPlate: 'rgba(6, 16, 6, 0.48)',
    calloutPlateSpace: 'rgba(6, 16, 6, 0.56)',
    glow: 'rgba(120, 255, 120, 0.42)',
    dim: 'rgba(170, 205, 160, 0.62)',
    cardBorder: 'rgba(190, 255, 190, 0.18)',
    blend: 'screen',
    filter: 'contrast(1.12) saturate(1.12)',
    scanline: 0.09,
    tiers: PHOSPHOR_TIERS,
  },
  thermal: {
    line: 'rgba(210, 255, 180, 0.95)',
    label: 'rgba(236, 255, 220, 0.98)',
    labelBg: 'rgba(10, 16, 8, 0.66)',
    calloutPlate: 'rgba(10, 16, 8, 0.46)',
    calloutPlateSpace: 'rgba(10, 16, 8, 0.54)',
    glow: 'rgba(210, 255, 180, 0.42)',
    dim: 'rgba(190, 220, 170, 0.74)',
    cardBorder: 'rgba(220, 255, 200, 0.18)',
    blend: 'screen',
    filter: 'contrast(1.1) saturate(1.08)',
    scanline: 0.04,
    tiers: PHOSPHOR_TIERS,
  },
  _default: {
    line: 'rgba(125, 255, 106, 0.9)',
    label: 'rgba(215, 255, 200, 0.97)',
    labelBg: 'rgba(4, 16, 8, 0.66)',
    calloutPlate: 'rgba(4, 16, 8, 0.46)',
    calloutPlateSpace: 'rgba(4, 16, 8, 0.54)',
    glow: 'rgba(125, 255, 106, 0.4)',
    dim: 'rgba(140, 190, 130, 0.66)',
    cardBorder: 'rgba(180, 255, 160, 0.16)',
    blend: 'screen',
    filter: 'contrast(1.05) saturate(1.05)',
    scanline: 0.05,
    tiers: PHOSPHOR_TIERS,
  },
});
