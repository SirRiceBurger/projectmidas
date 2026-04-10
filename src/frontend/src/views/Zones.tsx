/**
 * Zones.tsx
 *
 * Full-featured Zones view. Two-column layout when wide enough:
 *  - Left column: interactive ZoneMap + ZoneHeatmap controls panel.
 *  - Right column: filterable zone table + selected-zone detail panel.
 *
 * Shared state:
 *  - selectedZoneId: clicking a zone card OR a map polygon selects it in both.
 *  - heatmapField: propagated to both ZoneMap and ZoneHeatmap.
 *
 * Existing zone card content is preserved unchanged; only the map integration
 * and shared selection state are new.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '../components/Card';
import { ZoneMap } from '../components/ZoneMap';
import { ZoneHeatmap } from '../components/ZoneHeatmap';
import { zones as syntheticZones, interventions as syntheticInterventions } from '../data/synthetic';
import type { PipelineResponse } from '../data/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyntheticZone = typeof syntheticZones[number];

interface LiveZoneRow {
  id: string;
  area: number;
  canopy: number;
  bushfireRisk: number;
  slope: number;
  drainage: string;
  feasible: string[];
  feature_vector: Record<string, number>;
  isLive: true;
}

type ZoneRow = SyntheticZone | LiveZoneRow;

function isLiveZone(z: ZoneRow): z is LiveZoneRow {
  return 'isLive' in z;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drainageLabel(idx: number): string {
  if (idx >= 0.65) return 'Good';
  if (idx >= 0.40) return 'Moderate';
  return 'Poor';
}

function buildLiveZones(pipelineResult: PipelineResponse): LiveZoneRow[] {
  return pipelineResult.zones.map(z => {
    const feas = pipelineResult.feasibility.find(f => f.zone_id === z.zone_id);
    const fv = z.feature_vector;
    return {
      id: z.zone_id,
      area: z.area_ha,
      canopy: Math.round((fv.canopy ?? fv.canopy_cover ?? 0) * 100),
      bushfireRisk: fv.bushfire ?? fv.bushfire_risk ?? fv.fl ?? 0,
      slope: fv.slope ?? fv.slope_degrees ?? 0,
      drainage: drainageLabel(fv.drainage ?? fv.drainage_index ?? 0.5),
      feasible: feas?.feasible_intervention_ids ?? [],
      feature_vector: fv,
      isLive: true as const,
    };
  });
}

const ZONE_COLORS = [
  { bg: 'var(--accent-green-dim)', fg: 'var(--accent-green)' },
  { bg: 'rgba(99,102,241,0.15)', fg: '#818cf8' },
  { bg: 'var(--accent-amber-dim)', fg: 'var(--accent-amber)' },
  { bg: 'rgba(168,85,247,0.12)', fg: 'rgb(168,85,247)' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  pipelineResult?: PipelineResponse | null;
  projectName: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Zones({ pipelineResult, projectName }: Props) {
  const isLive = Boolean(pipelineResult);
  const rows: ZoneRow[] = isLive
    ? buildLiveZones(pipelineResult!)
    : syntheticZones;

  // ---- Shared state ----
  const [selectedId, setSelectedId] = useState<string>(rows[0]?.id ?? '');
  const [filter, setFilter] = useState('');
  const [heatmapField, setHeatmapField] = useState('canopy');

  // Refs to zone card elements so we can scroll-into-view on map selection.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedZone = rows.find(z => z.id === selectedId) ?? rows[0];

  const filtered = rows.filter(z =>
    z.id.toLowerCase().includes(filter.toLowerCase()) ||
    z.drainage.toLowerCase().includes(filter.toLowerCase())
  );

  const colorFor = (idx: number) => ZONE_COLORS[idx % ZONE_COLORS.length];

  // When the map selects a zone, also update selectedId and scroll the card into view.
  const handleMapSelectZone = useCallback((zoneId: string) => {
    setSelectedId(zoneId);
    // Defer scroll to after React re-renders.
    setTimeout(() => {
      const el = cardRefs.current[zoneId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }, []);

  // When the selected zone changes via the table, ensure the card is visible.
  useEffect(() => {
    const el = cardRefs.current[selectedId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedId]);

  // ---- Detail row rendering ----

  const renderDetailRows = () => {
    if (!selectedZone) return null;
    if (isLiveZone(selectedZone)) {
      const fv = selectedZone.feature_vector;
      return Object.entries(fv).map(([k, v]) => [k, typeof v === 'number' ? v.toFixed(3) : String(v)]);
    }
    const z = selectedZone as SyntheticZone;
    return [
      ['Area', `${z.area} ha`],
      ['Aspect', z.aspect],
      ['Canopy', `${z.canopy}%`],
      ['Bare Soil', `${z.bareSoil}%`],
      ['Slope', `${z.slope.toFixed(1)}\u00b0`],
      ['Drainage', z.drainage],
      ['UV Index', z.uv.toFixed(2)],
      ['Shade Factor', z.shade.toFixed(2)],
      ['Bushfire Risk', z.bushfireRisk.toFixed(2)],
      ['Flood Risk', z.floodRisk.toFixed(2)],
      ['Drought Risk', z.droughtRisk.toFixed(2)],
      ['Proximity Index', z.proximity.toFixed(2)],
    ];
  };

  const renderFeatureVector = () => {
    if (!selectedZone) return null;
    if (isLiveZone(selectedZone)) {
      const fv = selectedZone.feature_vector;
      const entries = Object.entries(fv).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(3) : v}`);
      return (
        <code className="mono" style={{ color: 'var(--accent)', lineHeight: '1.8', display: 'block', fontSize: '11px' }}>
          x_{selectedZone.id.toLowerCase()} = [<br />
          {entries.map((e, i) => (
            <span key={e}>&nbsp;&nbsp;{e}{i < entries.length - 1 ? ',' : ''}<br /></span>
          ))}
          ]
        </code>
      );
    }
    const z = selectedZone as SyntheticZone;
    return (
      <code className="mono" style={{ color: 'var(--accent)', lineHeight: '1.8', display: 'block', fontSize: '11px' }}>
        x_{z.id.toLowerCase()} = [<br />
        &nbsp;&nbsp;c={z.canopy}%, b={z.bareSoil}%,<br />
        &nbsp;&nbsp;s={z.slope.toFixed(1)}&deg;, a={z.aspect},<br />
        &nbsp;&nbsp;dr={z.drainage}, sh={z.shade.toFixed(2)},<br />
        &nbsp;&nbsp;uv={z.uv.toFixed(2)}, fl={z.floodRisk.toFixed(2)},<br />
        &nbsp;&nbsp;dr={z.droughtRisk.toFixed(2)}, p={z.proximity.toFixed(2)}<br />
        ]
      </code>
    );
  };

  const renderFeasibility = () => {
    if (!selectedZone) return null;

    if (isLive && pipelineResult) {
      const zoneFeas = pipelineResult.feasibility.find(f => f.zone_id === selectedZone.id);
      const feasibleIds = zoneFeas?.feasible_intervention_ids ?? [];

      return pipelineResult.interventions_detail.map(inv => {
        const feasible = feasibleIds.includes(inv.id);
        let reasonText: string;
        if (feasible) {
          reasonText = 'All feasibility constraints satisfied for this zone.';
        } else {
          const excl = pipelineResult.exclusion_reasons.find(r => r.intervention_id === inv.id);
          reasonText = excl?.detail ?? 'Intervention not feasible in this zone.';
        }
        return (
          <div key={inv.id} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${feasible ? 'rgba(62,207,142,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <span className={`badge ${feasible ? 'badge-green' : 'badge-red'}`} style={{ marginTop: '1px', flexShrink: 0 }}>
              {feasible ? 'Pass' : 'Fail'}
            </span>
            <div>
              <div style={{ fontWeight: '500', fontSize: '12px', marginBottom: '2px' }}>
                {inv.id} — {inv.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {reasonText}
              </div>
            </div>
          </div>
        );
      });
    }

    return syntheticInterventions.map(inv => {
      const feasible = selectedZone.feasible.includes(inv.id);
      const synZone = !isLiveZone(selectedZone) ? (selectedZone as SyntheticZone) : null;
      const reason = synZone
        ? (synZone.infeasibleReasons as Record<string, string | undefined>)[inv.id]
        : undefined;
      return (
        <div key={inv.id} style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '12px',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${feasible ? 'rgba(62,207,142,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          <span className={`badge ${feasible ? 'badge-green' : 'badge-red'}`} style={{ marginTop: '1px', flexShrink: 0 }}>
            {feasible ? 'Pass' : 'Fail'}
          </span>
          <div>
            <div style={{ fontWeight: '500', fontSize: '12px', marginBottom: '2px' }}>
              {inv.id} — {inv.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {feasible
                ? 'All feasibility constraints satisfied for this zone.'
                : reason ?? 'Intervention not feasible in this zone.'}
            </div>
          </div>
        </div>
      );
    });
  };

  // ---- Zones to pass to map (pipeline zones or synthetic stubs) ----
  const mapZones: PipelineResponse['zones'] = isLive && pipelineResult
    ? pipelineResult.zones
    : syntheticZones.map(z => ({
        zone_id: z.id,
        area_ha: z.area,
        feature_vector: {
          canopy: z.canopy / 100,
          bare_soil: z.bareSoil / 100,
          slope: z.slope,
          aspect: typeof z.aspect === 'number' ? z.aspect : 0,
          drainage: z.drainage === 'Good' ? 0.8 : z.drainage === 'Moderate' ? 0.55 : 0.3,
          shade: z.shade,
          uv: z.uv,
          bushfire: z.bushfireRisk,
          flood: z.floodRisk,
          drought: z.droughtRisk,
          proximity: z.proximity,
        },
      }));

  const portfolioFeasibility = isLive && pipelineResult
    ? pipelineResult.feasibility
    : [];

  const portfolioIds = isLive && pipelineResult
    ? pipelineResult.portfolio.intervention_ids
    : [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div className="content-area">

        {/* ---- Two-column layout ---- */}
        <div style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'flex-start',
        }}>

          {/* ================================================================
              LEFT COLUMN: Map + heatmap controls
          ================================================================ */}
          <div style={{
            flex: '1.2 1 0',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>

            {/* Page header (in left column so it spans naturally) */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h1 className="page-title">Zones</h1>
                <p className="page-subtitle">Site partitioned into zones z&#8321;...z&#8345; with feature vectors</p>
                {isLive && <span className="badge badge-green" style={{ marginTop: 6, display: 'inline-block' }}>Live</span>}
              </div>
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter zones..."
                style={{
                  width: '180px',
                  marginTop: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  padding: '6px 10px',
                  outline: 'none',
                }}
              />
            </div>

            {/* ---- Interactive Leaflet map ---- */}
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ height: '380px', width: '100%' }}>
                <ZoneMap
                  zones={mapZones}
                  selectedZoneId={selectedId}
                  onSelectZone={handleMapSelectZone}
                  heatmapField={heatmapField}
                  portfolioFeasibility={portfolioFeasibility}
                  portfolioIds={portfolioIds}
                />
              </div>
            </Card>

            {/* ---- Heatmap field selector + legend ---- */}
            <ZoneHeatmap
              selectedField={heatmapField}
              onFieldChange={setHeatmapField}
              zones={mapZones}
            />

            {/* ---- Zone table ---- */}
            <Card style={{ padding: '0', overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    {['Zone', 'Area (ha)', 'Canopy %', 'Bushfire Risk', 'Slope (\u00b0)', 'Drainage', 'Feasible'].map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((zone, idx) => {
                    const col = colorFor(idx);
                    const isSelected = selectedZone?.id === zone.id;
                    return (
                      <tr
                        key={zone.id}
                        ref={el => { cardRefs.current[zone.id] = el; }}
                        onClick={() => setSelectedId(zone.id)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(99,102,241,0.07)' : undefined,
                          outline: isSelected ? '2px solid rgba(99,102,241,0.35)' : undefined,
                          outlineOffset: '-1px',
                          transition: 'background 0.15s',
                        }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '6px',
                              background: col.bg,
                              color: col.fg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: '700',
                              flexShrink: 0,
                            }}>
                              {zone.id}
                            </span>
                            Zone {zone.id}
                          </div>
                        </td>
                        <td className="mono">{typeof zone.area === 'number' ? zone.area.toFixed(1) : zone.area}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '48px', height: '5px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${zone.canopy}%`, height: '100%', background: 'var(--accent-green)', borderRadius: '3px' }} />
                            </div>
                            <span className="mono">{zone.canopy}%</span>
                          </div>
                        </td>
                        <td>
                          <span className="mono" style={{
                            color: zone.bushfireRisk > 0.45 ? 'var(--accent-red)' : zone.bushfireRisk > 0.35 ? 'var(--accent-amber)' : 'var(--accent-green)',
                            fontWeight: '500',
                          }}>
                            {zone.bushfireRisk.toFixed(2)}
                          </span>
                        </td>
                        <td className="mono">{zone.slope.toFixed(1)}&deg;</td>
                        <td>
                          <span className={`badge ${zone.drainage === 'Good' ? 'badge-green' : zone.drainage === 'Moderate' ? 'badge-amber' : 'badge-red'}`}>
                            {zone.drainage}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {isLive
                              ? zone.feasible.map(id => (
                                  <span key={id} className="badge badge-green">{id}</span>
                                ))
                              : ['I1', 'I2', 'I3'].map(id => (
                                  <span key={id} className={`badge ${zone.feasible.includes(id) ? 'badge-green' : 'badge-red'}`}>
                                    {id}
                                  </span>
                                ))
                            }
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>

          {/* ================================================================
              RIGHT COLUMN: Zone detail panel (unchanged from original)
          ================================================================ */}
          <div style={{
            flex: '1 1 0',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
          }}>
            {selectedZone && (
              <>
                {/* ---- Selected zone indicator strip ---- */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#6366f1',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 500 }}>
                    Zone {selectedZone.id}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {typeof selectedZone.area === 'number'
                      ? `${selectedZone.area.toFixed(1)} ha`
                      : selectedZone.area}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {isLive ? 'Live data' : projectName}
                  </span>
                </div>

                {/* ---- Feature vector detail ---- */}
                <Card title={`Zone ${selectedZone.id} — Detail`}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    {renderDetailRows()?.map(([k, v]) => (
                      <div key={k} style={{
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>{k}</div>
                        <div className="mono" style={{ fontSize: '13px', fontWeight: '600' }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="divider" />
                  <h3 style={{ marginBottom: '10px' }}>Feature Vector x_i</h3>
                  <div style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                  }}>
                    {renderFeatureVector()}
                  </div>
                </Card>

                {/* ---- Feasibility outcomes ---- */}
                <Card title="Feasibility Outcomes">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {renderFeasibility()}
                  </div>
                </Card>

                {/* ---- Zone position summary (replaces old SVG zone map) ---- */}
                <Card title="Zone Position">
                  <div style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    padding: '12px',
                  }}>
                    {/* Mini proportional bar diagram */}
                    {(() => {
                      const totalArea = rows.reduce((sum, z) => sum + (typeof z.area === 'number' ? z.area : 0), 0) || 1;
                      return (
                        <div style={{ display: 'flex', gap: 3, alignItems: 'stretch', height: 40 }}>
                          {rows.map((z, idx) => {
                            const pct = ((typeof z.area === 'number' ? z.area : 0) / totalArea * 100);
                            const col = colorFor(idx);
                            const isSelected = z.id === selectedZone.id;
                            return (
                              <div
                                key={z.id}
                                onClick={() => setSelectedId(z.id)}
                                title={`Zone ${z.id} — ${typeof z.area === 'number' ? z.area.toFixed(1) : z.area} ha`}
                                style={{
                                  flex: `0 0 ${pct}%`,
                                  borderRadius: 4,
                                  background: isSelected ? col.fg + '33' : col.bg,
                                  border: `${isSelected ? 2 : 1}px solid ${col.fg}`,
                                  opacity: isSelected ? 1 : 0.5,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'opacity 0.15s',
                                  fontSize: isSelected ? 11 : 10,
                                  fontWeight: isSelected ? 700 : 400,
                                  color: isSelected ? col.fg : 'rgba(255,255,255,0.5)',
                                  fontFamily: 'Geist Mono, monospace',
                                }}
                              >
                                {z.id}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <div style={{
                      marginTop: 8,
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                      fontFamily: 'Geist Mono, monospace',
                    }}>
                      Zone {selectedZone.id} &mdash; {typeof selectedZone.area === 'number' ? selectedZone.area.toFixed(1) : selectedZone.area} ha
                      {` — ${isLive ? 'Live data' : projectName}`}
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
