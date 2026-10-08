export const LAYER_ID = 'military-installations';

export const REQUEST_DEBOUNCE_MS = 180;

export const MAX_VIEWPORT_DEGREES = 10;

export const MAX_RENDERED = 700;

export const GOOGLE_MILITARY_PLACE_TYPES = new Set(['military_base']);

export const COLOR_BY_CLASS = {
  airfield: '#7dff6a',
  naval_base: '#5ecf78',
  range: '#e8ff9a',
  military_land: '#3d6b48',
  places_candidate: '#f4ffd0',
};

export const EARTH_MEAN_RADIUS_M = 6371008.8;

export const DISTANCE_PREFILTER_MARGIN_M = 5000;

/** A Contacts subject must move this far before its installation window moves. */
export const ANCHOR_REFRESH_M = 20_000;
