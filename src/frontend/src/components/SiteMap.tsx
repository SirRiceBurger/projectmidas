/**
 * SiteMap.tsx
 *
 * Compact overview map for the Dashboard view. Renders all pipeline zones as
 * coloured polygons (canopy heatmap by default) with portfolio centroid markers.
 * Clicking anywhere on the map navigates to the Zones view.
 *
 * This component is intentionally minimal — no heatmap controls, no zoom
 * controls, no interactive tooltips. It is purely a visual anchor for the
 * Dashboard and a navigation shortcut to the Zones view.
 *
 * When `zones` is null (pipeline not yet run), a centred "No pipeline data"
 * placeholder is displayed instead of the map.
 */

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import type { GeoJsonObject } from 'geojson';
import type { PipelineResponse, FeasibilityOut, PortfolioOut } from '../data/api';
import {
  generateSyntheticGeoJSON,
  getZoneColour,
  normaliseZoneField,
} from '../data/geoUtils';
import type { ZoneGeoJSON, ZoneFeature } from '../data/geoUtils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SiteMapProps {
  /** Zone data from the pipeline. Null renders a placeholder message. */
  zones: PipelineResponse['zones'] | null;
  /** Feasibility data used to find zones containing portfolio interventions. */
  feasibility: FeasibilityOut[] | null;
  /** Portfolio selection to identify which zones to mark with centroid dots. */
  portfolio: PortfolioOut | null;
  /** Called when the user clicks anywhere on the map. */
  onNavigateToZones: () => void;
  /** Map height in pixels. Defaults to 200. */
  height?: number;
}

// ---------------------------------------------------------------------------
// Inner: AutoFit
// ---------------------------------------------------------------------------

/**
 * Fits the map viewport to the provided GeoJSON bounds. Runs once after mount
 * and whenever the feature count changes.
 */
function AutoFit({ geojson }: { geojson: ZoneGeoJSON }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson || geojson.features.length === 0) return;
    try {
      const layer = L.geoJSON(geojson as unknown as GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [8, 8], animate: false });
      }
    } catch {
      map.setView([-36.8, 144.0], 14);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson.features.length]);

  return null;
}

// ---------------------------------------------------------------------------
// Inner: ClickNavigate
// ---------------------------------------------------------------------------

/**
 * Attaches a map-level click handler that invokes the navigation callback.
 * Uses `useMap` to get the Leaflet instance and imperative event binding.
 */
function ClickNavigate({ onClick }: { onClick: () => void }) {
  const map = useMap();

  useEffect(() => {
    const handler = () => onClick();
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map, onClick]);

  return null;
}

// ---------------------------------------------------------------------------
// Inner: PortfolioMarkers
// ---------------------------------------------------------------------------

/**
 * Renders filled indigo circle markers at zone centroids that contain at least
 * one portfolio intervention. Uses imperative Leaflet so markers are removed
 * cleanly when the portfolio changes.
 */
interface PortfolioMarkersProps {
  geojson: ZoneGeoJSON;
  feasibility: FeasibilityOut[];
  portfolioIds: string[];
}

function PortfolioMarkers({ geojson, feasibility, portfolioIds }: PortfolioMarkersProps) {
  const map = useMap();
  const markersRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (portfolioIds.length === 0) return;

    const zonesWithPortfolio = new Set<string>();
    feasibility.forEach(feas => {
      const hasPfx = feas.feasible_intervention_ids.some(id => portfolioIds.includes(id));
      if (hasPfx) zonesWithPortfolio.add(feas.zone_id);
    });

    geojson.features.forEach(feature => {
      if (!zonesWithPortfolio.has(feature.properties.zone_id)) return;

      const [lng, lat] = feature.properties.centroid;
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        fillColor: '#6366f1',
        color: '#ffffff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.92,
        interactive: false,
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [map, geojson, feasibility, portfolioIds]);

  return null;
}

// ---------------------------------------------------------------------------
// Main export: SiteMap
// ---------------------------------------------------------------------------

/**
 * Compact site overview map for the Dashboard. Presents a quick spatial
 * summary of all zones coloured by canopy cover, with portfolio zones marked.
 * The entire map is clickable and navigates to the Zones view.
 *
 * @example
 * ```tsx
 * <SiteMap
 *   zones={pipelineResult?.zones ?? null}
 *   feasibility={pipelineResult?.feasibility ?? null}
 *   portfolio={pipelineResult?.portfolio ?? null}
 *   onNavigateToZones={() => setView('zones')}
 *   height={220}
 * />
 * ```
 */
export function SiteMap({
  zones,
  feasibility,
  portfolio,
  onNavigateToZones,
  height = 200,
}: SiteMapProps) {
  // ---- Placeholder when no data ----
  if (!zones || zones.length === 0) {
    return (
      <div style={{
        height,
        background: 'linear-gradient(135deg, #0a0f1a, #0d1520)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: 'default',
      }}>
        <span style={{ fontSize: 28, opacity: 0.12, lineHeight: 1 }}>▦</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          No pipeline data — run Mercury to see site map
        </span>
      </div>
    );
  }

  const geojson = generateSyntheticGeoJSON(zones);
  const portfolioIds = portfolio?.intervention_ids ?? [];
  const feasibilityData = feasibility ?? [];

  const getStyle = (feature: ZoneFeature | undefined): L.PathOptions => {
    if (!feature) return {};
    const zone = zones.find(z => z.zone_id === feature.properties.zone_id);
    const normVal = zone ? normaliseZoneField(zone, 'canopy') : 0;
    const fillColour = getZoneColour(normVal, 'canopy');
    return {
      fillColor: fillColour,
      fillOpacity: 0.55,
      color: 'rgba(255,255,255,0.2)',
      weight: 1,
      opacity: 1,
    };
  };

  return (
    <div style={{
      position: 'relative',
      height,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      border: '1px solid var(--border)',
      cursor: 'pointer',
    }}>
      {/* Inject global CSS once for Leaflet dark-theme */}
      <style>{`
        .sitemap-container .leaflet-container {
          background: #0d1117 !important;
        }
        .sitemap-container .leaflet-control-attribution {
          display: none !important;
        }
      `}</style>

      <div className="sitemap-container" style={{ height: '100%', width: '100%' }}>
        <MapContainer
          center={[-36.8, 144.0]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            maxZoom={19}
          />

          <AutoFit geojson={geojson} />
          <ClickNavigate onClick={onNavigateToZones} />

          <GeoJSON
            key={zones.map(z => z.zone_id).join(',')}
            data={geojson as unknown as GeoJsonObject}
            style={(feature) => getStyle(feature as unknown as ZoneFeature)}
          />

          <PortfolioMarkers
            geojson={geojson}
            feasibility={feasibilityData}
            portfolioIds={portfolioIds}
          />
        </MapContainer>
      </div>

      {/* Click-to-explore overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          zIndex: 1000,
          fontSize: 10,
          color: 'rgba(255,255,255,0.45)',
          pointerEvents: 'none',
          fontFamily: 'Geist, sans-serif',
          letterSpacing: '0.03em',
        }}
      >
        Click to explore
      </div>

      {/* Canopy legend pill */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(0,0,0,0.65)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: '3px 10px',
        pointerEvents: 'none',
      }}>
        <span style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: 2,
          background: 'linear-gradient(to right, #111f11, #4ade80)',
        }} />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'Geist, sans-serif' }}>
          Canopy cover
        </span>
      </div>

      {/* Portfolio count badge */}
      {portfolioIds.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 12,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: 'rgba(99,102,241,0.25)',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 12,
          padding: '3px 10px',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 9, color: '#818cf8', fontFamily: 'Geist Mono, monospace', fontWeight: 600 }}>
            ◉ {portfolioIds.length} selected
          </span>
        </div>
      )}
    </div>
  );
}
