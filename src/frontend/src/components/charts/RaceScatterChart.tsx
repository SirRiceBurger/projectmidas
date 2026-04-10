import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { ScatterShapeProps } from 'recharts';
import type { PipelineResponse, ScoredOut, InterventionDetail } from '../../data/api';

interface Props {
  scored: PipelineResponse['scored'];
  interventions: PipelineResponse['interventions_detail'];
  portfolio: PipelineResponse['portfolio'];
  onSelectIntervention?: (id: string) => void;
}

type PointStatus = 'portfolio' | 'feasible' | 'excluded';

interface ScatterPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  status: PointStatus;
  race: number;
  mercury_score: number;
  cost: number;
  resilience: number;
  inPortfolio: boolean;
}

const STATUS_COLORS: Record<PointStatus, string> = {
  portfolio: '#6366f1',
  feasible: '#22c55e',
  excluded: '#ef4444',
};

const STATUS_LABELS: Record<PointStatus, string> = {
  portfolio: 'In portfolio',
  feasible: 'Feasible',
  excluded: 'Excluded',
};

const monoStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK: any = { fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.5)' };

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ScatterPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  const color = STATUS_COLORS[pt.status];

  return (
    <div
      style={{
        background: 'rgba(14,16,23,0.96)',
        border: `1px solid ${color}44`,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 200,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{pt.name}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            color,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {STATUS_LABELS[pt.status]}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[
          ['ID', pt.id],
          ['RACE Score', pt.race.toExponential(3)],
          ['Mercury Score', pt.mercury_score.toFixed(4)],
          ['Expected Cost', `AUD ${pt.cost.toLocaleString()}`],
          ['Resilience', pt.resilience.toFixed(3)],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            <span style={{ ...monoStyle, fontWeight: 600, color: '#e2e8f0' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LegendItemProps {
  status: PointStatus;
}

function LegendItem({ status }: LegendItemProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: STATUS_COLORS[status],
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  );
}

function buildPoints(
  scored: ScoredOut[],
  interventions: InterventionDetail[],
  portfolioIds: string[],
): ScatterPoint[] {
  const detailMap = Object.fromEntries(interventions.map(iv => [iv.id, iv]));
  const portfolioSet = new Set(portfolioIds);

  const allIds = Array.from(
    new Set([...scored.map(s => s.intervention_id), ...interventions.map(iv => iv.id)])
  );

  return allIds.map(id => {
    const sc = scored.find(s => s.intervention_id === id);
    const iv = detailMap[id];
    const inPortfolio = portfolioSet.has(id);

    let status: PointStatus = 'excluded';
    if (inPortfolio) status = 'portfolio';
    else if (sc != null) status = 'feasible';

    const resilience = iv?.resilience_score ?? 0.5;
    // dot radius: 6–14 proportional to resilience 0–1
    const r = 6 + resilience * 8;

    return {
      id,
      name: iv?.name ?? id,
      x: iv?.expected_cost ?? 0,
      y: sc?.race ?? 0,
      r,
      status,
      race: sc?.race ?? 0,
      mercury_score: sc?.mercury_score ?? 0,
      cost: iv?.expected_cost ?? 0,
      resilience,
      inPortfolio,
    };
  });
}

const formatXAxis = (v: number) => {
  if (v === 0) return '0';
  return `${(v / 1000).toFixed(0)}k`;
};

const formatYAxis = (v: number) => {
  if (v === 0) return '0';
  return v.toExponential(1);
};

export function RaceScatterChart({ scored, interventions, portfolio, onSelectIntervention }: Props) {
  const portfolioIds = portfolio?.intervention_ids ?? [];
  const points = buildPoints(scored ?? [], interventions ?? [], portfolioIds);

  const hasData = points.length > 0 && points.some(p => p.y > 0);

  if (!hasData) {
    return (
      <div
        style={{
          height: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: 13,
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 8,
        }}
      >
        No RACE score data available — run pipeline to populate chart
      </div>
    );
  }

  const xMax = Math.max(...points.map(p => p.x)) * 1.15;
  const yMax = Math.max(...points.map(p => p.y)) * 1.2;

  const statusGroups: PointStatus[] = ['excluded', 'feasible', 'portfolio'];

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
          RACE Score vs Cost
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {statusGroups.map(s => (
            <LegendItem key={s} status={s} />
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width={14} height={14} viewBox="0 0 14 14">
              <circle cx={7} cy={7} r={3} fill="rgba(255,255,255,0.25)" />
              <circle cx={7} cy={7} r={6} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            </svg>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              Size = resilience
            </span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 60 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

          <XAxis
            type="number"
            dataKey="x"
            name="Cost"
            domain={[0, xMax]}
            tickFormatter={formatXAxis}
            label={{
              value: 'Expected Cost (AUD)',
              position: 'insideBottom',
              offset: -15,
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 11,
            }}
            tick={AXIS_TICK}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
          />

          <YAxis
            type="number"
            dataKey="y"
            name="RACE"
            domain={[0, yMax]}
            tickFormatter={formatYAxis}
            label={{
              value: 'RACE Score',
              angle: -90,
              position: 'insideLeft',
              offset: -40,
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 11,
            }}
            tick={AXIS_TICK}
            stroke="rgba(255,255,255,0.15)"
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
            width={60}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />

          {/* CVaR reference lines at common budget thresholds */}
          <ReferenceLine
            x={350000}
            stroke="rgba(245,158,11,0.3)"
            strokeDasharray="4 3"
            label={{ value: 'B=350k', position: 'top', fill: 'rgba(245,158,11,0.5)', fontSize: 10 }}
          />

          {statusGroups.map(status => {
            const groupPoints = points.filter(p => p.status === status);
            if (groupPoints.length === 0) return null;
            return (
              <Scatter
                key={status}
                name={STATUS_LABELS[status]}
                data={groupPoints}
                shape={(props: ScatterShapeProps) => {
                  const { cx, cy, payload } = props as unknown as { cx: number; cy: number; payload: ScatterPoint };
                  const color = STATUS_COLORS[payload.status];
                  const radius = payload.r;
                  return (
                    <g
                      style={{ cursor: onSelectIntervention ? 'pointer' : 'default' }}
                      onClick={() => onSelectIntervention?.(payload.id)}
                    >
                      {payload.inPortfolio && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={radius + 6}
                          fill={`${color}14`}
                          stroke={`${color}44`}
                          strokeWidth={1}
                        />
                      )}
                      <circle cx={cx} cy={cy} r={radius} fill={color} opacity={0.85} />
                      <text
                        x={cx}
                        y={cy - radius - 5}
                        textAnchor="middle"
                        fill={color}
                        fontSize={10}
                        fontWeight={600}
                        fontFamily="'Geist Mono', 'SF Mono', monospace"
                      >
                        {payload.id}
                      </text>
                    </g>
                  );
                }}
              >
                {groupPoints.map(pt => (
                  <Cell key={pt.id} fill={STATUS_COLORS[pt.status]} />
                ))}
              </Scatter>
            );
          })}

          <Legend
            verticalAlign="bottom"
            height={0}
            content={() => null}
          />
        </ScatterChart>
      </ResponsiveContainer>

      <div
        style={{
          marginTop: 8,
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
          fontSize: 11,
          color: 'rgba(255,255,255,0.35)',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {points.map(pt => (
          <span key={pt.id}>
            <span style={{ color: STATUS_COLORS[pt.status], fontWeight: 600 }}>{pt.id}</span>
            {' '}
            {pt.name.length > 20 ? pt.name.slice(0, 20) + '…' : pt.name}
            {' — '}
            RACE: {pt.race.toExponential(2)}
          </span>
        ))}
      </div>
    </div>
  );
}
