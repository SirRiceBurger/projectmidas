/**
 * geoUtils.ts
 *
 * Utility functions for generating synthetic GeoJSON from pipeline zone data
 * and for computing per-field display values (colours, labels, normalisation).
 *
 * The coordinate system is WGS84. The synthetic property centroid is located
 * at approximately -36.8°N, 144.0°E (central Victoria, Australia).
 *
 * All generated polygons are axis-aligned rectangles whose areas are
 * proportional to the zone's area_ha field. The layout algorithm tiles zones
 * left-to-right in a single row. If a fourth or subsequent zone is added the
 * algorithm wraps into a second row using the same proportional widths.
 */

import type { PipelineResponse } from './api';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single GeoJSON Feature representing one pipeline zone as a rectangle. */
export interface ZoneFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    /** Outer ring only. Five coordinates (last === first) in [lng, lat] order. */
    coordinates: [number, number][][];
  };
  properties: {
    zone_id: string;
    area_ha: number;
    canopy: number;
    bare_soil: number;
    slope: number;
    aspect: number;
    drainage: number;
    shade: number;
    uv: number;
    bushfire: number;
    flood: number;
    drought: number;
    proximity: number;
    /** Centroid of the rectangle in [lng, lat] order. */
    centroid: [number, number];
  };
}

/** A GeoJSON FeatureCollection holding all zone polygons. */
export interface ZoneGeoJSON {
  type: 'FeatureCollection';
  features: ZoneFeature[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The canonical list of FeatureVector field names that can be used as the
 * heatmap colouring variable in ZoneMap and ZoneHeatmap.
 */
export const ZONE_FIELDS: readonly string[] = [
  'canopy',
  'bare_soil',
  'slope',
  'aspect',
  'drainage',
  'shade',
  'uv',
  'bushfire',
  'flood',
  'drought',
  'proximity',
] as const;

/**
 * Geographic centre of the synthetic property (central Victoria, Australia).
 * All generated polygons are placed relative to this point.
 */
const CENTRE_LAT = -36.8;
const CENTRE_LNG = 144.0;

/**
 * Approximate conversion factors for WGS84 degrees to metres at the
 * synthetic property latitude.
 *
 *  1° lat ≈ 111 320 m  (nearly constant globally)
 *  1° lng ≈ 111 320 × cos(lat) m  ≈ 89 930 m at -36.8°
 */
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((CENTRE_LAT * Math.PI) / 180);

/**
 * Total property span in degrees (target ~500 m × 500 m footprint).
 * All zones are packed inside this bounding box.
 */
const TOTAL_SPAN_DEG_LAT = 500 / M_PER_DEG_LAT;
const TOTAL_SPAN_DEG_LNG = 500 / M_PER_DEG_LNG;

/** Fractional gap between adjacent zone rectangles (as a share of the bounding box). */
const GAP_FRACTION = 0.01;

// ---------------------------------------------------------------------------
// Core geometry helpers
// ---------------------------------------------------------------------------

/**
 * Converts a rectangular extent defined in [0,1]² normalised coordinates
 * (x = easting fraction, y = northing fraction) into a GeoJSON Polygon ring
 * expressed in WGS84 [longitude, latitude] pairs.
 *
 * @param xMin - Left edge in normalised space [0, 1]
 * @param xMax - Right edge in normalised space [0, 1]
 * @param yMin - Bottom edge in normalised space [0, 1] (south)
 * @param yMax - Top edge in normalised space [0, 1] (north)
 * @returns Closed linear ring: five [lng, lat] coordinate pairs.
 */
function normalisedRectToRing(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): [number, number][] {
  // Convert normalised [0,1] → degrees offset from SW corner of bounding box.
  const swLng = CENTRE_LNG - TOTAL_SPAN_DEG_LNG / 2;
  const swLat = CENTRE_LAT - TOTAL_SPAN_DEG_LAT / 2;

  const lng0 = swLng + xMin * TOTAL_SPAN_DEG_LNG;
  const lng1 = swLng + xMax * TOTAL_SPAN_DEG_LNG;
  const lat0 = swLat + yMin * TOTAL_SPAN_DEG_LAT;
  const lat1 = swLat + yMax * TOTAL_SPAN_DEG_LAT;

  // GeoJSON ring: counter-clockwise, closed (last === first).
  return [
    [lng0, lat0],
    [lng1, lat0],
    [lng1, lat1],
    [lng0, lat1],
    [lng0, lat0],
  ];
}

/**
 * Computes the centroid of a normalised rectangle and converts it to WGS84.
 *
 * @param xMin - Left edge in normalised space [0, 1]
 * @param xMax - Right edge in normalised space [0, 1]
 * @param yMin - Bottom edge in normalised space [0, 1]
 * @param yMax - Top edge in normalised space [0, 1]
 * @returns Centroid as [longitude, latitude].
 */
function normalisedCentroid(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): [number, number] {
  const swLng = CENTRE_LNG - TOTAL_SPAN_DEG_LNG / 2;
  const swLat = CENTRE_LAT - TOTAL_SPAN_DEG_LAT / 2;
  const cxNorm = (xMin + xMax) / 2;
  const cyNorm = (yMin + yMax) / 2;
  return [
    swLng + cxNorm * TOTAL_SPAN_DEG_LNG,
    swLat + cyNorm * TOTAL_SPAN_DEG_LAT,
  ];
}

// ---------------------------------------------------------------------------
// Feature-vector extraction helpers
// ---------------------------------------------------------------------------

/**
 * Reads a numeric field from a pipeline zone's `feature_vector`, trying
 * multiple common key aliases to handle both live and synthetic datasets.
 *
 * @param fv   - The zone's feature_vector record.
 * @param field - The canonical ZONE_FIELDS key.
 * @returns The raw value, or 0 if not found.
 */
function readFvField(fv: Record<string, number>, field: string): number {
  // Direct lookup first.
  if (field in fv) return fv[field];

  // Alias map for fields whose key differs between synthetic and live data.
  const ALIASES: Record<string, string[]> = {
    canopy: ['canopy_cover', 'canopy_fraction'],
    bare_soil: ['bare_soil_fraction', 'bare_soil_pct'],
    slope: ['slope_degrees', 'slope_pct'],
    aspect: ['aspect_degrees'],
    drainage: ['drainage_index', 'drain'],
    shade: ['shade_fraction', 'shade_factor'],
    uv: ['uv_index'],
    bushfire: ['bushfire_risk', 'fire_risk'],
    flood: ['flood_risk', 'fl'],
    drought: ['drought_risk', 'dr'],
    proximity: ['proximity_index', 'prox'],
  };

  const aliases = ALIASES[field] ?? [];
  for (const alias of aliases) {
    if (alias in fv) return fv[alias];
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Public API: generateSyntheticGeoJSON
// ---------------------------------------------------------------------------

/**
 * Generates a GeoJSON FeatureCollection containing one rectangular polygon per
 * pipeline zone. The zones are laid out left-to-right in a single row, each
 * zone's width proportional to its `area_ha`. A fractional gap is inserted
 * between adjacent zones.
 *
 * Coordinate reference system: WGS84 (EPSG:4326), [longitude, latitude] axis order.
 *
 * @param zones - The `zones` array from a `PipelineResponse`.
 * @returns A GeoJSON FeatureCollection suitable for use with react-leaflet's
 *          `<GeoJSON>` component.
 *
 * @example
 * ```ts
 * const geojson = generateSyntheticGeoJSON(pipelineResult.zones);
 * // geojson.features[0].properties.zone_id === 'Z1'
 * ```
 */
export function generateSyntheticGeoJSON(
  zones: PipelineResponse['zones']
): ZoneGeoJSON {
  if (!zones || zones.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  const totalArea = zones.reduce((sum, z) => sum + (z.area_ha ?? 1), 0) || 1;
  const numGaps = Math.max(zones.length - 1, 0);
  const totalGap = numGaps * GAP_FRACTION;
  const availableWidth = 1 - totalGap;

  let xCursor = 0;

  const features: ZoneFeature[] = zones.map((zone) => {
    const areaProportion = (zone.area_ha ?? 1) / totalArea;
    const width = areaProportion * availableWidth;

    const xMin = xCursor;
    const xMax = xCursor + width;
    // Full height (one row layout).
    const yMin = 0;
    const yMax = 1;

    xCursor = xMax + GAP_FRACTION;

    const ring = normalisedRectToRing(xMin, xMax, yMin, yMax);
    const centroid = normalisedCentroid(xMin, xMax, yMin, yMax);
    const fv = zone.feature_vector ?? {};

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
      properties: {
        zone_id: zone.zone_id,
        area_ha: zone.area_ha ?? 0,
        canopy: readFvField(fv, 'canopy'),
        bare_soil: readFvField(fv, 'bare_soil'),
        slope: readFvField(fv, 'slope'),
        aspect: readFvField(fv, 'aspect'),
        drainage: readFvField(fv, 'drainage'),
        shade: readFvField(fv, 'shade'),
        uv: readFvField(fv, 'uv'),
        bushfire: readFvField(fv, 'bushfire'),
        flood: readFvField(fv, 'flood'),
        drought: readFvField(fv, 'drought'),
        proximity: readFvField(fv, 'proximity'),
        centroid,
      },
    };
  });

  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// Public API: normaliseZoneField
// ---------------------------------------------------------------------------

/**
 * Per-field normalisation ranges. Each entry specifies [min, max] for the
 * raw value so it can be mapped to [0, 1] for heatmap display.
 */
const FIELD_RANGES: Record<string, [number, number]> = {
  canopy: [0, 1],
  bare_soil: [0, 1],
  slope: [0, 45],     // degrees
  aspect: [0, 360],   // degrees
  drainage: [0, 1],
  shade: [0, 1],
  uv: [0, 12],        // UV index (WHO scale)
  bushfire: [0, 1],
  flood: [0, 1],
  drought: [0, 1],
  proximity: [0, 1],
};

/**
 * Normalises a zone field value to the [0, 1] range using known physical
 * bounds. Values outside the expected range are clamped.
 *
 * @param zone  - A single zone from `PipelineResponse['zones']`.
 * @param field - One of the keys in `ZONE_FIELDS`.
 * @returns A number in [0, 1].
 *
 * @example
 * ```ts
 * const v = normaliseZoneField(zone, 'slope'); // 0.178 for 8°
 * ```
 */
export function normaliseZoneField(
  zone: PipelineResponse['zones'][0],
  field: string
): number {
  const raw = readFvField(zone.feature_vector ?? {}, field);
  const [lo, hi] = FIELD_RANGES[field] ?? [0, 1];
  if (hi === lo) return 0;
  return Math.max(0, Math.min(1, (raw - lo) / (hi - lo)));
}

// ---------------------------------------------------------------------------
// Public API: getZoneColour
// ---------------------------------------------------------------------------

/**
 * Interpolates between two hex colours given a fraction t ∈ [0, 1].
 *
 * @param colA - Start colour in 6-digit hex format (e.g. '#1a3a1a').
 * @param colB - End colour in 6-digit hex format (e.g. '#4ade80').
 * @param t    - Interpolation parameter [0, 1].
 * @returns Interpolated colour as a CSS hex string.
 */
function lerpColour(colA: string, colB: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

  const [r0, g0, b0] = parse(colA);
  const [r1, g1, b1] = parse(colB);

  const r = r0 + (r1 - r0) * t;
  const g = g0 + (g1 - g0) * t;
  const b = b0 + (b1 - b0) * t;

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Colour ramp definitions per field. Each entry maps a field name to a pair
 * of [lowColour, highColour] hex strings.
 *
 * The convention used throughout:
 *  - Green gradients for beneficial indicators (canopy, drainage).
 *  - Red/amber gradients for risk indicators (bushfire, flood, drought).
 *  - Blue for drainage.
 *  - Neutral amber for physical properties (slope, aspect, uv, shade).
 */
const FIELD_COLOUR_RAMPS: Record<string, [string, string]> = {
  canopy:    ['#111f11', '#4ade80'],   // dark → vivid green
  bare_soil: ['#111111', '#c084fc'],   // dark → purple
  slope:     ['#111820', '#f59e0b'],   // dark → amber
  aspect:    ['#111820', '#818cf8'],   // dark → indigo
  drainage:  ['#0f1e2a', '#38bdf8'],   // dark → sky blue
  shade:     ['#111520', '#94a3b8'],   // dark → slate
  uv:        ['#1a1408', '#fbbf24'],   // dark → yellow
  bushfire:  ['#111111', '#ef4444'],   // dark → red
  flood:     ['#0a1020', '#60a5fa'],   // dark navy → blue
  drought:   ['#1a1008', '#fb923c'],   // dark → orange
  proximity: ['#101010', '#a78bfa'],   // dark → violet
};

/**
 * Returns a CSS colour string for a normalised [0, 1] value of the given
 * field, using field-specific colour ramps (green for canopy, red for
 * bushfire risk, blue for drainage, etc.).
 *
 * @param value - A normalised value in [0, 1] (see `normaliseZoneField`).
 * @param field - One of the keys in `ZONE_FIELDS`.
 * @returns A CSS hex colour string.
 *
 * @example
 * ```ts
 * const col = getZoneColour(0.72, 'canopy'); // '#3acc6b' (vivid green)
 * const col2 = getZoneColour(0.55, 'bushfire'); // '#a02020' (mid red)
 * ```
 */
export function getZoneColour(value: number, field: string): string {
  const t = Math.max(0, Math.min(1, value));
  const ramp = FIELD_COLOUR_RAMPS[field] ?? ['#111111', '#6366f1'];
  return lerpColour(ramp[0], ramp[1], t);
}

// ---------------------------------------------------------------------------
// Public API: zoneFieldLabel
// ---------------------------------------------------------------------------

/**
 * Maps a ZONE_FIELDS key to a human-readable display label suitable for use
 * in dropdowns, legend headers and tooltip content.
 *
 * @param field - One of the keys in `ZONE_FIELDS`.
 * @returns A human-readable string, e.g. 'Canopy Cover' for 'canopy'.
 *
 * @example
 * ```ts
 * zoneFieldLabel('bushfire') // 'Bushfire Risk'
 * zoneFieldLabel('uv')       // 'UV Index'
 * ```
 */
export function zoneFieldLabel(field: string): string {
  const LABELS: Record<string, string> = {
    canopy:    'Canopy Cover',
    bare_soil: 'Bare Soil Fraction',
    slope:     'Slope (degrees)',
    aspect:    'Aspect (degrees)',
    drainage:  'Drainage Index',
    shade:     'Shade Factor',
    uv:        'UV Index',
    bushfire:  'Bushfire Risk',
    flood:     'Flood Risk',
    drought:   'Drought Risk',
    proximity: 'Proximity Index',
  };
  return LABELS[field] ?? field;
}

// ---------------------------------------------------------------------------
// Derived utilities (exported for use in component stats panels)
// ---------------------------------------------------------------------------

/**
 * Computes summary statistics (mean, min, max) for a given field across all
 * zones, returning normalised [0, 1] values.
 *
 * @param zones - The zones array from a `PipelineResponse`.
 * @param field - One of the keys in `ZONE_FIELDS`.
 * @returns An object with `mean`, `min`, and `max` in [0, 1].
 *
 * @example
 * ```ts
 * const stats = computeFieldStats(zones, 'canopy');
 * // { mean: 0.40, min: 0.28, max: 0.60 }
 * ```
 */
export function computeFieldStats(
  zones: PipelineResponse['zones'],
  field: string
): { mean: number; min: number; max: number; rawMean: number; rawMin: number; rawMax: number } {
  if (!zones || zones.length === 0) {
    return { mean: 0, min: 0, max: 0, rawMean: 0, rawMin: 0, rawMax: 0 };
  }

  const normValues = zones.map((z) => normaliseZoneField(z, field));
  const rawValues = zones.map((z) => readFvField(z.feature_vector ?? {}, field));

  const mean = normValues.reduce((s, v) => s + v, 0) / normValues.length;
  const min = Math.min(...normValues);
  const max = Math.max(...normValues);
  const rawMean = rawValues.reduce((s, v) => s + v, 0) / rawValues.length;
  const rawMin = Math.min(...rawValues);
  const rawMax = Math.max(...rawValues);

  return { mean, min, max, rawMean, rawMin, rawMax };
}

/**
 * Returns the display unit string for a given field.
 *
 * @param field - One of the keys in `ZONE_FIELDS`.
 * @returns A unit abbreviation string (e.g. '°', '%', or '').
 */
export function fieldUnit(field: string): string {
  const UNITS: Record<string, string> = {
    canopy:    '%',
    bare_soil: '%',
    slope:     '\u00b0',
    aspect:    '\u00b0',
    drainage:  '',
    shade:     '',
    uv:        '',
    bushfire:  '',
    flood:     '',
    drought:   '',
    proximity: '',
  };
  return UNITS[field] ?? '';
}

/**
 * Formats a raw field value for display in a tooltip or stats table.
 * Percentage fields are multiplied by 100; others are shown to 2 decimal places.
 *
 * @param raw   - The raw value from the feature_vector.
 * @param field - One of the keys in `ZONE_FIELDS`.
 * @returns A formatted string, e.g. '45.00%' for canopy = 0.45.
 */
export function formatFieldValue(raw: number, field: string): string {
  if (field === 'canopy' || field === 'bare_soil') {
    return `${(raw * 100).toFixed(1)}%`;
  }
  if (field === 'slope' || field === 'aspect') {
    return `${raw.toFixed(1)}\u00b0`;
  }
  return raw.toFixed(3);
}

/**
 * Given a zone's feature_vector and the field name, returns a formatted
 * display value string.
 *
 * @param zone  - A pipeline zone object.
 * @param field - One of the keys in `ZONE_FIELDS`.
 * @returns A formatted value string.
 */
export function zoneFieldDisplay(
  zone: PipelineResponse['zones'][0],
  field: string
): string {
  const raw = readFvField(zone.feature_vector ?? {}, field);
  return formatFieldValue(raw, field);
}

/**
 * Returns the gradient CSS string for a field's colour ramp, suitable for use
 * as `background` in a legend bar element.
 *
 * @param field - One of the keys in `ZONE_FIELDS`.
 * @returns A CSS `linear-gradient(...)` string from low to high colour.
 */
export function fieldGradientCSS(field: string): string {
  const ramp = FIELD_COLOUR_RAMPS[field] ?? ['#111111', '#6366f1'];
  return `linear-gradient(to right, ${ramp[0]}, ${ramp[1]})`;
}
