import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { PipelineResponse, ScoredOut, InterventionDetail } from '../../data/api';

interface Props {
  scored: PipelineResponse['scored'];
  interventions: PipelineResponse['interventions_detail'];
}

interface BarEntry {
  id: string;
  name: string;
  shortName: string;
  mercury_score: number;
  race: number;
  avg_correlation: number;
}

const monoStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK: any = { fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.5)' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK_LABEL: any = { fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.65)' };

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function buildEntries(
  scored: ScoredOut[],
  interventions: InterventionDetail[],
): BarEntry[] {
  const detailMap = Object.fromEntries(interventions.map(iv => [iv.id, iv]));

  return [...scored]
    .sort((a, b) => b.mercury_score - a.mercury_score)
    .map(s => {
      const iv = detailMap[s.intervention_id];
      const name = iv?.name ?? s.intervention_id;
      return {
        id: s.intervention_id,
        name,
        shortName: truncate(name, 20),
        mercury_score: s.mercury_score,
        race: s.race,
        avg_correlation: s.avg_correlation,
      };
    });
}

// Derive a colour for each bar based on rank
function barColor(idx: number, total: number): string {
  if (total <= 1) return '#6366f1';
  const t = 1 - idx / (total - 1);
  // top rank → green, bottom → amber/red
  if (t > 0.6) return '#22c55e';
  if (t > 0.3) return '#6366f1';
  return '#f59e0b';
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: BarEntry; value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0].payload;

  return (
    <div
      style={{
        background: 'rgba(14,16,23,0.96)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 220,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 8 }}>
        {entry.name}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[
          ['ID', entry.id],
          ['Mercury Score', entry.mercury_score.toFixed(4)],
          ['RACE Score', entry.race.toExponential(3)],
          ['Avg Correlation \u03c1', entry.avg_correlation.toFixed(3)],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            <span style={{ ...monoStyle, fontWeight: 600, color: '#e2e8f0' }}>{value}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.35)',
          lineHeight: 1.6,
        }}
      >
        MercuryScore = &theta;&#8321;z(RACE) + &theta;&#8322;z(E[R]) + &theta;&#8323;z(p) &minus; &theta;&#8324;z(CVaR) &minus; &theta;&#8325;z(&rho;)
      </div>
    </div>
  );
}

interface CustomLabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
}

function CustomLabel({ x = 0, y = 0, width = 0, value = 0 }: CustomLabelProps) {
  if (width < 30) return null;
  return (
    <text
      x={x + width + 4}
      y={y + 10}
      fill="rgba(255,255,255,0.55)"
      fontSize={10}
      fontFamily="'Geist Mono', 'SF Mono', monospace"
      dominantBaseline="middle"
    >
      {value.toFixed(3)}
    </text>
  );
}

export function MercuryScoreBar({ scored, interventions }: Props) {
  const entries = buildEntries(scored ?? [], interventions ?? []);

  if (entries.length === 0) {
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
        No Mercury score data available — run pipeline to populate chart
      </div>
    );
  }

  const maxScore = Math.max(...entries.map(e => e.mercury_score));
  const xDomain: [number, number] = [0, maxScore * 1.25];

  // Dynamic height based on number of interventions
  const chartHeight = Math.max(200, entries.length * 64 + 60);

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
          Mercury Score Ranking
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { color: '#22c55e', label: '#1 rank' },
            { color: '#6366f1', label: 'Mid rank' },
            { color: '#f59e0b', label: 'Lower rank' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={entries}
          margin={{ top: 10, right: 80, bottom: 10, left: 140 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 3"
          />

          <XAxis
            type="number"
            domain={xDomain}
            tick={AXIS_TICK}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
            tickFormatter={v => v.toFixed(3)}
            label={{
              value: 'MercuryScore',
              position: 'insideBottom',
              offset: -5,
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 11,
            }}
          />

          <YAxis
            type="category"
            dataKey="shortName"
            tick={AXIS_TICK_LABEL}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={false}
            width={130}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />

          <ReferenceLine
            x={0}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
          />

          <Bar
            dataKey="mercury_score"
            radius={[0, 4, 4, 0]}
            label={<CustomLabel />}
            maxBarSize={36}
          >
            {entries.map((entry, idx) => (
              <Cell
                key={entry.id}
                fill={barColor(idx, entries.length)}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Rank index table below chart */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 8,
        }}
      >
        {entries.map((entry, idx) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: barColor(idx, entries.length),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {idx + 1}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.6)',
                fontFamily: "'Geist Mono', 'SF Mono', monospace",
              }}
            >
              {entry.id}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              {entry.mercury_score.toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
