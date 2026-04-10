import { useState } from 'react';
import { Card } from '../components/Card';
import { interventions, parameters } from '../data/synthetic';
import type { PipelineResponse } from '../data/api';
import { RaceScatterChart } from '../components/charts/RaceScatterChart';
import { MercuryScoreBar } from '../components/charts/MercuryScoreBar';

type SortKey = 'mercuryRank' | 'naiveRank' | 'race' | 'mercuryScore' | 'cvar';

interface Props {
  pipelineResult?: PipelineResponse | null;
}

export function Scoring({ pipelineResult }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('mercuryRank');

  const mercuryRanking = pipelineResult?.mercury_ranking ?? ['I2', 'I1', 'I3'];
  const naiveRanking = pipelineResult?.naive_ranking ?? ['I3', 'I1', 'I2'];

  const detailMap = Object.fromEntries(
    (pipelineResult?.interventions_detail ?? []).map(iv => [iv.id, iv])
  );

  const alpha = pipelineResult?.parameters_used?.alpha ?? parameters.alpha;
  const lambda = pipelineResult?.parameters_used?.lambda_ ?? parameters.lambda;
  const S = pipelineResult?.parameters_used?.S ?? parameters.scenarios;
  const T = pipelineResult?.parameters_used?.T ?? parameters.horizon;

  const naiveScores: Record<string, number> = pipelineResult?.naive_scores ?? {
    I3: 1.15e-3,
    I1: 1.00e-3,
    I2: 0.82e-3,
  };

  const allIds = Array.from(new Set([...mercuryRanking, ...naiveRanking]));

  const rows = allIds.map(id => {
    const detail = detailMap[id];
    const synth = interventions.find(i => i.id === id);
    const scored = pipelineResult?.scored.find(s => s.intervention_id === id);
    const mercuryRank = mercuryRanking.indexOf(id) + 1 || (synth?.mercuryRank ?? 99);
    const naiveRank = naiveRanking.indexOf(id) + 1 || (synth?.naiveRank ?? 99);
    return {
      id,
      name: detail?.name ?? synth?.name ?? id,
      expectedEmissions: detail?.expected_emissions ?? synth?.expectedEmissions ?? 0,
      successProbability: detail?.success_probability ?? synth?.successProbability ?? 0,
      cost: detail?.expected_cost ?? synth?.cost ?? 0,
      cvar: detail?.cvar_loss ?? synth?.cvar ?? 0,
      race: scored?.race ?? synth?.race ?? 0,
      mercuryScore: scored?.mercury_score ?? synth?.mercuryScore ?? 0,
      mercuryRank,
      naiveRank,
    };
  });

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'cvar') return a.cvar - b.cvar;
    return a[sortKey] < b[sortKey] ? -1 : 1;
  });

  const colHeader = (label: string, key: SortKey) => (
    <th
      onClick={() => setSortKey(key)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ color: sortKey === key ? 'var(--accent)' : undefined }}>
        {label} {sortKey === key ? '▲' : ''}
      </span>
    </th>
  );

  const naiveTop = naiveRanking[0];
  const mercuryTop = mercuryRanking[0];
  const rankingReversal = naiveTop !== mercuryTop;
  const topMercuryScored = pipelineResult?.scored.find(s => s.intervention_id === mercuryTop);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div className="content-area">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 className="page-title">Scoring</h1>
          <p className="page-subtitle">RACE metric · MercuryScore ranking</p>
        </div>
        {pipelineResult && (
          <span className="badge badge-blue">Live API ranking</span>
        )}
      </div>

      <Card>
        <div className="label" style={{ marginBottom: '10px' }}>RACE Formula (Risk-Adjusted Carbon Efficiency)</div>
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '16px 20px',
          fontFamily: "'Geist Mono', 'SF Mono', monospace",
          fontSize: '14px',
          color: 'var(--accent)',
          lineHeight: '2',
        }}>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>RACE</span>
            <span style={{ color: 'var(--text-muted)' }}>_j</span>
            <span style={{ color: 'var(--text-primary)' }}> = </span>
            <span style={{ color: 'var(--accent-green)' }}>( E[E_j] &middot; p_j )</span>
            <span style={{ color: 'var(--text-primary)' }}> / </span>
            <span style={{ color: 'var(--accent-amber)' }}>( E[K_j] + &lambda; &middot; CVaR_&alpha;(L_j) )</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', fontFamily: 'inherit' }}>
            Parameters: &lambda; = {lambda} &middot; &alpha; = {alpha} &middot; S = {S.toLocaleString()} scenarios &middot; T = {T} yr
          </div>
        </div>

        <div className="label" style={{ margin: '16px 0 10px' }}>MercuryScore Formula</div>
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px 20px',
          fontFamily: "'Geist Mono', 'SF Mono', monospace",
          fontSize: '13px',
          color: 'var(--accent-purple)',
          lineHeight: '1.8',
        }}>
          MercuryScore_j = &theta;&#8321;&middot;z(RACE_j) + &theta;&#8322;&middot;z(E[R_j]) + &theta;&#8323;&middot;z(p_j) &minus; &theta;&#8324;&middot;z(CVaR_&alpha;) &minus; &theta;&#8325;&middot;z(&rho;_j)
        </div>
      </Card>

      <Card title="Computed Values — Click column to sort">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                {colHeader('Mercury Rank', 'mercuryRank')}
                {colHeader('Naive Rank', 'naiveRank')}
                <th>ID</th>
                <th>Intervention</th>
                <th>E[E] (tCO2e)</th>
                <th>p</th>
                <th>Cost (AUD)</th>
                {colHeader('CVaR (AUD)', 'cvar')}
                {colHeader('RACE', 'race')}
                {colHeader('MercuryScore', 'mercuryScore')}
              </tr>
            </thead>
            <tbody>
              {sorted.map(inv => {
                const rankDelta = inv.naiveRank - inv.mercuryRank;
                return (
                  <tr key={inv.id} style={{
                    background: inv.mercuryRank === 1 ? 'rgba(99,102,241,0.06)' : undefined,
                  }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: inv.mercuryRank === 1 ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
                          color: inv.mercuryRank === 1 ? 'var(--accent-green)' : 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: '700',
                          border: inv.mercuryRank === 1 ? '1px solid rgba(62,207,142,0.3)' : '1px solid var(--border)',
                        }}>
                          {inv.mercuryRank}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          border: '1px solid var(--border)',
                        }}>
                          {inv.naiveRank}
                        </span>
                        {rankDelta !== 0 && (
                          <span style={{
                            fontSize: '10px',
                            color: rankDelta > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                            fontWeight: '600',
                          }}>
                            {rankDelta > 0 ? `+${rankDelta}` : rankDelta}
                          </span>
                        )}
                      </div>
                    </td>
                    <td><span className="badge badge-purple">{inv.id}</span></td>
                    <td style={{ fontWeight: '500' }}>{inv.name}</td>
                    <td className="mono" style={{ color: 'var(--accent-green)', fontWeight: '500' }}>{inv.expectedEmissions}</td>
                    <td className="mono">{inv.successProbability.toFixed(2)}</td>
                    <td className="mono">{inv.cost.toLocaleString()}</td>
                    <td className="mono" style={{
                      color: inv.cvar > 60000 ? 'var(--accent-red)' : inv.cvar > 30000 ? 'var(--accent-amber)' : 'var(--accent-green)',
                      fontWeight: '500',
                    }}>
                      {inv.cvar.toLocaleString()}
                    </td>
                    <td className="mono" style={{ color: 'var(--accent)', fontWeight: '600' }}>
                      {inv.race.toExponential(2)}
                    </td>
                    <td>
                      <span className="mono" style={{ fontWeight: '700', color: inv.mercuryRank === 1 ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                        {inv.mercuryScore.toFixed(3)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <div className="label" style={{ marginBottom: '12px' }}>Mercury Ranking (Risk-Adjusted)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mercuryRanking.map((id, idx) => {
                const detail = detailMap[id];
                const synth = interventions.find(i => i.id === id);
                const name = detail?.name ?? synth?.name ?? id;
                const scored = pipelineResult?.scored.find(s => s.intervention_id === id);
                const score = scored?.mercury_score ?? synth?.mercuryScore ?? 0;
                return (
                  <div key={id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    background: idx === 0 ? 'rgba(62,207,142,0.06)' : 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${idx === 0 ? 'rgba(62,207,142,0.25)' : 'var(--border)'}`,
                  }}>
                    <span style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: idx === 0 ? 'var(--accent-green)' : 'rgba(255,255,255,0.08)',
                      color: idx === 0 ? 'white' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: '700', flexShrink: 0,
                    }}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span className="badge badge-purple">{id}</span>
                        <span style={{ fontSize: '12px', fontWeight: '500' }}>{name}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        score: {score.toFixed(3)}
                      </div>
                    </div>
                    <span className="mono" style={{ fontWeight: '700', color: idx === 0 ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                      {score.toFixed(3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: '12px' }}>Naive Ranking (Carbon per AUD)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {naiveRanking.map((id, idx) => {
                const detail = detailMap[id];
                const synth = interventions.find(i => i.id === id);
                const name = detail?.name ?? synth?.name ?? id;
                const ratio = naiveScores[id];
                return (
                  <div key={id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    opacity: mercuryRanking.indexOf(id) === 0 ? 0.7 : 1,
                  }}>
                    <span style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: 'rgba(255,255,255,0.08)',
                      color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: '700', flexShrink: 0,
                    }}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span className="badge badge-purple">{id}</span>
                        <span style={{ fontSize: '12px', fontWeight: '500' }}>{name}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {ratio != null ? `${ratio.toFixed(4)} tCO2e/AUD` : '–'}
                      </div>
                    </div>
                    <span className="mono" style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>
                      {ratio != null ? ratio.toFixed(4) : '–'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: 'rgba(167,139,250,0.08)',
          border: '1px solid rgba(167,139,250,0.2)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{ fontWeight: '600', color: 'var(--accent-purple)', marginBottom: '4px' }}>
            {rankingReversal ? 'Ranking Reversal' : 'Ranking Comparison'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
            {rankingReversal ? (
              <>
                Naive #1: {naiveTop} ({detailMap[naiveTop]?.name ?? interventions.find(i => i.id === naiveTop)?.name ?? naiveTop})
                {naiveScores[naiveTop] != null ? ` — ${naiveScores[naiveTop].toFixed(4)} tCO2e/AUD` : ''}.{' '}
                Mercury #1: {mercuryTop} ({detailMap[mercuryTop]?.name ?? interventions.find(i => i.id === mercuryTop)?.name ?? mercuryTop})
                {topMercuryScored != null ? ` — score: ${topMercuryScored.mercury_score.toFixed(3)}` : ''}.{' '}
                Mercury penalises high CVaR and co-movement with portfolio interventions.
              </>
            ) : (
              <>
                Mercury and naive rankings agree on the top intervention ({mercuryTop}).
                Divergences appear lower in the ranking where CVaR and correlation penalties apply.
              </>
            )}
          </div>
        </div>
      </Card>
      {pipelineResult && (
        <Card title="Charts">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <RaceScatterChart
              scored={pipelineResult.scored}
              interventions={pipelineResult.interventions_detail}
              portfolio={pipelineResult.portfolio}
            />
            <div className="divider" />
            <MercuryScoreBar
              scored={pipelineResult.scored}
              interventions={pipelineResult.interventions_detail}
            />
          </div>
        </Card>
      )}
    </div>
    </div>
  );
}
