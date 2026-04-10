import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { PipelineResponse, ScenarioStats, InterventionDetail } from '../../data/api';

interface Props {
  scenarios: PipelineResponse['scenario_distributions'];
  interventions: PipelineResponse['interventions_detail'];
  portfolio: PipelineResponse['portfolio'];
}

interface HistBin {
  binStart: number;
  binEnd: number;
  midpoint: number;
  frequency: number;
  label: string;
}

const NUM_BINS = 20;
const MONO: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK: any = { fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.5)' };

/**
 * Approximate histogram bins from ScenarioStats percentile data.
 * We use the P5/P95 range subdivided into NUM_BINS equal-width buckets,
 * with frequency density derived from a normal approximation.
 */
function buildHistogram(dist: ScenarioStats, field: 'l'): HistBin[] {
  const p5Key = `${field}_p5` as keyof ScenarioStats;
  const p25Key = `${field}_p25` as keyof ScenarioStats;
  const p50Key = `${field}_p50` as keyof ScenarioStats;
  const p75Key = `${field}_p75` as keyof ScenarioStats;
  const p95Key = `${field}_p95` as keyof ScenarioStats;

  const p5 = dist[p5Key] as number;
  const p25 = dist[p25Key] as number;
  const p50 = dist[p50Key] as number;
  const p75 = dist[p75Key] as number;
  const p95 = dist[p95Key] as number;

  const rangeMin = Math.max(0, p5 * 0.5);
  const rangeMax = p95 * 1.2;

  if (rangeMax <= rangeMin) {
    return [];
  }

  const binWidth = (rangeMax - rangeMin) / NUM_BINS;
  const mean = p50;
  // IQR-based std estimate (robust)
  const iqrStd = (p75 - p25) / 1.349;
  const tailStd = (p95 - p5) / 3.29;
  const std = (iqrStd + tailStd) / 2 || 1;

  const bins: HistBin[] = [];
  let totalDensity = 0;

  for (let i = 0; i < NUM_BINS; i++) {
    const binStart = rangeMin + i * binWidth;
    const binEnd = binStart + binWidth;
    const midpoint = (binStart + binEnd) / 2;
    const z = (midpoint - mean) / std;
    const density = Math.exp(-0.5 * z * z);
    totalDensity += density;
    bins.push({
      binStart,
      binEnd,
      midpoint,
      frequency: density,
      label:
        midpoint >= 1000
          ? `${(midpoint / 1000).toFixed(0)}k`
          : midpoint.toFixed(0),
    });
  }

  // Normalise to frequency count (sum = 1000 for display)
  const scale = 1000 / totalDensity;
  return bins.map(b => ({ ...b, frequency: Math.round(b.frequency * scale) }));
}

/** Build an approximate portfolio-level histogram by summing individual loss distributions. */
function buildPortfolioHistogram(
  scenarios: Record<string, ScenarioStats>,
  interventionIds: string[],
): HistBin[] {
  const dists = interventionIds
    .map(id => scenarios[id])
    .filter((d): d is ScenarioStats => d != null);

  if (dists.length === 0) return [];

  // Portfolio CVaR approx: sum of individual P95 losses (conservative)
  const sumP5 = dists.reduce((s, d) => s + d.l_p5, 0);
  const sumP25 = dists.reduce((s, d) => s + d.l_p25, 0);
  const sumP50 = dists.reduce((s, d) => s + d.l_p50, 0);
  const sumP75 = dists.reduce((s, d) => s + d.l_p75, 0);
  const sumP95 = dists.reduce((s, d) => s + d.l_p95, 0);

  const synthetic: ScenarioStats = {
    e_p5: 0, e_p25: 0, e_p50: 0, e_p75: 0, e_p95: 0,
    k_p5: 0, k_p25: 0, k_p50: 0, k_p75: 0, k_p95: 0,
    l_p5: sumP5,
    l_p25: sumP25,
    l_p50: sumP50,
    l_p75: sumP75,
    l_p95: sumP95,
  };

  return buildHistogram(synthetic, 'l');
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: HistBin; value: number }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bin = payload[0].payload;
  return (
    <div
      style={{
        background: 'rgba(14,16,23,0.96)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 170,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
        Loss range
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[
          ['From', `AUD ${bin.binStart.toFixed(0)}`],
          ['To', `AUD ${bin.binEnd.toFixed(0)}`],
          ['Frequency', bin.frequency.toString()],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            <span style={{ ...MONO, fontWeight: 600, color: '#e2e8f0' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  color: string;
}

function TabButton({ active, onClick, label, color }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        background: active ? `${color}22` : 'transparent',
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 6,
        color: active ? color : 'rgba(255,255,255,0.5)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: "'Geist Mono', 'SF Mono', monospace",
      }}
    >
      {label}
    </button>
  );
}

const TAB_COLORS = ['#22c55e', '#6366f1', '#f59e0b', '#a78bfa', '#f87171'];

export function MonteCarloDistribution({ scenarios, interventions, portfolio }: Props) {
  const [selectedTab, setSelectedTab] = useState<string>('portfolio');

  const interventionList: InterventionDetail[] = interventions ?? [];
  const portfolioIds = portfolio?.intervention_ids ?? [];
  const scenarioMap: Record<string, ScenarioStats> = scenarios ?? {};

  // Tabs: one per intervention that has data + portfolio tab
  const ivTabs = interventionList.filter(iv => scenarioMap[iv.id] != null);

  if (Object.keys(scenarioMap).length === 0) {
    return (
      <div
        style={{
          height: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: 13,
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 8,
        }}
      >
        No Monte Carlo distribution data available — run pipeline to populate
      </div>
    );
  }

  const isPortfolioTab = selectedTab === 'portfolio';
  const selectedIv = ivTabs.find(iv => iv.id === selectedTab);

  let bins: HistBin[] = [];
  let cvar95 = 0;
  let mean = 0;
  let tabColor = '#6366f1';

  if (isPortfolioTab) {
    bins = buildPortfolioHistogram(scenarioMap, portfolioIds);
    // Portfolio CVaR: sum of individual l_p95
    cvar95 = portfolioIds.reduce((s, id) => s + (scenarioMap[id]?.l_p95 ?? 0), 0);
    mean = portfolioIds.reduce((s, id) => s + (scenarioMap[id]?.l_p50 ?? 0), 0);
    tabColor = '#e2e8f0';
  } else if (selectedIv) {
    const dist = scenarioMap[selectedIv.id];
    bins = buildHistogram(dist, 'l');
    cvar95 = dist.l_p95;
    mean = dist.l_p50;
    const ivIdx = ivTabs.findIndex(iv => iv.id === selectedIv.id);
    tabColor = TAB_COLORS[ivIdx % TAB_COLORS.length];
  }

  const maxFrequency = Math.max(...bins.map(b => b.frequency), 1);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Monte Carlo Loss Distribution
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          Histogram of simulated loss outcomes (approximated from percentiles)
        </div>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <TabButton
          active={isPortfolioTab}
          onClick={() => setSelectedTab('portfolio')}
          label="Portfolio"
          color="#e2e8f0"
        />
        {ivTabs.map((iv, idx) => (
          <TabButton
            key={iv.id}
            active={selectedTab === iv.id}
            onClick={() => setSelectedTab(iv.id)}
            label={iv.id}
            color={TAB_COLORS[idx % TAB_COLORS.length]}
          />
        ))}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        {[
          { label: 'Mean (P50)', value: `AUD ${Math.round(mean).toLocaleString()}`, color: '#22c55e' },
          { label: 'CVaR 95%', value: `AUD ${Math.round(cvar95).toLocaleString()}`, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              padding: '6px 12px',
              background: `${color}11`,
              border: `1px solid ${color}33`,
              borderRadius: 6,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <div style={{ width: 3, height: 20, background: color, borderRadius: 2 }} />
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 1 }}>
                {label}
              </div>
              <div style={{ ...MONO, fontWeight: 700, color, fontSize: 13 }}>{value}</div>
            </div>
          </div>
        ))}
        {selectedIv && (
          <div
            style={{
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 1 }}>
              Intervention
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
              {selectedIv.name}
            </div>
          </div>
        )}
        {isPortfolioTab && (
          <div
            style={{
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 1 }}>
              Portfolio
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
              {portfolioIds.join(' + ') || 'None selected'}
            </div>
          </div>
        )}
      </div>

      {bins.length === 0 ? (
        <div
          style={{
            height: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.3)',
            fontSize: 12,
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 6,
          }}
        >
          No data for this selection
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={bins} margin={{ top: 10, right: 20, bottom: 30, left: 60 }}>
            <CartesianGrid
              vertical={false}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              stroke="rgba(255,255,255,0.15)"
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
              label={{
                value: 'Loss (AUD)',
                position: 'insideBottom',
                offset: -15,
                fill: 'rgba(255,255,255,0.4)',
                fontSize: 11,
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, maxFrequency * 1.1]}
              tick={AXIS_TICK}
              stroke="rgba(255,255,255,0.15)"
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
              label={{
                value: 'Frequency',
                angle: -90,
                position: 'insideLeft',
                offset: -40,
                fill: 'rgba(255,255,255,0.4)',
                fontSize: 11,
              }}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />

            {/* Mean reference line */}
            <ReferenceLine
              x={
                bins.reduce((best, b) =>
                  Math.abs(b.midpoint - mean) < Math.abs(best.midpoint - mean) ? b : best
                ).label
              }
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="5 3"
              label={{ value: 'Mean', position: 'top', fill: '#22c55e', fontSize: 10 }}
            />

            {/* CVaR 95% reference line */}
            <ReferenceLine
              x={
                bins.reduce((best, b) =>
                  Math.abs(b.midpoint - cvar95) < Math.abs(best.midpoint - cvar95) ? b : best
                ).label
              }
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5 3"
              label={{ value: 'CVaR 95%', position: 'top', fill: '#ef4444', fontSize: 10 }}
            />

            <Bar dataKey="frequency" radius={[2, 2, 0, 0]} maxBarSize={20}>
              {bins.map((bin, idx) => {
                const isTail = bin.midpoint >= cvar95;
                return (
                  <Cell
                    key={idx}
                    fill={isTail ? '#ef444466' : `${tabColor}99`}
                    stroke={isTail ? '#ef4444' : tabColor}
                    strokeWidth={isTail ? 1 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
          lineHeight: 1.6,
        }}
      >
        Histogram approximated from P5/P25/P50/P75/P95 percentile data using a normal kernel.
        Tail region (beyond CVaR 95%) highlighted in red.
      </div>
    </div>
  );
}
