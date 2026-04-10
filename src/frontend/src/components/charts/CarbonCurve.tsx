import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { PipelineResponse, InterventionDetail, ScoredOut } from '../../data/api';

interface Props {
  portfolio: PipelineResponse['portfolio'];
  interventions: PipelineResponse['interventions_detail'];
  horizonYears: number;
  scored: PipelineResponse['scored'];
}

interface YearDataPoint {
  year: number;
  [key: string]: number;
}

const INTERVENTION_COLORS = [
  '#22c55e',
  '#6366f1',
  '#f59e0b',
  '#a78bfa',
  '#f87171',
  '#34d399',
  '#60a5fa',
];

const MONO: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK: any = { fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.5)' };

/**
 * Logistic (S-curve) growth function for revegetation-type interventions.
 * Returns fraction of total emissions achieved by year t.
 */
function logistic(t: number, T: number): number {
  if (T <= 0) return 1;
  const midpoint = T * 0.45;
  const k = 8 / T;
  return 1 / (1 + Math.exp(-k * (t - midpoint)));
}

/**
 * Linear growth for general interventions.
 */
function linear(t: number, T: number): number {
  if (T <= 0) return 1;
  return t / T;
}

/**
 * For solar/infrastructure: rapid ramp then plateau.
 */
function rapidRamp(t: number, T: number): number {
  if (T <= 0) return 1;
  const rampEnd = Math.min(2, T * 0.15);
  if (t <= rampEnd) return (t / rampEnd) * 0.9;
  return 0.9 + (t - rampEnd) / (T - rampEnd) * 0.1;
}

function selectGrowthFn(id: string): (t: number, T: number) => number {
  if (id === 'I1' || id.toLowerCase().includes('reveg') || id.toLowerCase().includes('carbon')) {
    return logistic;
  }
  if (id === 'I2' || id.toLowerCase().includes('solar') || id.toLowerCase().includes('retrofit')) {
    return rapidRamp;
  }
  return linear;
}

function buildCurveData(
  portfolioIds: string[],
  interventions: InterventionDetail[],
  _scored: ScoredOut[],
  horizonYears: number,
): YearDataPoint[] {
  const detailMap = Object.fromEntries(interventions.map(iv => [iv.id, iv]));
  const T = Math.max(1, horizonYears);

  return Array.from({ length: T + 1 }, (_, year) => {
    const point: YearDataPoint = { year };

    let portfolioTotal = 0;
    for (const id of portfolioIds) {
      const iv = detailMap[id];
      if (!iv) continue;

      const growthFn = selectGrowthFn(id);
      const fraction = growthFn(year, T);
      const cumulative = iv.expected_emissions * iv.success_probability * fraction;

      point[id] = Math.max(0, cumulative);
      portfolioTotal += point[id];
    }
    point['_total'] = portfolioTotal;

    return point;
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string; name: string }>;
  label?: number;
  portfolioIds: string[];
  detailMap: Record<string, InterventionDetail>;
}

function CustomTooltip({ active, payload, label, portfolioIds, detailMap }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const totalEntry = payload.find(p => p.dataKey === '_total');
  const ivEntries = payload.filter(p => p.dataKey !== '_total' && portfolioIds.includes(p.dataKey));

  return (
    <div
      style={{
        background: 'rgba(14,16,23,0.97)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 210,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, color: '#fff', marginBottom: 8 }}>
        Year {label}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {totalEntry && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              paddingBottom: 6,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              marginBottom: 2,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Portfolio Total</span>
            <span style={{ ...MONO, fontWeight: 800, color: '#fff', fontSize: 13 }}>
              {totalEntry.value.toFixed(1)} tCO\u2082e
            </span>
          </div>
        )}

        {ivEntries.map(entry => {
          const iv = detailMap[entry.dataKey];
          return (
            <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                  {iv?.name ?? entry.dataKey}
                </span>
              </div>
              <span style={{ ...MONO, fontWeight: 600, color: entry.color }}>
                {entry.value.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CustomLegend({
  portfolioIds,
  detailMap,
  colors,
}: {
  portfolioIds: string[];
  detailMap: Record<string, InterventionDetail>;
  colors: string[];
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 4 }}>
      {portfolioIds.map((id, idx) => {
        const iv = detailMap[id];
        const color = colors[idx % colors.length];
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 8, borderRadius: 2, background: color, opacity: 0.75 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              {id} — {iv?.name ?? id}
            </span>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 20, height: 2, background: '#fff', marginTop: 3 }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Portfolio Total</span>
      </div>
    </div>
  );
}

export function CarbonCurve({ portfolio, interventions, horizonYears, scored }: Props) {
  const portfolioIds = portfolio?.intervention_ids ?? [];
  const ivList: InterventionDetail[] = interventions ?? [];
  const scoredList: ScoredOut[] = scored ?? [];
  const T = Math.max(5, Math.min(50, horizonYears || 20));

  if (portfolioIds.length === 0) {
    return (
      <div
        style={{
          height: 300,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          color: 'rgba(255,255,255,0.3)',
          fontSize: 13,
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 8,
        }}
      >
        <div>No portfolio selected</div>
        <div style={{ fontSize: 11 }}>Run the pipeline to generate cumulative carbon curve</div>
      </div>
    );
  }

  const detailMap = Object.fromEntries(ivList.map(iv => [iv.id, iv]));
  const data = buildCurveData(portfolioIds, ivList, scoredList, T);

  const totalAtT = data[data.length - 1]?.['_total'] ?? 0;
  const yMax = totalAtT * 1.2;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Cumulative Carbon Sequestration
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div
            style={{
              padding: '4px 10px',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 6,
              fontSize: 11,
              color: '#22c55e',
              fontWeight: 600,
              fontFamily: "'Geist Mono', monospace",
            }}
          >
            {totalAtT.toFixed(1)} tCO\u2082e at Year {T}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 30, bottom: 30, left: 60 }}>
          <defs>
            {portfolioIds.map((id, idx) => (
              <linearGradient key={id} id={`curve-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={INTERVENTION_COLORS[idx % INTERVENTION_COLORS.length]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={INTERVENTION_COLORS[idx % INTERVENTION_COLORS.length]} stopOpacity={0.02} />
              </linearGradient>
            ))}
            <linearGradient id="curve-grad-total" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fff" stopOpacity={0.05} />
              <stop offset="95%" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

          <XAxis
            dataKey="year"
            type="number"
            domain={[0, T]}
            ticks={Array.from({ length: Math.min(T + 1, 11) }, (_, i) => Math.round(i * T / 10))}
            tick={AXIS_TICK}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
            label={{
              value: 'Year',
              position: 'insideBottom',
              offset: -15,
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 11,
            }}
          />

          <YAxis
            domain={[0, yMax]}
            tickFormatter={v => `${v.toFixed(0)}`}
            tick={AXIS_TICK}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
            label={{
              value: 'Cumulative tCO\u2082e',
              angle: -90,
              position: 'insideLeft',
              offset: -40,
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 11,
            }}
            width={55}
          />

          <Tooltip
            content={
              <CustomTooltip
                portfolioIds={portfolioIds}
                detailMap={detailMap}
              />
            }
          />

          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />

          {/* Individual intervention areas */}
          {portfolioIds.map((id, idx) => {
            const color = INTERVENTION_COLORS[idx % INTERVENTION_COLORS.length];
            return (
              <Area
                key={id}
                type="monotone"
                dataKey={id}
                name={detailMap[id]?.name ?? id}
                stroke={color}
                strokeWidth={2}
                fill={`url(#curve-grad-${id})`}
                dot={false}
                activeDot={{ r: 4, fill: color }}
                stackId="stack"
              />
            );
          })}

          {/* Portfolio total line — non-stacked, on top */}
          <Area
            type="monotone"
            dataKey="_total"
            name="Portfolio Total"
            stroke="#fff"
            strokeWidth={2.5}
            fill="url(#curve-grad-total)"
            dot={false}
            activeDot={{ r: 5, fill: '#fff', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 2 }}
          />

          <Legend content={() => null} />
        </AreaChart>
      </ResponsiveContainer>

      <CustomLegend
        portfolioIds={portfolioIds}
        detailMap={detailMap}
        colors={INTERVENTION_COLORS}
      />

      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
        Curves are generated from expected emissions and success probability. Growth trajectory:
        logistic (S-curve) for revegetation, rapid-ramp for solar/infrastructure, linear otherwise.
      </div>
    </div>
  );
}
