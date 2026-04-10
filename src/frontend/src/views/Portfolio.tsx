import { useState } from 'react';
import { Card } from '../components/Card';
import { interventions, portfolio, correlations } from '../data/synthetic';
import type { PipelineResponse } from '../data/api';
import { TimelineGantt } from '../components/charts/TimelineGantt';
import { CarbonCurve } from '../components/charts/CarbonCurve';

interface Props {
  pipelineResult?: PipelineResponse | null;
}

const SEGMENT_COLORS = [
  'linear-gradient(90deg, #22c55e, #16a34a)',
  'linear-gradient(90deg, #6366f1, #4f46e5)',
  'linear-gradient(90deg, #f59e0b, #d97706)',
  'linear-gradient(90deg, #a78bfa, #7c3aed)',
  'linear-gradient(90deg, #f87171, #dc2626)',
];

const SEGMENT_DOT_COLORS = ['#22c55e', '#6366f1', '#f59e0b', '#a78bfa', '#f87171'];

function corrLevel(rho: number): { level: string; color: string; cls: string } {
  if (rho > 0.6) return { level: 'High', color: 'var(--accent-red)', cls: 'badge-red' };
  if (rho > 0.3) return { level: 'Moderate', color: 'var(--accent-amber)', cls: 'badge-amber' };
  return { level: 'Low', color: 'var(--accent-green)', cls: 'badge-green' };
}

export function Portfolio({ pipelineResult }: Props) {
  const [whatIfIdx, setWhatIfIdx] = useState<number | null>(null);

  const livePortfolio = pipelineResult?.portfolio;
  const detailMap = Object.fromEntries(
    (pipelineResult?.interventions_detail ?? []).map(iv => [iv.id, iv])
  );

  const selectedIds: string[] = livePortfolio?.intervention_ids ?? portfolio.selected;
  const totalCost = livePortfolio?.total_cost ?? portfolio.totalCost;
  const portfolioCvar = livePortfolio?.portfolio_cvar ?? portfolio.portfolioCvar;
  const carbon = livePortfolio?.expected_emissions ?? portfolio.carbon;

  const B = pipelineResult?.parameters_used?.B ?? portfolio.budget;
  const Gamma = pipelineResult?.parameters_used?.Gamma ?? portfolio.gammaThreshold;

  const selectedDetails = selectedIds.map(id => {
    const d = detailMap[id];
    if (d) return d;
    const s = interventions.find(i => i.id === id);
    if (!s) return null;
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      expected_emissions: s.expectedEmissions,
      success_probability: s.successProbability,
      expected_cost: s.cost,
      cvar_loss: s.cvar,
      maintenance_cost_annual: s.maintenance,
      resilience_score: s.resilience,
    };
  }).filter((d): d is NonNullable<typeof d> => d !== null);

  const totalP = selectedDetails.reduce((s, iv) => s + iv.success_probability, 0);
  const weightedResilience = totalP > 0
    ? selectedDetails.reduce((s, iv) => s + iv.resilience_score * iv.success_probability, 0) / totalP
    : portfolio.resilience;

  const extendedPortfolios = (pipelineResult?.all_portfolios ?? []).filter(p =>
    selectedIds.every((id: string) => p.intervention_ids.includes(id)) &&
    p.intervention_ids.length > selectedIds.length
  );

  const liveCorrelations: Record<string, number> = pipelineResult?.correlations ?? {
    'I1:I2': correlations.rho12,
    'I1:I3': correlations.rho13,
    'I2:I3': correlations.rho23,
  };

  const selectedCorrPairs = Object.entries(liveCorrelations).filter(([key]) => {
    const [a, b] = key.split(':');
    return selectedIds.includes(a) && selectedIds.includes(b);
  });

  const allCorrPairs = Object.entries(liveCorrelations).filter(([key]) => {
    const [a, b] = key.split(':');
    return !selectedIds.includes(a) || !selectedIds.includes(b);
  });

  const getName = (id: string) =>
    detailMap[id]?.name ?? interventions.find(i => i.id === id)?.name ?? id;

  const BLabel = `AUD ${B.toLocaleString()}`;
  const GammaLabel = `AUD ${Gamma.toLocaleString()}`;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div className="content-area">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 className="page-title">Portfolio</h1>
          <p className="page-subtitle">Capital allocation · correlation analysis</p>
          {pipelineResult && <span className="badge badge-blue" style={{ marginTop: 6, display: 'inline-block' }}>Live API result</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: 4 }}>
          <span className="badge badge-green">B = {BLabel}</span>
          <span className="badge badge-amber">&Gamma; = {GammaLabel}</span>
        </div>
      </div>

      <Card title="Capital Allocation">
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Total allocated: <strong style={{ color: 'var(--text-primary)' }}>
                AUD {totalCost.toLocaleString()}
              </strong>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Remaining: <strong style={{ color: B - totalCost < 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                AUD {(B - totalCost).toLocaleString()}
              </strong>
            </span>
          </div>

          <div style={{ height: '32px', borderRadius: '8px', overflow: 'hidden', display: 'flex' }}>
            {selectedDetails.map((iv, idx) => {
              const pct = (iv.expected_cost / totalCost) * 100;
              return (
                <div key={iv.id} style={{
                  width: `${pct}%`,
                  background: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: 'white',
                  transition: 'width 0.3s',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}>
                  {iv.id} {pct.toFixed(1)}%
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
            {selectedDetails.map((iv, idx) => (
              <div key={iv.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: SEGMENT_DOT_COLORS[idx % SEGMENT_DOT_COLORS.length], flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {iv.id} — {iv.name}: AUD {iv.expected_cost.toLocaleString()} ({((iv.expected_cost / totalCost) * 100).toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Card title="Expected Outcomes">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              {
                label: 'Success-adj. Carbon',
                value: `${typeof carbon === 'number' ? carbon.toFixed(1) : carbon} tCO2e`,
                sub: 'E[E(w)] \u00b7 p weighted',
                color: 'var(--accent-green)',
              },
              {
                label: 'Portfolio CVaR (95%)',
                value: `AUD ${portfolioCvar.toLocaleString()}`,
                sub: portfolioCvar <= Gamma
                  ? `Within \u0393 = ${Gamma.toLocaleString()}`
                  : `Exceeds \u0393 = ${Gamma.toLocaleString()} by AUD ${(portfolioCvar - Gamma).toLocaleString()}`,
                color: portfolioCvar <= Gamma ? 'var(--accent-amber)' : 'var(--accent-red)',
              },
              {
                label: 'Resilience Index',
                value: weightedResilience.toFixed(3),
                sub: 'Composite \u03b2-weighted score',
                color: 'var(--accent)',
              },
            ].map(m => (
              <div key={m.label} style={{
                padding: '12px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
              }}>
                <div className="mono" style={{ fontSize: '18px', fontWeight: '700', color: m.color, letterSpacing: '-0.02em' }}>
                  {m.value}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px' }}>{m.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{m.sub}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Correlation Warnings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {selectedCorrPairs.length === 0 && allCorrPairs.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No correlation data available.</div>
            )}

            {selectedCorrPairs.length > 0 && (
              <>
                <div className="label" style={{ marginBottom: '2px' }}>Portfolio pairs</div>
                {selectedCorrPairs.map(([key, rho]) => {
                  const [a, b] = key.split(':');
                  const { level, color, cls } = corrLevel(rho);
                  return (
                    <div key={key} style={{
                      padding: '10px 12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${rho > 0.6 ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '500', fontSize: '12px' }}>&rho;({getName(a)} &mdash; {getName(b)})</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span className="mono" style={{ fontWeight: '700', color, fontSize: '14px' }}>{rho.toFixed(2)}</span>
                          <span className={`badge ${cls}`}>{level}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {rho > 0.6 ? 'High co-movement — key diversification risk' : rho > 0.3 ? 'Moderate co-movement — manageable' : 'Beneficial diversification'}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {allCorrPairs.length > 0 && (
              <>
                <div className="label" style={{ marginTop: '6px', marginBottom: '2px' }}>All correlations</div>
                {allCorrPairs.map(([key, rho]) => {
                  const [a, b] = key.split(':');
                  const { level, color, cls } = corrLevel(rho);
                  return (
                    <div key={key} style={{
                      padding: '10px 12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      opacity: 0.7,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '500', fontSize: '12px' }}>&rho;({getName(a)} &mdash; {getName(b)})</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span className="mono" style={{ fontWeight: '700', color, fontSize: '14px' }}>{rho.toFixed(2)}</span>
                          <span className={`badge ${cls}`}>{level}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Not in selected portfolio</div>
                    </div>
                  );
                })}
              </>
            )}

            {!pipelineResult && (
              <>
                <div className="label" style={{ marginBottom: '2px' }}>All correlations (synthetic)</div>
                {[
                  { key: 'I1:I2', rho: correlations.rho12, note: 'Beneficial diversification — included in portfolio' },
                  { key: 'I2:I3', rho: correlations.rho23, note: 'Moderate co-movement — manageable risk' },
                  { key: 'I1:I3', rho: correlations.rho13, note: 'High co-movement risk — key driver of I3 exclusion' },
                ].map(({ key, rho, note }) => {
                  const [a, b] = key.split(':');
                  const { level, color, cls } = corrLevel(rho);
                  return (
                    <div key={key} style={{
                      padding: '10px 12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${rho > 0.6 ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '500', fontSize: '12px' }}>&rho;({getName(a)} &mdash; {getName(b)})</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span className="mono" style={{ fontWeight: '700', color, fontSize: '14px' }}>{rho.toFixed(2)}</span>
                          <span className={`badge ${cls}`}>{level}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{note}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </Card>
      </div>

      <Card title="What-if Analysis">
        {extendedPortfolios.length === 0 && !pipelineResult && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', marginBottom: '6px' }}>Add I3 — Water Retention &amp; Soil Restoration</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '12px' }}>
                Including I3 (AUD 130,000) would push total cost to AUD 350,000 — exactly at budget.
                However, portfolio CVaR increases to approximately AUD 105,629,
                which <strong style={{ color: 'var(--accent-red)' }}>exceeds &Gamma; = 70,000 by AUD 35,629</strong>.
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{
                  padding: '8px 12px',
                  background: 'var(--accent-red-dim)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                }}>
                  <div style={{ color: 'var(--text-secondary)' }}>CVaR if I3 added</div>
                  <div className="mono" style={{ fontWeight: '700', color: 'var(--accent-red)', fontSize: '15px' }}>AUD 105,629</div>
                  <div style={{ fontSize: '10px', color: 'var(--accent-red)' }}>+82% above current</div>
                </div>
                <div style={{
                  padding: '8px 12px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                }}>
                  <div style={{ color: 'var(--text-secondary)' }}>Carbon if I3 added</div>
                  <div className="mono" style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px' }}>264.9 tCO2e</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>-0.9 vs I1+I2</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {extendedPortfolios.length === 0 && pipelineResult && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            No additional interventions available within budget and CVaR constraints.
          </div>
        )}

        {extendedPortfolios.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {extendedPortfolios.map((scenario, idx) => {
              const addedIds = scenario.intervention_ids.filter(id => !selectedIds.includes(id));
              const addedNames = addedIds.map(getName).join(', ');
              const costDelta = scenario.total_cost - totalCost;
              const carbonDelta = scenario.expected_emissions - Number(carbon);
              const isSelected = whatIfIdx === idx;
              const breachesGamma = scenario.portfolio_cvar > Gamma;
              return (
                <div key={idx} style={{
                  padding: '14px',
                  background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--bg-elevated)',
                  border: `1px solid ${isSelected ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', marginBottom: '6px' }}>
                        Adding {addedNames}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{
                          padding: '8px 12px',
                          background: breachesGamma ? 'var(--accent-red-dim)' : 'var(--bg-elevated)',
                          border: `1px solid ${breachesGamma ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                        }}>
                          <div style={{ color: 'var(--text-secondary)' }}>Portfolio CVaR</div>
                          <div style={{ fontWeight: '700', color: breachesGamma ? 'var(--accent-red)' : 'var(--accent-green)', fontSize: '15px' }}>
                            AUD {scenario.portfolio_cvar.toLocaleString()}
                          </div>
                          {breachesGamma && (
                            <div style={{ fontSize: '10px', color: 'var(--accent-red)' }}>
                              Exceeds &Gamma; by AUD {(scenario.portfolio_cvar - Gamma).toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div style={{
                          padding: '8px 12px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                        }}>
                          <div style={{ color: 'var(--text-secondary)' }}>Total cost</div>
                          <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px' }}>
                            AUD {scenario.total_cost.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            +AUD {costDelta.toLocaleString()}
                          </div>
                        </div>
                        <div style={{
                          padding: '8px 12px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                        }}>
                          <div style={{ color: 'var(--text-secondary)' }}>Carbon</div>
                          <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px' }}>
                            {scenario.expected_emissions.toFixed(1)} tCO2e
                          </div>
                          <div style={{ fontSize: '10px', color: carbonDelta >= 0 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                            {carbonDelta >= 0 ? `+${carbonDelta.toFixed(1)}` : carbonDelta.toFixed(1)} vs current
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        className={`toggle ${isSelected ? 'on' : 'off'}`}
                        onClick={() => setWhatIfIdx(isSelected ? null : idx)}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {isSelected ? 'On' : 'Off'}
                      </span>
                    </div>
                  </div>

                  {isSelected && breachesGamma && (
                    <div style={{
                      marginTop: '10px',
                      padding: '10px 14px',
                      background: 'var(--accent-red-dim)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      <div style={{ fontWeight: '600', color: 'var(--accent-red)', marginBottom: '3px' }}>
                        CVaR Breach — Portfolio infeasible
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Adding {addedNames} violates the CVaR constraint (AUD {scenario.portfolio_cvar.toLocaleString()} &gt; &Gamma; {GammaLabel}). Mercury excludes this combination.
                      </div>
                    </div>
                  )}

                  {isSelected && !breachesGamma && (
                    <div style={{
                      marginTop: '10px',
                      padding: '10px 14px',
                      background: 'rgba(62,207,142,0.06)',
                      border: '1px solid rgba(62,207,142,0.25)',
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      <div style={{ fontWeight: '600', color: 'var(--accent-green)', marginBottom: '3px' }}>
                        Feasible portfolio
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Adding {addedNames} keeps CVaR within &Gamma;. This combination is feasible.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {pipelineResult && (
        <>
          <Card title="Implementation Timeline">
            <TimelineGantt
              portfolio={pipelineResult.portfolio}
              interventions={pipelineResult.interventions_detail}
              horizonYears={pipelineResult.parameters_used?.T ?? 20}
            />
          </Card>
          <Card title="Cumulative Carbon Sequestration">
            <CarbonCurve
              portfolio={pipelineResult.portfolio}
              interventions={pipelineResult.interventions_detail}
              horizonYears={pipelineResult.parameters_used?.T ?? 20}
              scored={pipelineResult.scored}
            />
          </Card>
        </>
      )}
    </div>
    </div>
  );
}
