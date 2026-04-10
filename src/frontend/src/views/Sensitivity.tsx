import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { Card } from '../components/Card';
import { SensitivityTornado } from '../components/charts/SensitivityTornado';
import { runSensitivity } from '../data/api';
import { SYNTHETIC_DATASET } from '../data/synthetic';
import type {
  PipelineResponse,
  PipelineParams,
  SensitivityResponse,
  ParameterSweep,
} from '../data/api';

interface Props {
  pipelineResult: PipelineResponse | null;
  params: PipelineParams;
  onRunPipeline: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const PARAM_LABELS: Record<string, string> = {
  B: 'B — Budget (AUD)',
  Gamma: '\u0393 — CVaR Cap (AUD)',
  beta: '\u03b2 — Resilience Weight',
  lambda_: '\u03bb — Risk Penalty',
  T: 'T — Horizon (years)',
};

const PARAM_SHORT: Record<string, string> = {
  B: 'B',
  Gamma: '\u0393',
  beta: '\u03b2',
  lambda_: '\u03bb',
  T: 'T',
};

function fmtParamValue(param: string, value: number): string {
  if (param === 'B' || param === 'Gamma') {
    return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString();
  }
  if (param === 'T') return `${value}yr`;
  return value.toFixed(2);
}

function fmtScore(v: number): string {
  if (v === 0) return '0';
  return v > 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(1);
}

// Sobol sensitivity tier colours.
function sobolColor(value: number): string {
  if (value >= 0.35) return '#ef4444'; // red — high
  if (value >= 0.15) return '#f59e0b'; // amber — medium
  return '#22c55e'; // green — low
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK_DIM: any = { fontFamily: "'Geist Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.5)' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK_MID: any = { fontFamily: "'Geist Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.4)' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK_CAT: any = { fontFamily: "'Geist Mono', monospace", fontSize: 13, fill: 'rgba(255,255,255,0.7)' };

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

interface SweepLineChartProps {
  sweep: ParameterSweep;
  interventionNames: Record<string, string>;
}

const IV_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#38bdf8'];

function SweepLineChart({ sweep, interventionNames }: SweepLineChartProps) {
  const ivIds = Object.keys(sweep.metric_by_intervention);

  // Build recharts data: one point per sweep step.
  const data = sweep.values.map((val, idx) => {
    const point: Record<string, number> = { paramVal: val };
    for (const ivId of ivIds) {
      point[ivId] = sweep.metric_by_intervention[ivId][idx] ?? 0;
    }
    point['_portfolioScore'] = sweep.portfolio_scores[idx] ?? 0;
    return point;
  });

  const maxRace = Math.max(
    ...ivIds.flatMap(id => sweep.metric_by_intervention[id]),
    1e-10,
  );

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
        RACE scores per intervention as {PARAM_SHORT[sweep.parameter] ?? sweep.parameter} varies
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 10 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <XAxis
            dataKey="paramVal"
            tickFormatter={(v) => fmtParamValue(sweep.parameter, v)}
            tick={AXIS_TICK_DIM}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => (v as number).toExponential(1)}
            tick={AXIS_TICK_MID}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            domain={[0, maxRace * 1.15]}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(14,16,23,0.97)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 8,
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
            }}
            labelFormatter={(v) => `${PARAM_SHORT[sweep.parameter]}=${fmtParamValue(sweep.parameter, v as number)}`}
            formatter={(v, name) => [(v as number).toExponential(3), interventionNames[name as string] ?? name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}
            formatter={(value) => interventionNames[value] ?? value}
          />
          {ivIds.map((ivId, i) => (
            <Line
              key={ivId}
              type="monotone"
              dataKey={ivId}
              stroke={IV_COLORS[i % IV_COLORS.length]}
              strokeWidth={2}
              dot={false}
              name={ivId}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface PortfolioSweepChartProps {
  sweep: ParameterSweep;
}

function PortfolioSweepChart({ sweep }: PortfolioSweepChartProps) {
  const data = sweep.values.map((val, idx) => ({
    paramVal: val,
    score: sweep.portfolio_scores[idx] ?? 0,
    portfolioSize: sweep.selected_portfolios[idx]?.length ?? 0,
  }));

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
        Portfolio objective score as {PARAM_SHORT[sweep.parameter] ?? sweep.parameter} varies
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 20, bottom: 4, left: 10 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <XAxis
            dataKey="paramVal"
            tickFormatter={(v) => fmtParamValue(sweep.parameter, v)}
            tick={AXIS_TICK_DIM}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => fmtScore(v as number)}
            tick={AXIS_TICK_MID}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(14,16,23,0.97)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 8,
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
            }}
            labelFormatter={(v) => `${PARAM_SHORT[sweep.parameter]}=${fmtParamValue(sweep.parameter, v as number)}`}
            formatter={(v, name) => [
              name === 'score' ? fmtScore(v as number) : v,
              name === 'score' ? 'Portfolio Score' : 'Portfolio Size',
            ]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            name="score"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sobol bar chart
// ---------------------------------------------------------------------------

interface SobolChartProps {
  sobol: Record<string, number>;
  mostSensitive: string;
  leastSensitive: string;
}

function SobolChart({ sobol, mostSensitive, leastSensitive }: SobolChartProps) {
  const data = Object.entries(sobol)
    .map(([param, value]) => ({ param: PARAM_SHORT[param] ?? param, fullParam: param, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Fraction of total portfolio score variance explained by each parameter sweep.
        Higher = more influential on outcome.
      </div>
      <ResponsiveContainer width="100%" height={data.length * 44 + 40}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 80, bottom: 8, left: 60 }}
        >
          <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => `${((v as number) * 100).toFixed(0)}%`}
            tick={AXIS_TICK_DIM}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="param"
            tick={AXIS_TICK_CAT}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(14,16,23,0.97)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 8,
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
            }}
            formatter={(v, _name, props) => [
              `${((v as number) * 100).toFixed(1)}%`,
              PARAM_LABELS[(props.payload as { fullParam?: string })?.fullParam ?? ''] ?? (props.payload as { fullParam?: string })?.fullParam ?? '',
            ]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={sobolColor(entry.value)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Most sensitive', param: mostSensitive, color: '#ef4444' },
          { label: 'Least sensitive', param: leastSensitive, color: '#22c55e' },
        ].map(({ label, param, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{label}:</span>
            <span style={{ color, fontFamily: "'Geist Mono', monospace", fontWeight: 600 }}>
              {PARAM_LABELS[param] ?? param}
            </span>
            <span style={{ color: 'var(--text-muted)', fontFamily: "'Geist Mono', monospace" }}>
              ({((sobol[param] ?? 0) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  result: SensitivityResponse;
  interventionNames: Record<string, string>;
}

function SummaryCard({ result, interventionNames }: SummaryCardProps) {
  const basePortfolioNames = result.base_portfolio
    .map(id => interventionNames[id] ?? id)
    .join(', ');

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 16,
    }}>
      {[
        {
          label: 'Base Portfolio',
          value: result.base_portfolio.length > 0 ? result.base_portfolio.join(' + ') : 'None',
          sub: basePortfolioNames,
          color: 'var(--accent)',
        },
        {
          label: 'Most Sensitive Parameter',
          value: PARAM_SHORT[result.most_sensitive_parameter] ?? result.most_sensitive_parameter,
          sub: PARAM_LABELS[result.most_sensitive_parameter] ?? '',
          color: '#ef4444',
        },
        {
          label: 'Least Sensitive Parameter',
          value: PARAM_SHORT[result.least_sensitive_parameter] ?? result.least_sensitive_parameter,
          sub: PARAM_LABELS[result.least_sensitive_parameter] ?? '',
          color: '#22c55e',
        },
      ].map(({ label, value, sub, color }) => (
        <div key={label} style={{
          padding: '16px',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label}
          </div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, fontWeight: 700, color, marginBottom: 4 }}>
            {value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function Sensitivity({ pipelineResult, params, onRunPipeline }: Props) {
  const [sensitivityResult, setSensitivityResult] = useState<SensitivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('B');

  // Build intervention name map for display.
  const interventionNames: Record<string, string> = {};
  if (pipelineResult) {
    for (const iv of pipelineResult.interventions_detail) {
      interventionNames[iv.id] = iv.name;
    }
  }

  const handleRunSensitivity = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use the last-run dataset or fall back to synthetic.
      const dataset = SYNTHETIC_DATASET;
      const result = await runSensitivity(dataset, params);
      setSensitivityResult(result);
      // Default to first parameter tab.
      if (result.sweeps.length > 0) {
        setActiveTab(result.sweeps[0].parameter);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sensitivity run failed');
    } finally {
      setLoading(false);
    }
  };

  // Empty state when pipeline hasn't been run yet.
  if (!pipelineResult) {
    return (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="content-area">
          <h1 className="page-title">Sensitivity Analysis</h1>
          <p className="page-subtitle">
            Parameter sweep · Sobol first-order indices · Tornado chart
          </p>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '80px 0',
          }}>
            <div style={{
              padding: '40px 48px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              textAlign: 'center',
              maxWidth: 480,
            }}>
              <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>◬</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                Run the Mercury Pipeline First
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
                The sensitivity analysis requires a completed pipeline run to identify
                feasible interventions and compute base portfolio results.
              </div>
              <button
                className="btn btn-primary"
                onClick={() => onRunPipeline()}
              >
                Run Pipeline
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeSweep = sensitivityResult?.sweeps.find(s => s.parameter === activeTab);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div className="content-area">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 className="page-title">Sensitivity Analysis</h1>
            <p className="page-subtitle">
              Parameter sweep across B, {'\u0393'}, {'\u03b2'}, {'\u03bb'}, T · Sobol first-order indices
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleRunSensitivity}
            disabled={loading}
            style={{ marginTop: 4, minWidth: 160 }}
          >
            {loading ? 'Computing\u2026' : 'Run Sensitivity'}
          </button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            color: '#f87171',
            marginBottom: 24,
          }}>
            {error}
          </div>
        )}

        {/* Tornado chart (computed locally from pipeline result — fast) */}
        <Card title="Parameter Sensitivity — Tornado Chart">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Local RACE sensitivity to ±20% parameter variation.
            No additional API call needed — computed from current pipeline results.
          </div>
          <SensitivityTornado
            scored={pipelineResult.scored}
            interventions={pipelineResult.interventions_detail}
            params={params}
          />
        </Card>

        {/* Full sensitivity run (requires API call) */}
        {!sensitivityResult && !loading && (
          <div style={{
            marginTop: 24,
            padding: '20px 24px',
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Full Parameter Sweep
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Sweep each parameter across its full range. Computes Sobol first-order
                sensitivity indices and per-step portfolio selection. Uses S=200 for speed.
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleRunSensitivity}
              style={{ flexShrink: 0 }}
            >
              Run Full Sweep
            </button>
          </div>
        )}

        {loading && (
          <div style={{
            marginTop: 24,
            padding: '20px 24px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                Running Sensitivity Analysis
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Sweeping B, {'\u0393'}, {'\u03b2'}, {'\u03bb'}, T across 8 steps each\u2026
              </div>
            </div>
          </div>
        )}

        {sensitivityResult && (
          <>
            {/* Summary cards */}
            <Card title="Sensitivity Summary">
              <SummaryCard result={sensitivityResult} interventionNames={interventionNames} />
            </Card>

            {/* Sobol indices */}
            <Card title="Parameter Importance — Sobol First-Order Indices">
              <SobolChart
                sobol={sensitivityResult.sobol_first_order}
                mostSensitive={sensitivityResult.most_sensitive_parameter}
                leastSensitive={sensitivityResult.least_sensitive_parameter}
              />
            </Card>

            {/* Parameter sweep section with tab strip */}
            <Card title="Parameter Sweeps — RACE Scores & Portfolio Score">
              {/* Tab strip */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
                {sensitivityResult.sweeps.map((sweep) => {
                  const isActive = activeTab === sweep.parameter;
                  return (
                    <button
                      key={sweep.parameter}
                      onClick={() => setActiveTab(sweep.parameter)}
                      style={{
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: isActive ? 700 : 500,
                        fontFamily: "'Geist Mono', monospace",
                        background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                        border: `1px solid ${isActive ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 6,
                        color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer',
                        transition: 'background 0.1s, color 0.1s, border-color 0.1s',
                      }}
                    >
                      {PARAM_SHORT[sweep.parameter] ?? sweep.parameter}
                      <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 10 }}>
                        {sweep.values.length} steps
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeSweep && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Parameter label banner */}
                  <div style={{
                    padding: '8px 14px',
                    background: 'rgba(99,102,241,0.06)',
                    border: '1px solid rgba(99,102,241,0.15)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {PARAM_LABELS[activeSweep.parameter] ?? activeSweep.parameter}
                      </strong>
                      {' — '}range: {fmtParamValue(activeSweep.parameter, activeSweep.values[0])} to{' '}
                      {fmtParamValue(activeSweep.parameter, activeSweep.values[activeSweep.values.length - 1])}
                    </span>
                    <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>
                      Sobol index: {((sensitivityResult.sobol_first_order[activeSweep.parameter] ?? 0) * 100).toFixed(1)}%
                    </span>
                  </div>

                  {/* RACE line chart */}
                  <SweepLineChart
                    sweep={activeSweep}
                    interventionNames={interventionNames}
                  />

                  {/* Portfolio score chart */}
                  <PortfolioSweepChart sweep={activeSweep} />

                  {/* Portfolio selection table */}
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      Selected portfolio at each sweep step
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>{PARAM_SHORT[activeSweep.parameter]}</th>
                            <th>Portfolio</th>
                            <th>Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeSweep.values.map((val, idx) => {
                            const portfolio = activeSweep.selected_portfolios[idx] ?? [];
                            const score = activeSweep.portfolio_scores[idx] ?? 0;
                            return (
                              <tr key={idx}>
                                <td className="mono">{fmtParamValue(activeSweep.parameter, val)}</td>
                                <td>
                                  {portfolio.length === 0 ? (
                                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>None (infeasible)</span>
                                  ) : (
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                      {portfolio.map(id => (
                                        <span key={id} className="badge badge-purple">{id}</span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="mono" style={{ color: score > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                                  {fmtScore(score)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
