import { useState, useEffect, useRef } from 'react';
import type { PipelineResponse } from '../data/api';

type Profile = 'default' | 'coder' | 'casual';

const PROFILES: { id: Profile; label: string; sub: string }[] = [
  { id: 'default', label: 'Default (Smart)', sub: 'Merriweather · Cormorant' },
  { id: 'coder',   label: 'Coder',           sub: 'JetBrains Mono'          },
  { id: 'casual',  label: 'Casual',          sub: 'Nunito'                  },
];

type ApiStatus = 'idle' | 'loading' | 'success' | 'error';

interface Props {
  viewTitle: string;
  apiStatus: ApiStatus;
  onRunPipeline: () => void;
  pipelineResult: PipelineResponse | null;
  projectName: string;
  isDirty: boolean;
  isRecalculating: boolean;
  onRecalculate: () => void;
}

function StatusDot({ status }: { status: ApiStatus }) {
  if (status === 'loading') {
    return (
      <span style={{
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: 'var(--accent-amber)',
        display: 'inline-block',
        animation: 'pulse 1s ease-in-out infinite',
      }} />
    );
  }
  const color = status === 'success'
    ? 'var(--accent-green)'
    : status === 'error'
    ? 'var(--accent-red)'
    : 'var(--text-muted)';
  return (
    <span style={{
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: color,
      boxShadow: status === 'success' ? `0 0 6px ${color}` : undefined,
      display: 'inline-block',
    }} />
  );
}

function exportReport(pipelineResult: PipelineResponse | null) {
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  const portfolio = pipelineResult?.portfolio
  const params = pipelineResult?.parameters_used
  const scored = pipelineResult?.scored ?? []
  const details = pipelineResult?.interventions_detail ?? []
  const detailMap = Object.fromEntries(details.map(d => [d.id, d]))
  const allPortfolios = pipelineResult?.all_portfolios ?? []
  const correlations = pipelineResult?.correlations ?? {}
  const exclusions = pipelineResult?.exclusion_reasons ?? []
  const narrative = pipelineResult?.narrative ?? ''
  const mercuryRanking = pipelineResult?.mercury_ranking ?? []
  const naiveRanking = pipelineResult?.naive_ranking ?? []
  const naiveScores = pipelineResult?.naive_scores ?? {}

  const fmt = (n: number) => n.toLocaleString('en-AU')
  const fmtAUD = (n: number) => `AUD ${fmt(Math.round(n))}`

  const interventionRows = scored.map(s => {
    const d = detailMap[s.intervention_id]
    if (!d) return ''
    const mRank = mercuryRanking.indexOf(s.intervention_id) + 1
    const nRank = naiveRanking.indexOf(s.intervention_id) + 1
    return `<tr>
      <td>${d.name}</td>
      <td style="text-align:center">${mRank}</td>
      <td style="text-align:center">${nRank}</td>
      <td style="text-align:right">${d.expected_emissions.toFixed(1)}</td>
      <td style="text-align:right">${d.success_probability.toFixed(2)}</td>
      <td style="text-align:right">${fmtAUD(d.expected_cost)}</td>
      <td style="text-align:right">${fmtAUD(d.cvar_loss)}</td>
      <td style="text-align:right">${s.race.toExponential(2)}</td>
      <td style="text-align:right">${s.mercury_score.toFixed(3)}</td>
    </tr>`
  }).join('')

  const portfolioRows = allPortfolios.map(p => {
    const label = p.intervention_ids.slice().sort().map(id => detailMap[id]?.name ?? id).join(' + ')
    return `<tr style="color:${p.feasible ? '#111' : '#888'}">
      <td>${label}</td>
      <td style="text-align:right">${fmtAUD(p.total_cost)}</td>
      <td style="text-align:right">${p.expected_emissions.toFixed(1)}</td>
      <td style="text-align:right">${fmtAUD(p.portfolio_cvar)}</td>
      <td style="text-align:center">${p.feasible ? '✓' : '✗'}</td>
      <td style="color:#c00">${p.rejection_reason ?? ''}</td>
    </tr>`
  }).join('')

  const corrRows = Object.entries(correlations).map(([pair, rho]) => {
    const [a, b] = pair.split(':')
    const color = rho > 0.6 ? '#c00' : rho > 0.3 ? '#b6720a' : '#1a7a3c'
    return `<tr><td>${detailMap[a]?.name ?? a}</td><td>${detailMap[b]?.name ?? b}</td><td style="text-align:right;color:${color};font-weight:600">${(rho as number).toFixed(2)}</td></tr>`
  }).join('')

  const exclusionRows = exclusions.map(e =>
    `<tr><td>${detailMap[e.intervention_id]?.name ?? e.intervention_id}</td><td>${e.reason_code}</td><td>${e.detail}</td></tr>`
  ).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>MIDAS Report — ${date}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', serif; font-size: 11pt; color: #111; line-height: 1.5; padding: 40px 50px; }
  h1 { font-size: 22pt; font-weight: bold; margin-bottom: 4px; }
  h2 { font-size: 14pt; font-weight: bold; margin: 28px 0 10px; border-bottom: 2px solid #111; padding-bottom: 4px; }
  h3 { font-size: 11pt; font-weight: bold; margin: 16px 0 6px; }
  .subtitle { font-size: 10pt; color: #555; margin-bottom: 6px; }
  .meta { font-size: 9pt; color: #666; margin-top: 2px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
  .summary-card { border: 1px solid #ccc; border-radius: 6px; padding: 12px 14px; }
  .summary-card .val { font-size: 16pt; font-weight: bold; margin-bottom: 2px; }
  .summary-card .label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.06em; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9pt; }
  th { background: #f0f0f0; text-align: left; padding: 6px 8px; border: 1px solid #ccc; font-size: 8.5pt; }
  td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .narrative { background: #f7f7f7; border-left: 3px solid #333; padding: 12px 16px; margin: 12px 0; font-size: 10.5pt; line-height: 1.7; }
  .params { display: flex; gap: 24px; flex-wrap: wrap; background: #f7f7f7; padding: 12px 14px; border-radius: 6px; font-size: 9.5pt; }
  .params span { font-weight: bold; }
  .footer { margin-top: 40px; font-size: 8pt; color: #999; text-align: center; border-top: 1px solid #ddd; padding-top: 10px; }
  @media print { body { padding: 20px 28px; } }
</style>
</head>
<body>

<h1>MIDAS Portfolio Report</h1>
<div class="subtitle">Mercury-powered Intervention Decision and Analysis System — Engine v1.1</div>
<div class="meta">Generated: ${date}${params ? ` &nbsp;|&nbsp; Budget: ${fmtAUD(params.B)} &nbsp;|&nbsp; CVaR Cap: ${fmtAUD(params.Gamma)}` : ''}</div>

${narrative ? `<h2>Executive Summary</h2><div class="narrative">${narrative}</div>` : ''}

${portfolio ? `
<h2>Selected Portfolio</h2>
<div class="summary-grid">
  <div class="summary-card"><div class="val">${portfolio.intervention_ids.map(id => detailMap[id]?.name ?? id).join(', ')}</div><div class="label">Selected interventions</div></div>
  <div class="summary-card"><div class="val">${fmtAUD(portfolio.total_cost)}</div><div class="label">Total cost</div></div>
  <div class="summary-card"><div class="val">${portfolio.expected_emissions.toFixed(1)} tCO₂e</div><div class="label">Expected carbon</div></div>
  <div class="summary-card"><div class="val">${fmtAUD(portfolio.portfolio_cvar)}</div><div class="label">Portfolio CVaR (95%)</div></div>
</div>` : '<p>No pipeline result available. Run the Mercury pipeline first.</p>'}

${params ? `
<h2>Run Parameters</h2>
<div class="params">
  <div><span>B</span> = ${fmtAUD(params.B)}</div>
  <div><span>Γ</span> = ${fmtAUD(params.Gamma)}</div>
  <div><span>β</span> = ${params.beta}</div>
  <div><span>λ</span> = ${params.lambda_}</div>
  <div><span>α</span> = ${params.alpha}</div>
  <div><span>S</span> = ${fmt(params.S)} scenarios</div>
  <div><span>T</span> = ${params.T} years</div>
</div>` : ''}

${interventionRows ? `
<h2>Intervention Scoring</h2>
<table>
  <thead><tr><th>Name</th><th>Mercury Rank</th><th>Naive Rank</th><th>E[E] (tCO₂e)</th><th>p</th><th>E[K]</th><th>CVaR</th><th>RACE</th><th>MercuryScore</th></tr></thead>
  <tbody>${interventionRows}</tbody>
</table>
${Object.keys(naiveScores).length ? `<p style="margin-top:8px;font-size:9pt;color:#555">Naive ranking by E/K ratio: ${naiveRanking.map(id => `${detailMap[id]?.name ?? id} (${(naiveScores[id] ?? 0).toFixed(4)})`).join(' > ')}</p>` : ''}` : ''}

${portfolioRows ? `
<h2>Portfolio Comparison</h2>
<table>
  <thead><tr><th>Combination</th><th>Total Cost</th><th>Carbon (tCO₂e)</th><th>Portfolio CVaR</th><th>Feasible</th><th>Rejection Reason</th></tr></thead>
  <tbody>${portfolioRows}</tbody>
</table>` : ''}

${corrRows ? `
<h2>Correlation Matrix</h2>
<table>
  <thead><tr><th>Intervention A</th><th>Intervention B</th><th>ρ</th></tr></thead>
  <tbody>${corrRows}</tbody>
</table>` : ''}

${exclusionRows ? `
<h2>Exclusion Diagnostics</h2>
<table>
  <thead><tr><th>Intervention</th><th>Reason Code</th><th>Detail</th></tr></thead>
  <tbody>${exclusionRows}</tbody>
</table>` : ''}

<div class="footer">MIDAS v2.0 &nbsp;|&nbsp; Mercury Engine v1.1 &nbsp;|&nbsp; Confidential — for planning purposes only</div>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

export function TopBar({ viewTitle, apiStatus, onRunPipeline, pipelineResult, projectName, isDirty, isRecalculating, onRecalculate }: Props) {
  void viewTitle; // viewTitle is accepted by the interface but shown in page header via the App title bar
  const [profile, setProfile] = useState<Profile>('default');
  const [shareCopied, setShareCopied] = useState(false);

  function handleShare() {
    navigator.clipboard.writeText('https://github.com/SirRiceBurger/midas').then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.documentElement;
    if (profile === 'default') el.removeAttribute('data-profile');
    else el.setAttribute('data-profile', profile);
  }, [profile]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const statusLabel = apiStatus === 'idle'
    ? 'Not run'
    : apiStatus === 'loading'
    ? 'Running...'
    : apiStatus === 'success'
    ? 'Ready'
    : 'Error';

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: '#0f0f0f',
      borderBottom: '1px solid #1f1f1f',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: '12px',
      flexShrink: 0,
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Breadcrumb */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontFamily: 'Geist, sans-serif' }}>
        <span style={{ color: '#666' }}>Home</span>
        <span style={{ color: '#444' }}>›</span>
        <span style={{ color: '#666' }}>Projects</span>
        <span style={{ color: '#444' }}>›</span>
        <span style={{ color: '#f5f5f3' }}>{projectName}</span>
      </div>

      {/* Right-side controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isDirty && (
          <button
            className="chip"
            onClick={onRecalculate}
            disabled={isRecalculating}
            style={{ opacity: isRecalculating ? 0.6 : 1 }}
          >
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#eab308',
              display: 'inline-block',
              flexShrink: 0,
            }} />
            {isRecalculating ? 'Recalculating...' : 'Recalculate \u21BA'}
          </button>
        )}

        {/* Profile selector */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setProfileOpen(v => !v)}
            style={{
              background: '#141414',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              color: '#666',
              fontFamily: 'Geist Mono, monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {PROFILES.find(p => p.id === profile)?.label}
            <span style={{ fontSize: 10 }}>⌄</span>
          </button>
          {profileOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: '#141414',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              overflow: 'hidden',
              zIndex: 100,
              minWidth: 180,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              {PROFILES.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setProfile(p.id); setProfileOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 14px',
                    background: profile === p.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #1f1f1f',
                    cursor: 'pointer',
                    color: profile === p.id ? '#818cf8' : '#f5f5f3',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{p.label}</div>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 2, fontFamily: 'Geist Mono, monospace' }}>{p.sub}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="btn btn-secondary btn-sm" onClick={handleShare}>
          {shareCopied ? '✓ Link copied!' : 'Share repo'}
        </button>

        {/* API status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot status={apiStatus} />
          <span style={{ fontSize: 11, color: '#666', fontFamily: 'Geist, sans-serif' }}>
            <span style={{
              color: apiStatus === 'success' ? 'var(--accent-green)'
                : apiStatus === 'error' ? 'var(--accent-red)'
                : apiStatus === 'loading' ? 'var(--accent-amber)'
                : 'var(--text-muted)',
            }}>{statusLabel}</span>
          </span>
        </div>

        <button
          onClick={() => exportReport(pipelineResult)}
          className="btn btn-ghost btn-sm"
        >
          Export
        </button>

        <button
          onClick={onRunPipeline}
          disabled={apiStatus === 'loading'}
          className="btn btn-primary btn-sm"
        >
          {apiStatus === 'loading' ? 'Running...' : 'Run Pipeline'}
        </button>
      </div>
    </header>
  );
}
