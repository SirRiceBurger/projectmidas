/**
 * ZoneHeatmap.tsx
 *
 * Controls panel for the spatial heatmap displayed in ZoneMap. Provides:
 *  - A dropdown selector to choose which FeatureVector field to colour by.
 *  - A colour gradient legend bar (low → high) for the selected field.
 *  - A compact stats table: mean, min, max values across all zones.
 *
 * Styled to match the MIDAS dark-theme design language using CSS variables.
 * No inline <style> tags — all styling via the `style` prop.
 */

import type { PipelineResponse } from '../data/api';
import {
  ZONE_FIELDS,
  zoneFieldLabel,
  computeFieldStats,
  fieldGradientCSS,
  fieldUnit,
  normaliseZoneField,
  getZoneColour,
  zoneFieldDisplay,
} from '../data/geoUtils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ZoneHeatmapProps {
  /** Currently selected heatmap field. */
  selectedField: string;
  /** Called when the user selects a different field. */
  onFieldChange: (field: string) => void;
  /** Zones from the pipeline response. */
  zones: PipelineResponse['zones'];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders a small colour swatch matching the given field/value combination.
 *
 * @param value - Normalised [0,1] value.
 * @param field - The active heatmap field.
 */
function ColourSwatch({ value, field }: { value: number; field: string }) {
  const colour = getZoneColour(value, field);
  return (
    <span style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: 2,
      background: colour,
      flexShrink: 0,
      border: '1px solid rgba(255,255,255,0.12)',
    }} />
  );
}

// ---------------------------------------------------------------------------
// Main export: ZoneHeatmap
// ---------------------------------------------------------------------------

/**
 * Sidebar control panel for the ZoneMap heatmap layer. Renders above or below
 * the map depending on the parent layout.
 *
 * The stats table shows per-zone values with colour swatches so the user can
 * quickly understand the distribution without reading numbers.
 *
 * @example
 * ```tsx
 * <ZoneHeatmap
 *   selectedField={heatmapField}
 *   onFieldChange={setHeatmapField}
 *   zones={pipelineResult.zones}
 * />
 * ```
 */
export function ZoneHeatmap({ selectedField, onFieldChange, zones }: ZoneHeatmapProps) {
  const stats = computeFieldStats(zones, selectedField);
  const label = zoneFieldLabel(selectedField);
  const unit = fieldUnit(selectedField);
  const gradientCSS = fieldGradientCSS(selectedField);

  /**
   * Format a raw value for display in the stats table.
   * Percentage fields are multiplied by 100, others shown to 2 dp.
   */
  const fmt = (raw: number): string => {
    if (selectedField === 'canopy' || selectedField === 'bare_soil') {
      return `${(raw * 100).toFixed(1)}%`;
    }
    if (selectedField === 'slope' || selectedField === 'aspect') {
      return `${raw.toFixed(1)}${unit}`;
    }
    return raw.toFixed(3);
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>

      {/* ---- Header ---- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Heatmap Layer
        </span>
        <span style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'Geist Mono, monospace',
        }}>
          {zones.length} zone{zones.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ---- Field selector ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}>
          Colour by
        </label>
        <select
          value={selectedField}
          onChange={e => onFieldChange(e.target.value)}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 12,
            padding: '7px 10px',
            outline: 'none',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
            paddingRight: 28,
          }}
        >
          {ZONE_FIELDS.map(field => (
            <option key={field} value={field}>
              {zoneFieldLabel(field)}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Legend gradient bar ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          height: 10,
          borderRadius: 5,
          background: gradientCSS,
          border: '1px solid rgba(255,255,255,0.07)',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Geist Mono, monospace' }}>
            {fmt(stats.rawMin)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Geist Mono, monospace' }}>
            {fmt(stats.rawMax)}
          </span>
        </div>
      </div>

      {/* ---- Summary stats ---- */}
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          borderBottom: '1px solid var(--border)',
        }}>
          {['Mean', 'Min', 'Max'].map(lbl => (
            <div key={lbl} style={{
              padding: '5px 8px',
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderRight: lbl !== 'Max' ? '1px solid var(--border)' : undefined,
            }}>
              {lbl}
            </div>
          ))}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
        }}>
          {[
            { label: 'Mean', raw: stats.rawMean, norm: stats.mean },
            { label: 'Min', raw: stats.rawMin, norm: stats.min },
            { label: 'Max', raw: stats.rawMax, norm: stats.max },
          ].map(({ label, raw, norm }) => (
            <div key={label} style={{
              padding: '7px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRight: label !== 'Max' ? '1px solid var(--border)' : undefined,
            }}>
              <ColourSwatch value={norm} field={selectedField} />
              <span style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                {fmt(raw)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Per-zone breakdown ---- */}
      {zones.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 2,
          }}>
            Per-zone values
          </span>
          {zones.map(zone => {
            const normVal = normaliseZoneField(zone, selectedField);
            const displayVal = zoneFieldDisplay(zone, selectedField);
            const barWidth = `${(normVal * 100).toFixed(1)}%`;
            const colour = getZoneColour(normVal, selectedField);

            return (
              <div key={zone.zone_id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {/* Zone ID pill */}
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  width: 28,
                  flexShrink: 0,
                  fontFamily: 'Geist Mono, monospace',
                }}>
                  {zone.zone_id}
                </span>

                {/* Bar */}
                <div style={{
                  flex: 1,
                  height: 5,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: barWidth,
                    height: '100%',
                    background: colour,
                    borderRadius: 3,
                    transition: 'width 0.25s ease',
                  }} />
                </div>

                {/* Value */}
                <span style={{
                  fontSize: 10,
                  fontFamily: 'Geist Mono, monospace',
                  color: 'var(--text-secondary)',
                  width: 44,
                  textAlign: 'right',
                  flexShrink: 0,
                }}>
                  {displayVal}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
