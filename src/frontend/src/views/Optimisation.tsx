import { useRef } from 'react';
import { Card } from '../components/Card';
import { portfolioComparisons, portfolio } from '../data/synthetic';
import type { PipelineResponse, PipelineParams, DatasetIn, PortfolioComparison } from '../data/api';
import { PortfolioFrontier } from '../components/charts/PortfolioFrontier';
import { CorrelationHeatmap } from '../components/charts/CorrelationHeatmap';

interface Props {
  pipelineResult: PipelineResponse | null;
  params: PipelineParams;
  setParams: (p: PipelineParams) => void;
  onRunPipeline: (dataset?: DatasetIn) => Promise<void>;
}

export function Optimisation({ pipelineResult, params, setParams, onRunPipeline }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleParamChange = (key: 'B' | 'Gamma' | 'beta', value: number) => {
    setParams({ ...params, [key]: value });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onRunPipeline(), 800);
  };

  const isLive = Boolean(pipelineResult);
  const livePortfolio = pipelineResult?.portfolio;

  const svgW = 480;
  const svgH = 300;
  const padL = 60;
  const padR = 30;
  const padT = 20;
  const padB = 50;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const livePorts: PortfolioComparison[] = isLive && pipelineResult?.all_portfolios
    ? [...pipelineResult.all_portfolios].sort((a, b) => {
        if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
        return b.expected_emissions - a.expected_emissions;
      })
    : [];

  const cvarMax = isLive && livePorts.length > 0
    ? Math.max(...livePorts.map(p => p.portfolio_cvar)) * 1.1
    : 140000;
  const carbMax = isLive && livePorts.length > 0
    ? Math.max(...livePorts.map(p => p.expected_emissions)) * 1.1
    : 310;
  const carbMin = isLive && livePorts.length > 0
    ? Math.max(0, Math.min(...livePorts.map(p => p.expected_emissions)) * 0.85)
    : 150;

  const toX = (cvar: number) => padL + (cvar / cvarMax) * plotW;
  const toY = (carb: number) => padT + ((carbMax - carb) / (carbMax - carbMin)) * plotH;

  const gammaLineX = Math.min(Math.max(toX(params.Gamma), padL), padL + plotW);

  const xTicks = isLive
    ? [0, cvarMax * 0.25, cvarMax * 0.5, cvarMax * 0.75, cvarMax].map(v => Math.round(v / 5000) * 5000)
    : [0, 25000, 50000, 75000, 100000, 125000];
  const yTicks = isLive
    ? [carbMin, (carbMin + carbMax) / 2, carbMax].map(v => Math.round(v / 10) * 10)
    : [160, 200, 240, 280];

  const selectedIds = livePortfolio?.intervention_ids ?? portfolio.selected;
  const selectedLabel = selectedIds.slice().sort().join(' + ');

  const displayCost = livePortfolio?.total_cost ?? portfolio.totalCost;
  const displayCvar = livePortfolio?.portfolio_cvar ?? portfolio.portfolioCvar;
  const displayCarbon = livePortfolio?.expected_emissions ?? portfolio.carbon;
  const effectiveB = pipelineResult?.parameters_used?.B ?? params.B;
  const effectiveGamma = pipelineResult?.parameters_used?.Gamma ?? params.Gamma;
  const displayRemaining = effectiveB - displayCost;

  const idToName = (id: string) => {
    const iv = pipelineResult?.interventions_detail.find(i => i.id === id);
    return iv ? iv.name : id;
  };

  const selectedPortfolioLabel = isLive && livePortfolio
    ? livePortfolio.intervention_ids.map(idToName).join(' + ')
    : selectedLabel;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div className="content-area">
    <div style={{ display: 'flex', gap: '16px' }}>
      <div style={{ flex: '1 1 65%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ marginBottom: 8 }}>
          <h1 className="page-title">Optimisation</h1>
          <p className="page-subtitle">CVaR-constrained portfolio frontier · &beta; = {params.beta.toFixed(2)}</p>
          {isLive && <span className="badge badge-green" style={{ marginTop: 6, display: 'inline-block' }}>Live</span>}
        </div>

        <Card style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3>Efficient Frontier</h3>
            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-green)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Selected (feasible)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-red)', opacity: 0.7 }} />
                <span style={{ color: 'var(--text-secondary)' }}>Infeasible (CVaR &gt; &Gamma;)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '2px', height: '14px', background: 'var(--accent-amber)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>&Gamma; = {(params.Gamma / 1000).toFixed(0)}k</span>
              </div>
            </div>
          </div>

          <svg width={svgW} height={svgH} style={{ display: 'block', maxWidth: '100%' }}>
            <defs>
              <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse" x={padL} y={padT}>
                <path d="M 40 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x={padL} y={padT} width={plotW} height={plotH} fill="url(#grid)" />
            <rect x={padL} y={padT} width={plotW} height={plotH} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

            {xTicks.map(t => (
              <g key={t}>
                <line x1={toX(t)} y1={padT} x2={toX(t)} y2={padT + plotH} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                <text x={toX(t)} y={padT + plotH + 16} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">
                  {t === 0 ? '0' : `${(t / 1000).toFixed(0)}k`}
                </text>
              </g>
            ))}

            {yTicks.map(t => (
              <g key={t}>
                <line x1={padL} y1={toY(t)} x2={padL + plotW} y2={toY(t)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                <text x={padL - 8} y={toY(t) + 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="10">{t}</text>
              </g>
            ))}

            <text x={padL + plotW / 2} y={svgH - 6} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">
              Portfolio CVaR (AUD)
            </text>
            <text
              x={12}
              y={padT + plotH / 2}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize="11"
              transform={`rotate(-90, 12, ${padT + plotH / 2})`}
            >
              Expected Carbon (tCO2e)
            </text>

            <line
              x1={gammaLineX}
              y1={padT}
              x2={gammaLineX}
              y2={padT + plotH}
              stroke="var(--accent-amber)"
              strokeWidth="1.5"
              strokeDasharray="5,3"
            />
            <text x={gammaLineX + 4} y={padT + 14} fill="var(--accent-amber)" fontSize="10" fontWeight="600">
              &Gamma; = {(params.Gamma / 1000).toFixed(0)}k
            </text>

            {isLive && livePorts.map(p => {
              const ids = p.intervention_ids.slice().sort().join(' + ');
              const isSelected = livePortfolio
                ? livePortfolio.intervention_ids.slice().sort().join(' + ') === ids
                : false;
              const x = toX(p.portfolio_cvar);
              const y = toY(p.expected_emissions);
              const color = isSelected
                ? '#f4d03f'
                : p.feasible
                  ? 'var(--accent-green)'
                  : 'var(--accent-red)';

              return (
                <g key={ids}>
                  {isSelected && (
                    <circle cx={x} cy={y} r={18} fill="rgba(244,208,63,0.1)" stroke="rgba(244,208,63,0.3)" strokeWidth="1" />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 8 : 6}
                    fill={color}
                    opacity={isSelected ? 1 : p.feasible ? 0.75 : 0.45}
                  />
                  <text x={x} y={y - 14} textAnchor="middle" fill={color} fontSize="11" fontWeight="600">
                    {ids}
                  </text>
                  {!p.feasible && (
                    <text x={x} y={y + 20} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">
                      CVaR breach
                    </text>
                  )}
                </g>
              );
            })}

            {!isLive && (() => {
              const syntheticPoints = portfolioComparisons.map(p => ({
                ...p,
                selected: p.selected,
                feasible: p.feasible,
              }));
              return syntheticPoints.map(p => {
                const x = toX(p.cvar);
                const y = toY(p.carbon);
                const color = p.selected
                  ? 'var(--accent-green)'
                  : p.feasible
                    ? 'var(--accent)'
                    : 'var(--accent-red)';
                return (
                  <g key={p.label}>
                    {p.selected && (
                      <circle cx={x} cy={y} r={18} fill="rgba(62,207,142,0.08)" stroke="rgba(62,207,142,0.25)" strokeWidth="1" />
                    )}
                    <circle cx={x} cy={y} r={p.selected ? 8 : 6} fill={color} opacity={p.selected ? 1 : 0.65} />
                    <text x={x} y={y - 14} textAnchor="middle" fill={color} fontSize="11" fontWeight="600">
                      {p.label}
                    </text>
                    <text x={x} y={y + 20} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">
                      {p.feasible ? '' : 'CVaR breach'}
                    </text>
                  </g>
                );
              });
            })()}
          </svg>
        </Card>
      </div>

      <div style={{ flex: '1 1 35%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Card title="Optimisation Controls">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="label">Budget (B)</label>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>
                  AUD {params.B.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min={100000}
                max={1000000}
                step={10000}
                value={params.B}
                onChange={e => handleParamChange('B', Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                <span>100k</span><span>1,000k</span>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="label">CVaR Cap (&Gamma;)</label>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-amber)' }}>
                  AUD {params.Gamma.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min={10000}
                max={200000}
                step={5000}
                value={params.Gamma}
                onChange={e => handleParamChange('Gamma', Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                <span>10k</span><span>200k</span>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="label">Resilience Weight (&beta;)</label>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-purple)' }}>
                  {params.beta.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={params.beta}
                onChange={e => handleParamChange('beta', Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                <span>0.0</span><span>1.0</span>
              </div>
            </div>
          </div>
        </Card>

        <Card style={{
          border: '1px solid rgba(34,197,94,0.3)',
          background: 'rgba(34,197,94,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span className="badge badge-green">Selected Portfolio</span>
            {isLive && livePortfolio && (
              <span className={`badge ${livePortfolio.feasible ? 'badge-green' : 'badge-red'}`}>
                {livePortfolio.feasible ? 'Feasible' : 'CVaR breach'}
              </span>
            )}
          </div>

          <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-green)', marginBottom: '4px' }}>
            {selectedPortfolioLabel}
          </div>

          {([
            ['Total Cost', `AUD ${displayCost.toLocaleString()} / AUD ${effectiveB.toLocaleString()}`, 'var(--text-primary)'],
            ['Budget Remaining', `AUD ${displayRemaining.toLocaleString()}`, displayRemaining >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'],
            ['Portfolio CVaR', `AUD ${displayCvar.toLocaleString()} / AUD ${effectiveGamma.toLocaleString()}`, 'var(--accent-amber)'],
            ['Expected Carbon', `${typeof displayCarbon === 'number' ? displayCarbon.toFixed(1) : displayCarbon} tCO2e`, 'var(--accent-green)'],
          ] as [string, string, string][]).map(([l, v, c]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{l}</span>
              <span className="mono" style={{ fontWeight: '600', fontSize: '12px', color: c }}>{v}</span>
            </div>
          ))}
        </Card>

        <Card title="Portfolio Comparison">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isLive && livePorts.length > 0 ? livePorts.map(p => {
              const ids = p.intervention_ids.slice().sort().join(' + ');
              const isSelected = livePortfolio
                ? livePortfolio.intervention_ids.slice().sort().join(' + ') === ids
                : false;
              return (
                <div key={ids} style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isSelected ? 'rgba(62,207,142,0.3)' : p.feasible ? 'var(--border)' : 'rgba(239,68,68,0.2)'}`,
                  background: isSelected ? 'rgba(62,207,142,0.05)' : 'var(--bg-elevated)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '600', fontSize: '13px' }}>{ids}</span>
                    <span className={`badge ${isSelected ? 'badge-green' : p.feasible ? 'badge-blue' : 'badge-red'}`}>
                      {isSelected ? 'Selected' : p.feasible ? 'Feasible' : 'CVaR breach'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', fontSize: '11px' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Cost: </span>
                      {(p.total_cost / 1000).toFixed(0)}k
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Carbon: </span>
                      {p.expected_emissions.toFixed(1)}
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>CVaR: </span>
                      <span style={{ color: p.portfolio_cvar > params.Gamma ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                        {(p.portfolio_cvar / 1000).toFixed(0)}k
                      </span>
                    </div>
                  </div>
                  {!p.feasible && p.rejection_reason && (
                    <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--accent-red)', opacity: 0.8 }}>
                      {p.rejection_reason}
                    </div>
                  )}
                </div>
              );
            }) : portfolioComparisons.map(p => (
              <div key={p.label} style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${p.selected ? 'rgba(62,207,142,0.3)' : p.feasible ? 'var(--border)' : 'rgba(239,68,68,0.2)'}`,
                background: p.selected ? 'rgba(62,207,142,0.05)' : 'var(--bg-elevated)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '600', fontSize: '13px' }}>{p.label}</span>
                  <span className={`badge ${p.selected ? 'badge-green' : p.feasible ? 'badge-blue' : 'badge-red'}`}>
                    {p.selected ? 'Selected' : p.feasible ? 'Feasible' : 'CVaR breach'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', fontSize: '11px' }}>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Cost: </span>{(p.cost / 1000).toFixed(0)}k</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Carbon: </span>{p.carbon}</div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>CVaR: </span>
                    <span style={{ color: p.cvar > params.Gamma ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {(p.cvar / 1000).toFixed(0)}k
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    {pipelineResult && (
      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Card title="Portfolio Efficient Frontier Chart">
          <PortfolioFrontier
            allPortfolios={pipelineResult.all_portfolios}
            selectedPortfolio={pipelineResult.portfolio}
          />
        </Card>
        <Card title="CVaR Correlation Heatmap">
          <CorrelationHeatmap
            correlations={pipelineResult.correlations}
            interventions={pipelineResult.interventions_detail}
          />
        </Card>
      </div>
    )}
    </div>
    </div>
    </div>
  );
}
