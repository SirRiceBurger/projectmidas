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
} from 'recharts';
import type { PipelineResponse, PortfolioComparison, PortfolioOut } from '../../data/api';
import type { ScatterShapeProps } from 'recharts';

interface Props {
  allPortfolios: PipelineResponse['all_portfolios'];
  selectedPortfolio: PipelineResponse['portfolio'];
}

interface PlotPoint {
  x: number;
  y: number;
  label: string;
  feasible: boolean;
  isSelected: boolean;
  cost: number;
  cvar: number;
  emissions: number;
  rejectionReason: string | null;
  score: number;
}

const MONO: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', monospace",
  fontSize: 11,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AXIS_TICK: any = { fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 11, fill: 'rgba(255,255,255,0.5)' };

function normalise(val: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (val - min) / (max - min);
}

function lerpColor(t: number): string {
  // t=0 → grey, t=1 → green
  const r = Math.round(80 + (34 - 80) * t);
  const g = Math.round(90 + (197 - 90) * t);
  const b = Math.round(100 + (94 - 100) * t);
  return `rgb(${r},${g},${b})`;
}

function buildPoints(
  allPortfolios: PortfolioComparison[],
  selectedPortfolio: PortfolioOut | undefined,
): PlotPoint[] {
  const selectedKey = (selectedPortfolio?.intervention_ids ?? []).slice().sort().join('+');
  const feasible = allPortfolios.filter(p => p.feasible);
  const emissions = feasible.map(p => p.expected_emissions);
  const minE = Math.min(...emissions, 0);
  const maxE = Math.max(...emissions, 1);

  return allPortfolios.map(p => {
    const key = p.intervention_ids.slice().sort().join('+');
    const isSelected = key === selectedKey;
    const score = normalise(p.expected_emissions, minE, maxE);
    return {
      x: p.portfolio_cvar,
      y: p.expected_emissions,
      label: p.intervention_ids.join('+'),
      feasible: p.feasible,
      isSelected,
      cost: p.total_cost,
      cvar: p.portfolio_cvar,
      emissions: p.expected_emissions,
      rejectionReason: p.rejection_reason,
      score,
    };
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PlotPoint }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  const color = pt.isSelected ? '#f4d03f' : pt.feasible ? '#22c55e' : '#6b7280';

  return (
    <div
      style={{
        background: 'rgba(14,16,23,0.97)',
        border: `1px solid ${color}44`,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 210,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
          {pt.label.replace(/\+/g, ' + ')}
        </span>
        {pt.isSelected && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: '#f4d03f',
              fontWeight: 600,
              border: '1px solid #f4d03f44',
              padding: '1px 5px',
              borderRadius: 3,
            }}
          >
            Selected
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[
          ['Interventions', pt.label.replace(/\+/g, ', ')],
          ['Total Cost', `AUD ${pt.cost.toLocaleString()}`],
          ['Portfolio CVaR', `AUD ${pt.cvar.toLocaleString()}`],
          ['Expected Emissions', `${pt.emissions.toFixed(1)} tCO\u2082e`],
          ['Feasible', pt.feasible ? 'Yes' : 'No'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            <span
              style={{
                ...MONO,
                fontWeight: 600,
                color: label === 'Feasible'
                  ? (pt.feasible ? '#22c55e' : '#ef4444')
                  : '#e2e8f0',
              }}
            >
              {value}
            </span>
          </div>
        ))}
        {!pt.feasible && pt.rejectionReason && (
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: '#ef4444',
              padding: '3px 6px',
              background: 'rgba(239,68,68,0.08)',
              borderRadius: 4,
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {pt.rejectionReason}
          </div>
        )}
      </div>
    </div>
  );
}

export function PortfolioFrontier({ allPortfolios, selectedPortfolio }: Props) {
  const portfolios = allPortfolios ?? [];

  if (portfolios.length === 0) {
    return (
      <div
        style={{
          height: 320,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: 13,
          gap: 8,
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 8,
        }}
      >
        <div>No portfolio enumeration data available</div>
        <div style={{ fontSize: 11 }}>Run pipeline with at least 2 interventions to populate</div>
      </div>
    );
  }

  const points = buildPoints(portfolios, selectedPortfolio);
  const feasiblePoints = points.filter(p => p.feasible && !p.isSelected);
  const infeasiblePoints = points.filter(p => !p.feasible);
  const selectedPoints = points.filter(p => p.isSelected);

  const allX = points.map(p => p.x);
  const allY = points.map(p => p.y);
  const xMax = Math.max(...allX) * 1.15;
  const yMax = Math.max(...allY) * 1.15;
  const yMin = Math.max(0, Math.min(...allY) * 0.85);

  // Gamma from selected portfolio or estimate
  const gammaX = selectedPortfolio
    ? undefined // We'll derive it from context — show note if unknown
    : undefined;

  const gammaValue = gammaX;

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
          Portfolio Efficient Frontier
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { color: '#f4d03f', label: 'Selected' },
            { color: '#22c55e', label: 'Feasible' },
            { color: '#6b7280', label: 'Infeasible' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 20, right: 40, bottom: 40, left: 60 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

          <XAxis
            type="number"
            dataKey="x"
            name="CVaR"
            domain={[0, xMax]}
            tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
            label={{
              value: 'Portfolio CVaR (AUD)',
              position: 'insideBottom',
              offset: -20,
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
            name="Emissions"
            domain={[yMin, yMax]}
            tickFormatter={v => `${v.toFixed(0)}`}
            label={{
              value: 'Expected Emissions Saved (tCO\u2082e)',
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
            width={55}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />

          {/* Gamma cap line if known */}
          {gammaValue != null && (
            <ReferenceLine
              x={gammaValue}
              stroke="rgba(245,158,11,0.5)"
              strokeWidth={2}
              strokeDasharray="5 3"
              label={{
                value: `\u0393 = ${(gammaValue / 1000).toFixed(0)}k`,
                position: 'top',
                fill: 'rgba(245,158,11,0.8)',
                fontSize: 10,
              }}
            />
          )}

          {/* Infeasible portfolios */}
          <Scatter name="Infeasible" data={infeasiblePoints} shape={(props: ScatterShapeProps) => {
            const { cx, cy } = props as unknown as { cx: number; cy: number };
            return (
              <circle cx={cx} cy={cy} r={5} fill="#6b7280" fillOpacity={0.4} stroke="#6b7280" strokeWidth={0.5} />
            );
          }}>
            {infeasiblePoints.map(pt => (
              <Cell key={pt.label} fill="#6b7280" />
            ))}
          </Scatter>

          {/* Feasible portfolios — coloured by score */}
          <Scatter name="Feasible" data={feasiblePoints} shape={(props: ScatterShapeProps) => {
            const { cx, cy, payload } = props as unknown as { cx: number; cy: number; payload: PlotPoint };
            const color = lerpColor(payload.score);
            return (
              <g>
                <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.8} />
                <text
                  x={cx}
                  y={cy - 11}
                  textAnchor="middle"
                  fill={color}
                  fontSize={9}
                  fontFamily="'Geist Mono', monospace"
                  fontWeight={600}
                >
                  {payload.label.replace(/\+/g, '+')}
                </text>
              </g>
            );
          }}>
            {feasiblePoints.map(pt => (
              <Cell key={pt.label} fill={lerpColor(pt.score)} />
            ))}
          </Scatter>

          {/* Selected portfolio — prominent gold dot */}
          <Scatter name="Selected" data={selectedPoints} shape={(props: ScatterShapeProps) => {
            const { cx, cy, payload } = props as unknown as { cx: number; cy: number; payload: PlotPoint };
            return (
              <g>
                <circle cx={cx} cy={cy} r={18} fill="rgba(244,208,63,0.08)" stroke="rgba(244,208,63,0.3)" strokeWidth={1} />
                <circle cx={cx} cy={cy} r={10} fill="#f4d03f" fillOpacity={0.9} />
                <text
                  x={cx}
                  y={cy - 16}
                  textAnchor="middle"
                  fill="#f4d03f"
                  fontSize={10}
                  fontFamily="'Geist Mono', monospace"
                  fontWeight={700}
                >
                  {payload.label.replace(/\+/g, '+')}
                </text>
                <text
                  x={cx}
                  y={cy + 26}
                  textAnchor="middle"
                  fill="rgba(244,208,63,0.7)"
                  fontSize={9}
                  fontFamily="'Geist Mono', monospace"
                >
                  Selected
                </text>
              </g>
            );
          }}>
            {selectedPoints.map(pt => (
              <Cell key={pt.label} fill="#f4d03f" />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Summary table */}
      {portfolios.length > 0 && (
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Portfolio', 'Cost (AUD)', 'CVaR (AUD)', 'Emissions (tCO\u2082e)', 'Status'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '4px 8px',
                      textAlign: 'left',
                      color: 'rgba(255,255,255,0.4)',
                      fontWeight: 500,
                      ...MONO,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map(pt => (
                <tr
                  key={pt.label}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: pt.isSelected ? 'rgba(244,208,63,0.05)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '4px 8px', color: pt.isSelected ? '#f4d03f' : 'rgba(255,255,255,0.7)', fontWeight: pt.isSelected ? 700 : 400, ...MONO }}>
                    {pt.label.replace(/\+/g, ' + ')}
                  </td>
                  <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.6)', ...MONO }}>
                    {pt.cost.toLocaleString()}
                  </td>
                  <td style={{ padding: '4px 8px', color: pt.feasible ? 'rgba(255,255,255,0.6)' : '#ef4444', ...MONO }}>
                    {pt.cvar.toLocaleString()}
                  </td>
                  <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.6)', ...MONO }}>
                    {pt.emissions.toFixed(1)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: pt.isSelected ? '#f4d03f' : pt.feasible ? '#22c55e' : '#ef4444',
                        padding: '1px 5px',
                        background: pt.isSelected ? 'rgba(244,208,63,0.1)' : pt.feasible ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${pt.isSelected ? 'rgba(244,208,63,0.3)' : pt.feasible ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        borderRadius: 3,
                      }}
                    >
                      {pt.isSelected ? 'Selected' : pt.feasible ? 'Feasible' : 'Infeasible'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
