/**
 * ZoneMap.tsx
 *
 * Interactive Leaflet map that renders pipeline zones as coloured GeoJSON
 * polygons. Each polygon is coloured by a user-selected FeatureVector field
 * (e.g. canopy cover, bushfire risk). The selected zone receives a thick
 * indigo highlight border.
 *
 * Dependencies: leaflet, react-leaflet, @types/leaflet (all installed).
 *
 * The Leaflet default-icon asset paths are patched here to prevent the
 * broken-image bug that occurs in Vite/webpack builds.
 */

import { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon asset resolution in Vite builds.
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

import type { GeoJsonObject } from 'geojson';
import type { PipelineResponse, FeasibilityOut } from '../data/api';
import {
  generateSyntheticGeoJSON,
  getZoneColour,
  normaliseZoneField,
  zoneFieldLabel,
  zoneFieldDisplay,
} from '../data/geoUtils';
import type { ZoneGeoJSON, ZoneFeature } from '../data/geoUtils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ZoneMapProps {
  /** Zones from the pipeline response. */
  zones: PipelineResponse['zones'];
  /** Currently selected zone ID, or null. */
  selectedZoneId: string | null;
  /** Called when the user clicks a zone polygon. */
  onSelectZone: (zoneId: string) => void;
  /** Which FeatureVector field to use for polygon fill colouring. */
  heatmapField: string;
  /** Feasibility data; zones in the portfolio are marked with a centroid marker. */
  portfolioFeasibility?: FeasibilityOut[];
  /** Portfolio intervention IDs — zones containing at least one portfolio
   *  intervention get a centroid marker. */
  portfolioIds?: string[];
}

// ---------------------------------------------------------------------------
// Inner component: FitBounds
// ---------------------------------------------------------------------------

/**
 * A tiny helper component rendered inside the MapContainer that fits the
 * map viewport to the given GeoJSON bounds whenever the data changes.
 */
function FitBounds({ geojson }: { geojson: ZoneGeoJSON }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson || geojson.features.length === 0) return;

    try {
      const layer = L.geoJSON(geojson as unknown as GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24], animate: false });
      }
    } catch {
      // If bounds calculation fails, fall back to centred view.
      map.setView([-36.8, 144.0], 14);
    }
  // Only re-run when features count or IDs change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson.features.map(f => f.properties.zone_id).join(',')]);

  return null;
}

// ---------------------------------------------------------------------------
// Inner component: CentroidMarkers
// ---------------------------------------------------------------------------

/**
 * Renders a circle marker at each zone centroid that appears in the portfolio.
 * Uses vanilla Leaflet (not react-leaflet) for imperative layer management so
 * markers can be cleanly removed when the portfolio changes.
 */
interface CentroidMarkersProps {
  geojson: ZoneGeoJSON;
  portfolioFeasibility: FeasibilityOut[];
  portfolioIds: string[];
}

function CentroidMarkers({
  geojson,
  portfolioFeasibility,
  portfolioIds,
}: CentroidMarkersProps) {
  const map = useMap();
  const markersRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    // Remove previous markers.
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (portfolioIds.length === 0) return;

    // Find zone IDs that have at least one portfolio intervention feasible.
    const zonesWithPortfolio = new Set<string>();
    portfolioFeasibility.forEach(feas => {
      const hasPfx = feas.feasible_intervention_ids.some(id => portfolioIds.includes(id));
      if (hasPfx) zonesWithPortfolio.add(feas.zone_id);
    });

    geojson.features.forEach(feature => {
      if (!zonesWithPortfolio.has(feature.properties.zone_id)) return;

      const [lng, lat] = feature.properties.centroid;
      const marker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#6366f1',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      });

      marker.bindTooltip(
        `<div style="font-size:11px;font-weight:600;color:#6366f1">◉ Portfolio zone</div>` +
        `<div style="font-size:10px;color:#888">${feature.properties.zone_id}</div>`,
        { direction: 'top', offset: [0, -10] }
      );

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [
    map,
    geojson,
    portfolioFeasibility,
    portfolioIds,
  ]);

  return null;
}

// ---------------------------------------------------------------------------
// Main export: ZoneMap
// ---------------------------------------------------------------------------

/**
 * Interactive Leaflet map rendering pipeline zones as GeoJSON polygons.
 *
 * - Each zone polygon is filled using the colour ramp for `heatmapField`.
 * - The selected zone gets an indigo border (weight 3, colour #6366f1).
 * - Hovering a zone shows a tooltip with the zone ID and field value.
 * - Zones containing portfolio interventions show a filled indigo centroid marker.
 * - The map auto-fits to zone bounds on mount and when zones change.
 *
 * The container element controls the map dimensions; pass explicit height/width
 * via the wrapper element in the parent component.
 *
 * @example
 * ```tsx
 * <div style={{ height: 400, width: '100%' }}>
 *   <ZoneMap
 *     zones={pipelineResult.zones}
 *     selectedZoneId={selected}
 *     onSelectZone={setSelected}
 *     heatmapField="canopy"
 *     portfolioFeasibility={pipelineResult.feasibility}
 *     portfolioIds={pipelineResult.portfolio.intervention_ids}
 *   />
 * </div>
 * ```
 */
export function ZoneMap({
  zones,
  selectedZoneId,
  onSelectZone,
  heatmapField,
  portfolioFeasibility = [],
  portfolioIds = [],
}: ZoneMapProps) {
  // Generate GeoJSON from zone data.
  const geojson = generateSyntheticGeoJSON(zones);

  // ---------------------------------------------------------------------------
  // Style function: called by Leaflet for each GeoJSON feature.
  // ---------------------------------------------------------------------------

  const getFeatureStyle = useCallback(
    (feature: ZoneFeature | undefined): L.PathOptions => {
      if (!feature) return {};

      const zone = zones.find(z => z.zone_id === feature.properties.zone_id);
      const normVal = zone ? normaliseZoneField(zone, heatmapField) : 0;
      const fillColour = getZoneColour(normVal, heatmapField);
      const isSelected = feature.properties.zone_id === selectedZoneId;

      return {
        fillColor: fillColour,
        fillOpacity: isSelected ? 0.75 : 0.5,
        color: isSelected ? '#6366f1' : 'rgba(255,255,255,0.25)',
        weight: isSelected ? 3 : 1,
        opacity: 1,
      };
    },
    [zones, heatmapField, selectedZoneId]
  );

  // ---------------------------------------------------------------------------
  // onEachFeature: attaches tooltip + click handler to each polygon.
  // ---------------------------------------------------------------------------

  const onEachFeature = useCallback(
    (feature: ZoneFeature, layer: L.Layer) => {
      const zoneId = feature.properties.zone_id;
      const zone = zones.find(z => z.zone_id === zoneId);
      const normVal = zone ? normaliseZoneField(zone, heatmapField) : 0;
      const displayVal = zone ? zoneFieldDisplay(zone, heatmapField) : '—';
      const fieldLbl = zoneFieldLabel(heatmapField);
      const normPct = (normVal * 100).toFixed(0);

      // Tooltip HTML.
      const tooltipContent = `
        <div style="
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 6px;
          padding: 8px 10px;
          font-family: 'Geist Mono', monospace;
          min-width: 150px;
        ">
          <div style="font-size: 12px; font-weight: 700; color: #f5f5f3; margin-bottom: 4px;">
            Zone ${zoneId}
          </div>
          <div style="font-size: 10px; color: #888; margin-bottom: 6px;">
            ${(feature.properties.area_ha ?? 0).toFixed(1)} ha
          </div>
          <div style="font-size: 11px; color: #aaa;">
            ${fieldLbl}
          </div>
          <div style="font-size: 13px; font-weight: 600; color: #f5f5f3;">
            ${displayVal} <span style="color: #666; font-size: 10px;">(${normPct}th pct.)</span>
          </div>
        </div>
      `;

      (layer as L.Path).bindTooltip(tooltipContent, {
        permanent: false,
        sticky: true,
        opacity: 1,
        className: 'leaflet-tooltip-midas',
      });

      // Click: select zone.
      layer.on('click', () => {
        onSelectZone(zoneId);
      });

      // Hover: slight opacity boost.
      layer.on('mouseover', () => {
        const path = layer as L.Path;
        path.setStyle({ fillOpacity: 0.88 });
      });

      layer.on('mouseout', () => {
        const path = layer as L.Path;
        const isSelected = zoneId === selectedZoneId;
        path.setStyle({ fillOpacity: isSelected ? 0.75 : 0.5 });
      });
    },
    [zones, heatmapField, onSelectZone, selectedZoneId]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!zones || zones.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1117',
        color: 'var(--text-muted)',
        fontSize: 13,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
      }}>
        No zone data available
      </div>
    );
  }

  return (
    <>
      {/* Leaflet tooltip dark-theme override injected once into head */}
      <style>{`
        .leaflet-tooltip-midas {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-tooltip-midas::before {
          display: none !important;
        }
        .leaflet-container {
          background: #0d1117 !important;
          font-family: 'Geist', sans-serif !important;
        }
        .leaflet-control-zoom a {
          background: #1a1a1a !important;
          color: #f5f5f3 !important;
          border-color: #333 !important;
        }
        .leaflet-control-zoom a:hover {
          background: #222 !important;
        }
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.6) !important;
          color: #555 !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: #666 !important;
        }
      `}</style>

      <MapContainer
        center={[-36.8, 144.0]}
        zoom={14}
        style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-sm)' }}
        zoomControl={true}
        attributionControl={true}
      >
        {/* Dark-mode tile layer (CartoDB Dark Matter) */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        {/* Auto-fit bounds to zone extents */}
        <FitBounds geojson={geojson} />

        {/* Zone polygons */}
        <GeoJSON
          key={`${heatmapField}-${selectedZoneId}-${zones.map(z => z.zone_id).join(',')}`}
          data={geojson as unknown as GeoJsonObject}
          style={(feature) => getFeatureStyle(feature as unknown as ZoneFeature)}
          onEachFeature={(feature, layer) =>
            onEachFeature(feature as unknown as ZoneFeature, layer)
          }
        />

        {/* Portfolio centroid markers */}
        {portfolioIds.length > 0 && (
          <CentroidMarkers
            geojson={geojson}
            portfolioFeasibility={portfolioFeasibility}
            portfolioIds={portfolioIds}
          />
        )}
      </MapContainer>
    </>
  );
}
