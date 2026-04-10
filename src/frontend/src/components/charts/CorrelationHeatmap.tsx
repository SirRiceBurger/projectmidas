import { useState } from 'react';
import type { PipelineResponse, InterventionDetail } from '../../data/api';

interface Props {
  correlations: PipelineResponse['correlations'];
  interventions: PipelineResponse['interventions_detail'];
}

interface CellData {
  i: string;
  j: string;
  rho: number;
  nameI: string;
  nameJ: string;
}

/**
 * Convert rho [-1, 1] to a background colour:
 * -1 → blue, 0 → near-black, +1 → red
 * Diagonal (rho=1) → bright red
 */
function rhoToColor(rho: number, isDiag: boolean): string {
  if (isDiag) return 'rgba(239,68,68,0.8)';
  if (rho > 0) {
    const t = rho;
    const r = Math.round(20 + (239 - 20) * t);
    const g = Math.round(20 + (68 - 20) * t * 0.3);
    const b = Math.round(20 + (68 - 20) * t * 0.3);
    return `rgba(${r},${g},${b},${0.2 + t * 0.6})`;
  } else {
    const t = -rho;
    const r = Math.round(20 + (59 - 20) * t * 0.3);
    const g = Math.round(20 + (130 - 20) * t * 0.3);
    const b = Math.round(20 + (246 - 20) * t);
    return `rgba(${r},${g},${b},${0.2 + t * 0.6})`;
  }
}

function rhoToTextColor(rho: number, isDiag: boolean): string {
  if (isDiag) return '#fff';
  const abs = Math.abs(rho);
  if (abs > 0.5) return '#fff';
  return 'rgba(255,255,255,0.7)';
}

function corrLabel(rho: number): { text: string; color: string } {
  if (rho >= 0.95) return { text: 'Perfect', color: '#ef4444' };
  if (rho >= 0.7) return { text: 'High', color: '#ef4444' };
  if (rho >= 0.4) return { text: 'Moderate', color: '#f59e0b' };
  if (rho >= 0.1) return { text: 'Low', color: '#22c55e' };
  if (rho >= -0.1) return { text: 'None', color: '#6b7280' };
  if (rho >= -0.4) return { text: 'Low neg.', color: '#60a5fa' };
  return { text: 'High neg.', color: '#3b82f6' };
}

interface HoverState {
  cell: CellData;
  x: number;
  y: number;
}

export function CorrelationHeatmap({ correlations, interventions }: Props) {
  const [hovered, setHovered] = useState<HoverState | null>(null);

  const corrMap: Record<string, number> = correlations ?? {};
  const ivList: InterventionDetail[] = interventions ?? [];

  const hasData = Object.keys(corrMap).length > 0;

  if (!hasData) {
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
          minHeight: 160,
        }}
      >
        <div>No correlation data available</div>
        <div style={{ fontSize: 11 }}>Correlation matrix requires at least 2 interventions in the pipeline</div>
      </div>
    );
  }

  // Collect unique IDs from correlation keys
  const idsFromCorr = new Set<string>();
  for (const key of Object.keys(corrMap)) {
    const [a, b] = key.split(':');
    if (a) idsFromCorr.add(a);
    if (b) idsFromCorr.add(b);
  }

  // Add IDs from interventions list
  for (const iv of ivList) {
    idsFromCorr.add(iv.id);
  }

  const ids = Array.from(idsFromCorr).sort();
  const nameMap = Object.fromEntries(ivList.map(iv => [iv.id, iv.name]));

  // Build correlation lookup (symmetric + diagonal)
  const corrLookup = new Map<string, number>();
  for (const [key, rho] of Object.entries(corrMap)) {
    const [a, b] = key.split(':');
    if (a && b) {
      corrLookup.set(`${a}:${b}`, rho);
      corrLookup.set(`${b}:${a}`, rho);
    }
  }

  const matrix: CellData[][] = ids.map(i =>
    ids.map(j => {
      const isDiag = i === j;
      const rho = isDiag ? 1.0 : (corrLookup.get(`${i}:${j}`) ?? 0);
      return { i, j, rho, nameI: nameMap[i] ?? i, nameJ: nameMap[j] ?? j };
    })
  );

  const CELL_SIZE = Math.max(64, Math.min(100, Math.floor(480 / ids.length)));

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
        CVaR Correlation Matrix
      </div>

      {/* Colour scale legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>&minus;1</span>
        <div
          style={{
            height: 8,
            width: 160,
            borderRadius: 4,
            background: 'linear-gradient(to right, rgba(59,130,246,0.8), rgba(20,20,20,0.5), rgba(239,68,68,0.8))',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>+1</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>
          Blue = negative &nbsp;|&nbsp; Red = positive correlation
        </span>
      </div>

      {/* Heatmap grid */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'inline-block', minWidth: 'max-content' }}>
          {/* Column headers */}
          <div style={{ display: 'flex', marginLeft: CELL_SIZE }}>
            {ids.map(id => (
              <div
                key={id}
                style={{
                  width: CELL_SIZE,
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.65)',
                  fontFamily: "'Geist Mono', 'SF Mono', monospace",
                  padding: '4px 2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={nameMap[id] ?? id}
              >
                {id}
              </div>
            ))}
          </div>

          {/* Rows */}
          {matrix.map((row, rowIdx) => (
            <div key={ids[rowIdx]} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Row header */}
              <div
                style={{
                  width: CELL_SIZE,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.65)',
                  fontFamily: "'Geist Mono', 'SF Mono', monospace",
                  padding: '2px 6px 2px 0',
                  textAlign: 'right',
                  flexShrink: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={nameMap[ids[rowIdx]] ?? ids[rowIdx]}
              >
                {ids[rowIdx]}
              </div>

              {/* Cells */}
              {row.map((cell) => {
                const isDiag = cell.i === cell.j;
                const bg = rhoToColor(cell.rho, isDiag);
                const textColor = rhoToTextColor(cell.rho, isDiag);

                return (
                  <div
                    key={`${cell.i}:${cell.j}`}
                    onMouseEnter={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setHovered({ cell, x: rect.left + rect.width / 2, y: rect.top });
                    }}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      background: bg,
                      border: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'default',
                      transition: 'opacity 0.1s',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: Math.max(10, CELL_SIZE * 0.16),
                        fontWeight: isDiag ? 800 : 600,
                        color: textColor,
                        fontFamily: "'Geist Mono', 'SF Mono', monospace",
                        lineHeight: 1,
                      }}
                    >
                      {cell.rho.toFixed(2)}
                    </span>
                    {!isDiag && CELL_SIZE >= 80 && (
                      <span
                        style={{
                          fontSize: 9,
                          color: corrLabel(cell.rho).color,
                          fontWeight: 600,
                          marginTop: 3,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}
                      >
                        {corrLabel(cell.rho).text}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div
          style={{
            position: 'fixed',
            left: hovered.x,
            top: hovered.y - 10,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(14,16,23,0.97)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 8,
            padding: '8px 12px',
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            minWidth: 200,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 12, color: '#fff', marginBottom: 6 }}>
            &rho;({hovered.cell.i}, {hovered.cell.j})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              [hovered.cell.i, hovered.cell.nameI],
              [hovered.cell.j, hovered.cell.nameJ],
            ].map(([id, name]) => (
              <div key={id} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                <span
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontWeight: 700,
                    color: 'rgba(99,102,241,0.9)',
                    minWidth: 24,
                  }}
                >
                  {id}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{name}</span>
              </div>
            ))}
            <div
              style={{
                marginTop: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                Correlation &rho;
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontWeight: 800,
                    fontSize: 16,
                    color: rhoToTextColor(hovered.cell.rho, hovered.cell.i === hovered.cell.j),
                  }}
                >
                  {hovered.cell.rho.toFixed(3)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: corrLabel(hovered.cell.rho).color,
                    padding: '1px 5px',
                    background: `${corrLabel(hovered.cell.rho).color}22`,
                    border: `1px solid ${corrLabel(hovered.cell.rho).color}44`,
                    borderRadius: 3,
                  }}
                >
                  {corrLabel(hovered.cell.rho).text}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary pairs */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(corrMap).map(([key, rho]) => {
          const [a, b] = key.split(':');
          const { text, color } = corrLabel(rho);
          return (
            <div
              key={key}
              style={{
                padding: '3px 8px',
                background: `${color}11`,
                border: `1px solid ${color}33`,
                borderRadius: 5,
                fontSize: 11,
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(255,255,255,0.6)' }}>
                {a}:{b}
              </span>
              <span style={{ fontWeight: 700, color, fontFamily: "'Geist Mono', monospace" }}>
                {rho.toFixed(2)}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
