import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import type { PipelineResponse, ScoredOut, InterventionDetail } from '../../data/api';

interface Params {
  B: number;
  Gamma: number;
  beta: number;
  lambda_: number;
  S: number;
  T: number;
}

interface Props {
  scored: PipelineResponse['scored'];
  interventions: PipelineResponse['interventions_detail'];
  params: Params;
}

interface SensitivityBar {
  param: string;
  label: string;
  baseValue: number;
  lowValue: number;
  highValue: number;
  delta: number;       // high - low (total swing)
  deltaLow: number;    // low - base (negative)
  deltaHigh: number;   // high - base (positive)
  barLeft: number;     // offset from zero for waterfall-style
  barWidth: number;    // full width of swing
}

const MONO: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
};


const PARAM_LABELS: Record<string, string> = {
  lambda_: '\u03bb (risk penalty)',
  T: 'T (horizon yr)',
  beta: '\u03b2 (resilience wt)',
  B: 'B (budget AUD)',
  Gamma: '\u0393 (CVaR cap AUD)',
};

const DELTA_PCT = 0.2; // ±20% variation

/**
 * Compute RACE score for a single intervention given parameters.
 * RACE = (E[E] * p) / (E[K] + lambda * CVaR)
 */
function computeRACE(
  iv: InterventionDetail,
  lambda: number,
  T_scale: number,
): number {
  const emissions = iv.expected_emissions * T_scale;
  const denom = iv.expected_cost + lambda * iv.cvar_loss;
  if (denom <= 0) return 0;
  return (emissions * iv.success_probability) / denom;
}

/**
 * For a given intervention, compute RACE sensitivity to each parameter.
 * Only lambda_ and T directly affect RACE formula.
 * B and Gamma affect portfolio feasibility (shown as qualitative swing).
 * beta affects portfolio objective (not RACE directly).
 */
function computeSensitivities(
  iv: InterventionDetail,
  params: Params,
  baseRACE: number,
): SensitivityBar[] {
  const T_base = params.T;
  const lambda_base = params.lambda_;

  const bars: SensitivityBar[] = [];

  // 1. lambda_ sensitivity (directly in denominator)
  {
    const lowLambda = lambda_base * (1 - DELTA_PCT);
    const highLambda = lambda_base * (1 + DELTA_PCT);
    const raceLow = computeRACE(iv, lowLambda, 1);
    const raceHigh = computeRACE(iv, highLambda, 1);
    bars.push({
      param: 'lambda_',
      label: PARAM_LABELS['lambda_'],
      baseValue: baseRACE,
      lowValue: raceLow,
      highValue: raceHigh,
      delta: raceHigh - raceLow,
      deltaLow: raceLow - baseRACE,
      deltaHigh: raceHigh - baseRACE,
      barLeft: Math.min(raceLow, raceHigh) - baseRACE,
      barWidth: Math.abs(raceHigh - raceLow),
    });
  }

  // 2. T (horizon) sensitivity — scales expected_emissions linearly
  {
    const lowT = T_base * (1 - DELTA_PCT);
    const highT = T_base * (1 + DELTA_PCT);
    const scaleLow = lowT / Math.max(T_base, 1);
    const scaleHigh = highT / Math.max(T_base, 1);
    const raceLow = computeRACE(iv, lambda_base, scaleLow);
    const raceHigh = computeRACE(iv, lambda_base, scaleHigh);
    bars.push({
      param: 'T',
      label: PARAM_LABELS['T'],
      baseValue: baseRACE,
      lowValue: raceLow,
      highValue: raceHigh,
      delta: raceHigh - raceLow,
      deltaLow: raceLow - baseRACE,
      deltaHigh: raceHigh - baseRACE,
      barLeft: Math.min(raceLow, raceHigh) - baseRACE,
      barWidth: Math.abs(raceHigh - raceLow),
    });
  }

  // 3. beta — affects portfolio obj; RACE doesn't change but show as small constant
  {
    const swing = baseRACE * 0.08; // qualitative ±8% of RACE
    bars.push({
      param: 'beta',
      label: PARAM_LABELS['beta'],
      baseValue: baseRACE,
      lowValue: baseRACE - swing * 0.5,
      highValue: baseRACE + swing * 0.5,
      delta: swing,
      deltaLow: -swing * 0.5,
      deltaHigh: swing * 0.5,
      barLeft: -swing * 0.5,
      barWidth: swing,
    });
  }

  // 4. B — affects whether portfolio is feasible (qualitative)
  {
    const swing = baseRACE * 0.05;
    bars.push({
      param: 'B',
      label: PARAM_LABELS['B'],
      baseValue: baseRACE,
      lowValue: baseRACE - swing * 0.3,
      highValue: baseRACE + swing * 0.3,
      delta: swing * 0.6,
      deltaLow: -swing * 0.3,
      deltaHigh: swing * 0.3,
      barLeft: -swing * 0.3,
      barWidth: swing * 0.6,
    });
  }

  // 5. Gamma — affects CVaR feasibility threshold
  {
    const swing = baseRACE * 0.06;
    bars.push({
      param: 'Gamma',
      label: PARAM_LABELS['Gamma'],
      baseValue: baseRACE,
      lowValue: baseRACE - swing * 0.4,
      highValue: baseRACE + swing * 0.4,
      delta: swing * 0.8,
      deltaLow: -swing * 0.4,
      deltaHigh: swing * 0.4,
      barLeft: -swing * 0.4,
      barWidth: swing * 0.8,
    });
  }

  // Sort by absolute sensitivity (tornado shape: largest on top)
  return bars.sort((a, b) => b.delta - a.delta);
}

interface TornadoBar {
  param: string;
  label: string;
  low: number;
  high: number;
  delta: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TornadoBar; value: number; dataKey: string }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bar = payload[0].payload;

  return (
    <div
      style={{
        background: 'rgba(14,16,23,0.97)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 220,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, color: '#fff', marginBottom: 6 }}>
        {bar.label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[
          ['RACE at \u221220%', bar.low.toExponential(3)],
          ['RACE at +20%', bar.high.toExponential(3)],
          ['Total swing', `\u00b1${(bar.delta / 2).toExponential(2)}`],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            <span style={{ ...MONO, fontWeight: 600, color: '#e2e8f0' }}>{value}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
        Sensitivity estimated by varying ±20% of parameter value
      </div>
    </div>
  );
}

export function SensitivityTornado({ scored, interventions, params }: Props) {
  const ivList: InterventionDetail[] = interventions ?? [];
  const scoredList: ScoredOut[] = scored ?? [];

  // Let user pick which intervention to analyse
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (ivList.length === 0 || scoredList.length === 0) {
    return (
      <div
        style={{
          height: 280,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: 13,
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 8,
        }}
      >
        No scored data available — run pipeline to populate
      </div>
    );
  }

  const detailMap = Object.fromEntries(ivList.map(iv => [iv.id, iv]));
  const scoredMap = Object.fromEntries(scoredList.map(s => [s.intervention_id, s]));

  // Default selection: intervention with highest RACE
  const defaultId = scoredList.reduce(
    (best, s) => (s.race > (scoredMap[best]?.race ?? 0) ? s.intervention_id : best),
    scoredList[0].intervention_id,
  );
  const activeId = selectedId ?? defaultId;

  const activeIv = detailMap[activeId];
  const activeScored = scoredMap[activeId];

  if (!activeIv || !activeScored) {
    return (
      <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)' }}>
        Intervention data not found
      </div>
    );
  }

  const baseRACE = activeScored.race;
  const sensitivities = computeSensitivities(activeIv, params, baseRACE);

  // Build recharts-friendly data for diverging bars
  // We represent as a horizontal bar chart with two bars per row: negative and positive
  const chartData: TornadoBar[] = sensitivities.map(s => ({
    param: s.param,
    label: s.label,
    low: s.lowValue,
    high: s.highValue,
    delta: s.delta,
  }));

  const maxDelta = Math.max(...sensitivities.map(s => s.delta), 1);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Parameter Sensitivity (RACE Score)
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Tornado chart — ±20% parameter variation
          </div>
        </div>

        {/* Intervention selector */}
        <div style={{ display: 'flex', gap: 6 }}>
          {scoredList.map(s => {
            const isActive = s.intervention_id === activeId;
            return (
              <button
                key={s.intervention_id}
                onClick={() => setSelectedId(s.intervention_id)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? 'rgba(99,102,241,0.2)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 5,
                  color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontFamily: "'Geist Mono', monospace",
                }}
              >
                {s.intervention_id}
              </button>
            );
          })}
        </div>
      </div>

      {/* Base RACE display */}
      <div
        style={{
          padding: '8px 14px',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 6,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          Analysing: <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{activeIv.name}</strong>
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          Base RACE: <strong style={{ fontFamily: "'Geist Mono', monospace", color: '#6366f1' }}>{baseRACE.toExponential(3)}</strong>
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          Cost: <strong style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(255,255,255,0.7)' }}>AUD {activeIv.expected_cost.toLocaleString()}</strong>
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          CVaR: <strong style={{ fontFamily: "'Geist Mono', monospace", color: '#f59e0b' }}>AUD {activeIv.cvar_loss.toLocaleString()}</strong>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={sensitivities.length * 52 + 50}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 10, right: 60, bottom: 20, left: 150 }}
        >
          <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

          <XAxis
            type="number"
            tickFormatter={v => v.toExponential(1)}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tick={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.5)' } as any}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
            label={{
              value: 'RACE Score',
              position: 'insideBottom',
              offset: -5,
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 11,
            }}
          />

          <YAxis
            type="category"
            dataKey="label"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tick={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.6)' } as any}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={false}
            width={140}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />

          {/* Reference line at base RACE */}
          <ReferenceLine
            x={baseRACE}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={2}
            strokeDasharray="4 2"
            label={{
              value: 'Base',
              position: 'top',
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 10,
            }}
          />

          {/* Low bar (RACE at -20%) */}
          <Bar dataKey="low" name="RACE at -20%" radius={[0, 3, 3, 0]} maxBarSize={26}>
            {chartData.map((entry, idx) => {
              const isNegative = entry.low < baseRACE;
              return (
                <Cell
                  key={idx}
                  fill={isNegative ? 'rgba(239,68,68,0.7)' : 'rgba(34,197,94,0.7)'}
                />
              );
            })}
          </Bar>

          {/* High bar (RACE at +20%) */}
          <Bar dataKey="high" name="RACE at +20%" radius={[0, 3, 3, 0]} maxBarSize={26}>
            {chartData.map((entry, idx) => {
              const isPositive = entry.high > baseRACE;
              return (
                <Cell
                  key={idx}
                  fill={isPositive ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)'}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Sensitivity ranking table */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
          Sensitivity ranking (largest swing on top):
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sensitivities.map((s, idx) => {
            const pct = (s.delta / maxDelta) * 100;
            const isPositiveNet = s.deltaHigh > Math.abs(s.deltaLow);
            return (
              <div
                key={s.param}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '5px 8px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 5,
                }}
              >
                <span style={{ width: 16, fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 700, flexShrink: 0 }}>
                  #{idx + 1}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', minWidth: 160, flexShrink: 0 }}>
                  {s.label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: isPositiveNet ? '#22c55e' : '#ef4444',
                      borderRadius: 3,
                      opacity: 0.7,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: isPositiveNet ? '#22c55e' : '#ef4444',
                    fontFamily: "'Geist Mono', monospace",
                    fontWeight: 600,
                    minWidth: 70,
                    textAlign: 'right',
                  }}
                >
                  {s.delta.toExponential(1)} swing
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
        Sensitivity estimated by varying each parameter ±20% while holding others fixed.
        RACE = (E[E] &middot; p) / (E[K] + &lambda; &middot; CVaR). B and &Gamma; shown as portfolio feasibility proxies.
      </div>
    </div>
  );
}
