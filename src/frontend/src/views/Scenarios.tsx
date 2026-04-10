import { useState, useRef } from 'react';
import { Card } from '../components/Card';
import { scenarioPercentiles, parameters, interventions } from '../data/synthetic';
import type { PipelineResponse, PipelineParams, DatasetIn, ScenarioStats } from '../data/api';
import { MonteCarloDistribution } from '../components/charts/MonteCarloDistribution';

interface Props {
  pipelineResult: PipelineResponse | null;
  params: PipelineParams;
  setParams: (p: PipelineParams) => void;
  onRunPipeline: (dataset?: DatasetIn) => Promise<void>;
}

const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString();

export function Scenarios({ pipelineResult, params, setParams, onRunPipeline }: Props) {
  const [stressTest, setStressTest] = useState(false);
  const [seed, setSeed] = useState(String(parameters.seed));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleParamChange = (key: 'S' | 'T', value: number) => {
    setParams({ ...params, [key]: value });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onRunPipeline(), 800);
  };

  const histogramBars = (p5: number, p50: number, p95: number, color: string) => {
    const barCount = 12;
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const mean = p50;
      const std = (p95 - p5) / 3.92;
      const x = p5 + (i / (barCount - 1)) * (p95 - p5);
      const density = Math.exp(-0.5 * Math.pow((x - mean) / std, 2));
      bars.push(density);
    }
    const maxDensity = Math.max(...bars);
    return bars.map((b) => ({ height: (b / maxDensity) * 60, color }));
  };

  const isLive = Boolean(pipelineResult);
  const displayS = isLive ? pipelineResult!.parameters_used.S : params.S;
  const displayT = isLive ? pipelineResult!.parameters_used.T : params.T;

  const maxP95 = isLive && pipelineResult
    ? Math.max(...Object.values(pipelineResult.scenario_distributions).map((d: ScenarioStats) => d.e_p95), 1)
    : 1;

  const percentileBarHeights = (dist: ScenarioStats) => {
    const values = [dist.e_p5, dist.e_p25, dist.e_p50, dist.e_p75, dist.e_p95];
    return values.map(v => (v / maxP95) * 60);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div className="content-area">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 className="page-title">Scenarios</h1>
          <p className="page-subtitle">{displayS.toLocaleString()} Monte Carlo scenarios · T = {displayT} years</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: 4 }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Stress Test Mode</span>
          <button
            className={`toggle ${stressTest ? 'on' : 'off'}`}
            onClick={() => setStressTest(s => !s)}
          />
        </div>
      </div>

      <div style={{
        padding: '10px 14px',
        background: isLive ? 'rgba(62,207,142,0.06)' : 'rgba(99,102,241,0.06)',
        border: `1px solid ${isLive ? 'rgba(62,207,142,0.2)' : 'rgba(99,102,241,0.2)'}`,
        borderRadius: 'var(--radius-sm)',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}>
        {isLive
          ? `Live data — ${displayS.toLocaleString()} scenarios over ${displayT}-year horizon from pipeline.`
          : 'Scenario distributions are based on the synthetic calibration. Connect the /simulate endpoint for live distributions.'}
      </div>

      <Card title="Simulation Controls">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="label">Scenarios (S)</label>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>
                {params.S.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={100}
              max={5000}
              step={100}
              value={params.S}
              onChange={e => handleParamChange('S', Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>100</span><span>5,000</span>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="label">Horizon (T years)</label>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>{params.T} yr</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={params.T}
              onChange={e => handleParamChange('T', Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>5 yr</span><span>30 yr</span>
            </div>
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: '8px' }}>Random Seed</label>
            <input
              value={seed}
              onChange={e => setSeed(e.target.value)}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Distributions: emissions lognormal, cost normal
            </div>
          </div>
        </div>

        {stressTest && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: 'var(--accent-amber-dim)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <div style={{ fontWeight: '600', color: 'var(--accent-amber)', marginBottom: '4px' }}>
              Stress Test Mode Active
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Applying climate shock scenarios: +1.5&deg;C warming offset, 20% drought frequency increase, tail-risk amplification x1.4
            </div>
          </div>
        )}
      </Card>

      {isLive && pipelineResult ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {pipelineResult.interventions_detail.map((iv, idx) => {
            const dist = pipelineResult.scenario_distributions[iv.id];
            if (!dist) return null;
            const colors = ['var(--accent-green)', 'var(--accent)', 'var(--accent-amber)'];
            const color = colors[idx % colors.length];
            const heights = percentileBarHeights(dist);
            const pctLabels = ['P5', 'P25', 'P50', 'P75', 'P95'];

            return (
              <Card key={iv.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span className="badge badge-purple">{iv.id}</span>
                  <span style={{ fontWeight: '600', fontSize: '13px' }}>{iv.name}</span>
                </div>

                <div className="label" style={{ marginBottom: '6px' }}>Emissions Distribution (tCO2e)</div>
                <div style={{ height: '70px', display: 'flex', alignItems: 'flex-end', gap: '4px', marginBottom: '4px' }}>
                  {heights.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: `${Math.max(h, 2)}px`,
                        background: color,
                        opacity: 0.45 + (i / heights.length) * 0.55,
                        borderRadius: '2px 2px 0 0',
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  {pctLabels.map(l => <span key={l}>{l}</span>)}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {([
                    ['E P50', `${dist.e_p50.toFixed(1)} tCO2e`],
                    ['E range', `${dist.e_p5.toFixed(1)} \u2013 ${dist.e_p95.toFixed(1)} tCO2e`],
                    ['K P50', `AUD ${Math.round(dist.k_p50).toLocaleString()}`],
                    ['L P95 (CVaR proxy)', `AUD ${Math.round(dist.l_p95).toLocaleString()}`],
                  ] as [string, string][]).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                      <span className="mono" style={{ fontWeight: '500' }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '10px', padding: '8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Success probability p</span>
                    <span style={{ color, fontWeight: '600' }}>{iv.success_probability.toFixed(2)}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {scenarioPercentiles.map((sp, idx) => {
            const inv = interventions[idx];
            const colors = ['var(--accent-green)', 'var(--accent)', 'var(--accent-amber)'];
            const color = colors[idx];
            const emBars = histogramBars(sp.emissions.p5, sp.emissions.p50, sp.emissions.p95, color);

            return (
              <Card key={sp.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span className="badge badge-purple">{sp.id}</span>
                  <span style={{ fontWeight: '600', fontSize: '13px' }}>{sp.name}</span>
                </div>

                <div className="label" style={{ marginBottom: '6px' }}>Emissions Distribution (tCO2e)</div>
                <div style={{ height: '70px', display: 'flex', alignItems: 'flex-end', gap: '2px', marginBottom: '8px' }}>
                  {emBars.map((bar, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: `${bar.height}px`,
                        background: color,
                        opacity: 0.6 + (bar.height / 60) * 0.4,
                        borderRadius: '2px 2px 0 0',
                        minHeight: '2px',
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                  {[
                    { label: 'P5', value: `${sp.emissions.p5}` },
                    { label: 'P50', value: `${sp.emissions.p50}` },
                    { label: 'P95', value: `${sp.emissions.p95}` },
                  ].map(p => (
                    <div key={p.label} style={{ textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: '6px', padding: '6px' }}>
                      <div className="mono" style={{ fontSize: '13px', fontWeight: '700', color }}>{p.value}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{p.label} tCO2e</div>
                    </div>
                  ))}
                </div>

                <div className="divider" style={{ margin: '10px 0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {([
                    ['Cost P5', `AUD ${fmtK(sp.cost.p5)}`],
                    ['Cost P95', `AUD ${fmtK(sp.cost.p95)}`],
                    ['CVaR P50', `AUD ${fmtK(sp.cvar.p50)}`],
                    ['CVaR P95', `AUD ${fmtK(sp.cvar.p95)}`],
                  ] as [string, string][]).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '4px 0' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                      <span className="mono" style={{ fontWeight: '500' }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '10px', padding: '8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Success probability p</span>
                    <span style={{ color, fontWeight: '600' }}>{inv.successProbability.toFixed(2)}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {isLive && pipelineResult ? (
        <Card title="Percentile Summary Table — All Interventions">
          <table>
            <thead>
              <tr>
                <th>Intervention</th>
                <th>E P5</th>
                <th>E P50</th>
                <th>E P95</th>
                <th>K P50</th>
                <th>L P95</th>
              </tr>
            </thead>
            <tbody>
              {pipelineResult.interventions_detail.map(iv => {
                const dist = pipelineResult.scenario_distributions[iv.id];
                if (!dist) return null;
                return (
                  <tr key={iv.id}>
                    <td>
                      <span className="badge badge-purple">{iv.id}</span>
                      <span style={{ marginLeft: '6px', fontSize: '11px' }}>{iv.name}</span>
                    </td>
                    <td className="mono">{dist.e_p5.toFixed(1)}</td>
                    <td className="mono" style={{ fontWeight: '600' }}>{dist.e_p50.toFixed(1)}</td>
                    <td className="mono">{dist.e_p95.toFixed(1)}</td>
                    <td className="mono">AUD {Math.round(dist.k_p50).toLocaleString()}</td>
                    <td className="mono" style={{ color: dist.l_p95 > 70000 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                      AUD {Math.round(dist.l_p95).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card title="Percentile Summary Table — All Interventions">
          <table>
            <thead>
              <tr>
                <th>Intervention</th>
                <th>E P5</th>
                <th>E P50</th>
                <th>E P95</th>
                <th>Cost P5</th>
                <th>Cost P50</th>
                <th>Cost P95</th>
                <th>CVaR P5</th>
                <th>CVaR P50</th>
                <th>CVaR P95</th>
              </tr>
            </thead>
            <tbody>
              {scenarioPercentiles.map(sp => (
                <tr key={sp.id}>
                  <td><span className="badge badge-purple">{sp.id}</span></td>
                  <td className="mono">{sp.emissions.p5}</td>
                  <td className="mono" style={{ fontWeight: '600' }}>{sp.emissions.p50}</td>
                  <td className="mono">{sp.emissions.p95}</td>
                  <td className="mono">{fmtK(sp.cost.p5)}</td>
                  <td className="mono" style={{ fontWeight: '600' }}>{fmtK(sp.cost.p50)}</td>
                  <td className="mono">{fmtK(sp.cost.p95)}</td>
                  <td className="mono">{fmtK(sp.cvar.p5)}</td>
                  <td className="mono" style={{ fontWeight: '600', color: sp.cvar.p50 > 60000 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                    {fmtK(sp.cvar.p50)}
                  </td>
                  <td className="mono" style={{ color: sp.cvar.p95 > 70000 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                    {fmtK(sp.cvar.p95)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {pipelineResult && (
        <Card title="Monte Carlo Loss Distribution Chart">
          <MonteCarloDistribution
            scenarios={pipelineResult.scenario_distributions}
            interventions={pipelineResult.interventions_detail}
            portfolio={pipelineResult.portfolio}
          />
        </Card>
      )}
    </div>
    </div>
  );
}
