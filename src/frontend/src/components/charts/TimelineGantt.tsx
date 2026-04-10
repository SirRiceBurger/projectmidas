import { useState } from 'react';
import type { PipelineResponse, InterventionDetail } from '../../data/api';

interface Props {
  portfolio: PipelineResponse['portfolio'];
  interventions: PipelineResponse['interventions_detail'];
  horizonYears: number;
}

type Phase = 'establishment' | 'growth' | 'monitoring';

interface PhaseSegment {
  phase: Phase;
  startYear: number;
  endYear: number;
  label: string;
  color: string;
  description: string;
}

interface GanttRow {
  id: string;
  name: string;
  shortName: string;
  phases: PhaseSegment[];
  resilience: number;
  cost: number;
}

const PHASE_CONFIG: Record<Phase, { color: string; dimColor: string; label: string }> = {
  establishment: {
    color: '#6366f1',
    dimColor: 'rgba(99,102,241,0.6)',
    label: 'Establishment',
  },
  growth: {
    color: '#22c55e',
    dimColor: 'rgba(34,197,94,0.6)',
    label: 'Growth',
  },
  monitoring: {
    color: '#475569',
    dimColor: 'rgba(71,85,105,0.5)',
    label: 'Monitoring',
  },
};

function buildPhases(id: string, horizonYears: number): PhaseSegment[] {
  // Tailor phases slightly by intervention type
  const isReveg = id === 'I1' || id.toLowerCase().includes('reveg');
  const isSolar = id === 'I2' || id.toLowerCase().includes('solar');
  const isWater = id === 'I3' || id.toLowerCase().includes('water');

  let establishEnd = 1;
  let growthEnd = 5;

  if (isReveg) { establishEnd = 2; growthEnd = 7; }
  if (isSolar) { establishEnd = 1; growthEnd = 3; }
  if (isWater) { establishEnd = 1; growthEnd = 5; }

  // Clamp to horizon
  establishEnd = Math.min(establishEnd, horizonYears);
  growthEnd = Math.min(growthEnd, horizonYears);

  const phases: PhaseSegment[] = [];

  phases.push({
    phase: 'establishment',
    startYear: 0,
    endYear: establishEnd,
    label: 'Est.',
    color: PHASE_CONFIG.establishment.color,
    description: `Year 0\u2013${establishEnd}: Site preparation, procurement, installation, initial establishment works.`,
  });

  if (growthEnd > establishEnd) {
    phases.push({
      phase: 'growth',
      startYear: establishEnd,
      endYear: growthEnd,
      label: 'Growth',
      color: PHASE_CONFIG.growth.color,
      description: `Year ${establishEnd}\u2013${growthEnd}: Active growth and management phase; emissions reduction ramps up.`,
    });
  }

  if (horizonYears > growthEnd) {
    phases.push({
      phase: 'monitoring',
      startYear: growthEnd,
      endYear: horizonYears,
      label: 'Monitor',
      color: PHASE_CONFIG.monitoring.color,
      description: `Year ${growthEnd}\u2013${horizonYears}: Long-term monitoring, reporting, and maintenance.`,
    });
  }

  return phases;
}

function buildRows(
  portfolioIds: string[],
  interventions: InterventionDetail[],
  horizonYears: number,
): GanttRow[] {
  const detailMap = Object.fromEntries(interventions.map(iv => [iv.id, iv]));
  return portfolioIds.map(id => {
    const iv = detailMap[id];
    const name = iv?.name ?? id;
    return {
      id,
      name,
      shortName: name.length > 22 ? name.slice(0, 21) + '\u2026' : name,
      phases: buildPhases(id, horizonYears),
      resilience: iv?.resilience_score ?? 0,
      cost: iv?.expected_cost ?? 0,
    };
  });
}

interface HoverInfo {
  phase: PhaseSegment;
  row: GanttRow;
  clientX: number;
  clientY: number;
}

const YEAR_COL_WIDTH = 36;
const ROW_LABEL_WIDTH = 140;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 32;

export function TimelineGantt({ portfolio, interventions, horizonYears }: Props) {
  const [hovered, setHovered] = useState<HoverInfo | null>(null);

  const portfolioIds = portfolio?.intervention_ids ?? [];

  if (portfolioIds.length === 0) {
    return (
      <div
        style={{
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          color: 'rgba(255,255,255,0.3)',
          fontSize: 13,
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 8,
          minHeight: 120,
        }}
      >
        <div>No portfolio selected</div>
        <div style={{ fontSize: 11 }}>Run the pipeline to generate timeline</div>
      </div>
    );
  }

  const T = Math.max(5, Math.min(50, horizonYears || 20));
  const rows = buildRows(portfolioIds, interventions ?? [], T);
  const years = Array.from({ length: T + 1 }, (_, i) => i);

  const totalWidth = ROW_LABEL_WIDTH + (T + 1) * YEAR_COL_WIDTH;
  const totalHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT;

  const getYearX = (year: number) => ROW_LABEL_WIDTH + year * YEAR_COL_WIDTH;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Portfolio Implementation Timeline
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {(Object.keys(PHASE_CONFIG) as Phase[]).map(phase => (
            <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 24, height: 8, borderRadius: 2, background: PHASE_CONFIG[phase].color }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                {PHASE_CONFIG[phase].label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          overflowX: 'auto',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ minWidth: totalWidth, position: 'relative' }}>
          {/* SVG for the gantt bars */}
          <svg width={totalWidth} height={totalHeight} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              {(Object.keys(PHASE_CONFIG) as Phase[]).map(phase => (
                <linearGradient key={phase} id={`gantt-grad-${phase}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={PHASE_CONFIG[phase].color} stopOpacity="0.9" />
                  <stop offset="100%" stopColor={PHASE_CONFIG[phase].color} stopOpacity="0.6" />
                </linearGradient>
              ))}
            </defs>

            {/* Header row */}
            <rect x={0} y={0} width={totalWidth} height={HEADER_HEIGHT} fill="rgba(255,255,255,0.03)" />
            <rect x={0} y={0} width={ROW_LABEL_WIDTH} height={HEADER_HEIGHT} fill="rgba(255,255,255,0.04)" />
            <text x={10} y={HEADER_HEIGHT / 2} dominantBaseline="middle" fill="rgba(255,255,255,0.4)" fontSize={11} fontFamily="'Geist Mono', monospace">
              Intervention
            </text>

            {/* Year column headers */}
            {years.map(yr => (
              <g key={yr}>
                <line
                  x1={getYearX(yr)}
                  y1={0}
                  x2={getYearX(yr)}
                  y2={totalHeight}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={1}
                />
                <text
                  x={getYearX(yr) + YEAR_COL_WIDTH / 2}
                  y={HEADER_HEIGHT / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.4)"
                  fontSize={10}
                  fontFamily="'Geist Mono', monospace"
                >
                  {yr}
                </text>
              </g>
            ))}

            {/* Row stripes + content */}
            {rows.map((row, rowIdx) => {
              const rowY = HEADER_HEIGHT + rowIdx * ROW_HEIGHT;
              const stripe = rowIdx % 2 === 0;

              return (
                <g key={row.id}>
                  {/* Row stripe */}
                  <rect
                    x={0}
                    y={rowY}
                    width={totalWidth}
                    height={ROW_HEIGHT}
                    fill={stripe ? 'rgba(255,255,255,0.01)' : 'transparent'}
                  />
                  <rect
                    x={0}
                    y={rowY}
                    width={totalWidth}
                    height={ROW_HEIGHT}
                    fill="none"
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth={1}
                  />

                  {/* Row label area */}
                  <rect x={0} y={rowY} width={ROW_LABEL_WIDTH} height={ROW_HEIGHT} fill="rgba(255,255,255,0.02)" />
                  <text
                    x={10}
                    y={rowY + 14}
                    fill="rgba(255,255,255,0.7)"
                    fontSize={11}
                    fontWeight={600}
                    fontFamily="'Geist Mono', monospace"
                  >
                    {row.id}
                  </text>
                  <text
                    x={10}
                    y={rowY + 27}
                    fill="rgba(255,255,255,0.4)"
                    fontSize={9}
                    fontFamily="system-ui, sans-serif"
                  >
                    {row.shortName}
                  </text>

                  {/* Resilience bar (mini indicator) */}
                  <rect
                    x={ROW_LABEL_WIDTH - 14}
                    y={rowY + 8}
                    width={6}
                    height={(ROW_HEIGHT - 16) * row.resilience}
                    rx={2}
                    fill="#6366f1"
                    fillOpacity={0.6}
                    transform={`translate(0, ${(ROW_HEIGHT - 16) * (1 - row.resilience)})`}
                  />

                  {/* Phase bars */}
                  {row.phases.map(phase => {
                    const barX = getYearX(phase.startYear) + 2;
                    const barWidth = (phase.endYear - phase.startYear) * YEAR_COL_WIDTH - 4;
                    const barY = rowY + 8;
                    const barH = ROW_HEIGHT - 16;

                    return (
                      <g
                        key={phase.phase}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) =>
                          setHovered({ phase, row, clientX: e.clientX, clientY: e.clientY })
                        }
                        onMouseLeave={() => setHovered(null)}
                      >
                        <rect
                          x={barX}
                          y={barY}
                          width={Math.max(barWidth, 0)}
                          height={barH}
                          rx={4}
                          fill={`url(#gantt-grad-${phase.phase})`}
                        />
                        {barWidth > 30 && (
                          <text
                            x={barX + barWidth / 2}
                            y={barY + barH / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#fff"
                            fontSize={9}
                            fontWeight={600}
                            fontFamily="system-ui, sans-serif"
                            style={{ pointerEvents: 'none' }}
                          >
                            {phase.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Current year marker (year 0) */}
            <line
              x1={getYearX(0)}
              y1={HEADER_HEIGHT}
              x2={getYearX(0)}
              y2={totalHeight}
              stroke="rgba(99,102,241,0.4)"
              strokeWidth={2}
            />
          </svg>
        </div>
      </div>

      {/* Hover tooltip rendered as a fixed overlay */}
      {hovered && (
        <div
          style={{
            position: 'fixed',
            left: hovered.clientX + 12,
            top: hovered.clientY - 10,
            background: 'rgba(14,16,23,0.97)',
            border: `1px solid ${PHASE_CONFIG[hovered.phase.phase].color}44`,
            borderRadius: 8,
            padding: '8px 12px',
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            maxWidth: 280,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: PHASE_CONFIG[hovered.phase.phase].color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 700, fontSize: 12, color: '#fff' }}>
              {PHASE_CONFIG[hovered.phase.phase].label} Phase
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Geist Mono', monospace",
              }}
            >
              {hovered.row.id}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            {hovered.phase.description}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
            <strong>{hovered.row.name}</strong>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Cost: AUD {hovered.row.cost.toLocaleString()} &nbsp;|&nbsp; Resilience: {hovered.row.resilience.toFixed(2)}
          </div>
        </div>
      )}

      {/* Metadata footer */}
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {rows.map(row => (
          <div
            key={row.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6,
              fontSize: 11,
            }}
          >
            <span style={{ fontWeight: 700, color: '#6366f1', fontFamily: "'Geist Mono', monospace" }}>
              {row.id}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>
              AUD {row.cost.toLocaleString()}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>
              R: {row.resilience.toFixed(2)}
            </span>
          </div>
        ))}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center' }}>
          Horizon: {T} years &nbsp;|&nbsp; Resilience bar shown right of label
        </div>
      </div>
    </div>
  );
}
