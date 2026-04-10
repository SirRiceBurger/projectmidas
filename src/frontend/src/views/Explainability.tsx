import { useState } from 'react';
import { Card } from '../components/Card';
import { auditTrail, parameters } from '../data/synthetic';
import type { PipelineResponse } from '../data/api';
import { SensitivityTornado } from '../components/charts/SensitivityTornado';

interface Props {
  pipelineResult?: PipelineResponse | null;
}

export function Explainability({ pipelineResult }: Props) {
  const [openStages, setOpenStages] = useState<Set<number>>(new Set([1, 2, 3]));
  const [modelCardOpen, setModelCardOpen] = useState(false);

  const toggleStage = (n: number) => {
    setOpenStages(prev => {
      const next = new Set(prev);
      if (next.has(n)) { next.delete(n); } else { next.add(n); }
      return next;
    });
  };

  const moduleColors: Record<string, string> = {
    ingestion: 'var(--accent)',
    zoning: 'var(--accent-green)',
    interventions: 'var(--accent-amber)',
    monte_carlo: 'var(--accent-purple)',
    scoring: 'var(--accent-green)',
    optimiser: 'var(--accent)',
    explainability: 'var(--text-secondary)',
  };

  const narrative = pipelineResult?.narrative ??
    'Mercury selected Revegetation Belt and Rooftop Solar Retrofit as the optimal portfolio, ' +
    'delivering an expected 265.8 tCO\u2082e of success-adjusted carbon reduction ' +
    'at a total cost of AUD 340,000 \u2014 well within the AUD 350,000 budget. ' +
    'Water Retention & Soil Restoration was excluded because its inclusion in any portfolio combination ' +
    'pushed the CVaR above the AUD 70,000 risk cap. ' +
    'This selection reverses the naive carbon-per-dollar ranking \u2014 ' +
    "Mercury's risk adjustment penalises Water Retention's " +
    'high tail-loss exposure (CVaR AUD 90,000).';

  const liveAuditTrail = pipelineResult?.audit_trail;

  const modelParams = pipelineResult?.parameters_used;

  const modelCardParams = modelParams
    ? [
        { label: '\u03b1 (CVaR level)', value: modelParams.alpha.toFixed(2) },
        { label: '\u03bb (risk penalty)', value: modelParams.lambda_.toFixed(2) },
        { label: 'S (scenarios)', value: modelParams.S.toLocaleString() },
        { label: 'T (horizon)', value: `${modelParams.T} yr` },
        { label: '\u03b2 (resilience weight)', value: modelParams.beta.toFixed(2) },
        { label: 'B (budget)', value: `AUD ${modelParams.B.toLocaleString()}` },
        { label: '\u0393 (CVaR cap)', value: `AUD ${modelParams.Gamma.toLocaleString()}` },
      ]
    : [
        { label: '\u03b1 (CVaR level)', value: parameters.alpha.toFixed(2) },
        { label: '\u03bb (risk penalty)', value: parameters.lambda.toFixed(1) },
        { label: 'S (scenarios)', value: parameters.scenarios.toLocaleString() },
        { label: 'T (horizon)', value: `${parameters.horizon} yr` },
      ];

  const renderInclusionExclusion = () => {
    if (pipelineResult?.interventions_detail) {
      return pipelineResult.interventions_detail.map(iv => {
        const isSelected = pipelineResult.portfolio.intervention_ids.includes(iv.id);
        const excl = pipelineResult.exclusion_reasons?.find(e => e.intervention_id === iv.id);
        return (
          <div key={iv.id} style={{
            padding: '12px',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${isSelected ? 'rgba(62,207,142,0.18)' : 'rgba(239,68,68,0.18)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className="badge badge-purple">{iv.id}</span>
              <span style={{ fontWeight: '600', fontSize: '12px' }}>{iv.name}</span>
              <span
                className={`badge ${isSelected ? 'badge-green' : 'badge-red'}`}
                style={{ marginLeft: 'auto' }}
              >
                {isSelected ? 'Selected' : (excl?.reason_code ?? 'Not selected')}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.7' }}>
              {isSelected
                ? `Included in optimal portfolio \u2014 cost AUD ${iv.expected_cost.toLocaleString()}, CVaR AUD ${iv.cvar_loss.toLocaleString()}`
                : (excl?.detail ?? 'Did not maximise portfolio objective')}
            </p>
          </div>
        );
      });
    }

    return [
      {
        id: 'I1',
        name: 'Revegetation Belt',
        status: 'Selected',
        cls: 'badge-green',
        reasons: [
          'RACE = 7.03e-4 \u2014 above portfolio threshold',
          'Feasible in 2/3 zones (Zone A, B)',
          'Low-moderate CVaR = AUD 40,000',
          'Diversifying with I2 (\u03c1\u2081\u2082 = 0.28)',
        ],
      },
      {
        id: 'I2',
        name: 'Rooftop Solar Retrofit',
        status: 'Selected',
        cls: 'badge-green',
        reasons: [
          'Highest MercuryScore = 0.503',
          'Highest success probability p = 0.93',
          'Lowest CVaR = AUD 25,000 of all interventions',
          'Most diversifying intervention (lowest \u03c1)',
          'Feasible in all 3 zones',
        ],
      },
      {
        id: 'I3',
        name: 'Water Retention & Soil Restoration',
        status: 'Excluded',
        cls: 'badge-red',
        reasons: [
          'CVaR breach: I1+I3 CVaR = 103,000 > \u0393 70,000',
          'CVaR breach: I2+I3 CVaR = 79,000 > \u0393 70,000',
          'High correlation with I1: \u03c1\u2081\u2083 = 0.71',
          'Lowest success probability p = 0.65',
          'MercuryScore = 0.187 \u2014 lowest of three',
        ],
      },
    ].map(item => (
      <div key={item.id} style={{
        padding: '12px',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${item.status === 'Selected' ? 'rgba(62,207,142,0.18)' : 'rgba(239,68,68,0.18)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="badge badge-purple">{item.id}</span>
          <span style={{ fontWeight: '600', fontSize: '12px' }}>{item.name}</span>
          <span className={`badge ${item.cls}`} style={{ marginLeft: 'auto' }}>{item.status}</span>
        </div>
        <ul style={{ paddingLeft: '0', listStyle: 'none' }}>
          {item.reasons.map((r, i) => (
            <li key={i} style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: '1.7',
              paddingLeft: '8px',
              position: 'relative',
            }}>
              <span style={{
                position: 'absolute',
                left: 0,
                color: item.status === 'Selected' ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {item.status === 'Selected' ? '+' : '\u2013'}
              </span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    ));
  };

  const renderAuditTrail = () => {
    const stages = liveAuditTrail
      ? liveAuditTrail.map(s => ({
          stage: s.stage,
          module: s.module,
          label: s.description,
          detail: s.description,
          passed: s.passed,
        }))
      : auditTrail.map(s => ({ ...s, passed: true }));

    return stages.map(stage => {
      const isOpen = openStages.has(stage.stage);
      const color = moduleColors[stage.module] || 'var(--text-secondary)';
      return (
        <div key={stage.stage} style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}>
          <button
            onClick={() => toggleStage(stage.stage)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              background: isOpen ? 'var(--bg-surface-hover)' : 'var(--bg-elevated)',
              border: 'none',
              color: 'var(--text-primary)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{
              width: '20px', height: '20px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: '700', flexShrink: 0,
            }}>
              {stage.stage}
            </span>
            <span style={{ flex: 1, fontSize: '12px', fontWeight: '500' }}>{stage.label}</span>
            <span style={{ fontSize: '10px', color }}>{stage.module}</span>
            {liveAuditTrail && (
              <span style={{
                fontSize: '10px',
                color: stage.passed ? 'var(--accent-green)' : 'var(--accent-red)',
                marginLeft: '4px',
              }}>
                {stage.passed ? 'Passed' : 'Failed'}
              </span>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '4px' }}>
              {isOpen ? '\u25b2' : '\u25bc'}
            </span>
          </button>
          {isOpen && (
            <div style={{
              padding: '10px 12px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: '1.7',
              background: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border)',
            }}>
              {stage.detail}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div className="content-area">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 className="page-title">Explainability</h1>
          <p className="page-subtitle">Audit trail · inclusion/exclusion diagnostics</p>
        </div>
        {pipelineResult && <span className="badge badge-blue">Live API narrative</span>}
      </div>

      <Card style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(62,207,142,0.05))',
        border: '1px solid rgba(99,102,241,0.2)',
      }}>
        <div className="label" style={{ marginBottom: '10px' }}>Plain-English Narrative</div>
        <p style={{ fontSize: '14px', lineHeight: '1.8', color: 'var(--text-primary)', fontWeight: '400' }}>
          {narrative}
        </p>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Card title="Inclusion / Exclusion Drivers">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {renderInclusionExclusion()}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Card title="Audit Trail — Mercury Pipeline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {renderAuditTrail()}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <button
          onClick={() => setModelCardOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            padding: 0,
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Model Card
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            {modelCardOpen ? 'Collapse \u25b2' : 'Expand \u25bc'}
          </span>
        </button>

        {modelCardOpen && (
          <div style={{ marginTop: '16px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${modelCardParams.length <= 4 ? 4 : Math.min(modelCardParams.length, 7)}, 1fr)`,
              gap: '10px',
              marginBottom: '16px',
            }}>
              {modelCardParams.map(p => (
                <div key={p.label} style={{
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px',
                  border: '1px solid var(--border)',
                  textAlign: 'center',
                }}>
                  <div className="mono" style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent)', marginBottom: '4px' }}>
                    {p.value}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{p.label}</div>
                </div>
              ))}
            </div>

            <div className="divider" />

            <h3 style={{ marginBottom: '10px' }}>Assumptions</h3>
            <ul style={{ paddingLeft: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                'Feasibility constraints are hard \u2014 infeasible interventions never pass to the optimiser',
                'Emissions distributions are lognormal; cost distributions are normal',
                'CVaR computed at \u03b1=0.95 across S=10,000 Monte Carlo scenarios',
                'Correlation matrix is stationary over the planning horizon T=20 yr',
                'Resilience scores use proxy metrics pending bespoke ecological survey',
                'Cost estimates sourced from QS report; contingency rate 15% applied',
                'Climate hazard probabilities sourced from BOM CMIP6 projections',
                'The model does not account for regulatory, behavioural, or social constraints',
              ].map((a, i) => (
                <li key={i} style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.7',
                  paddingLeft: '14px',
                  position: 'relative',
                }}>
                  <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>&middot;</span>
                  {a}
                </li>
              ))}
            </ul>

            <div className="divider" />

            <h3 style={{ marginBottom: '10px' }}>References</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {[
                'Markowitz (1952) \u2014 Portfolio selection foundation',
                'Rockafellar & Uryasev (2000) \u2014 CVaR optimisation',
                'Krokhmal, Palmquist & Uryasev (2002) \u2014 Portfolio optimisation with CVaR constraints',
                'Glasserman (2004) \u2014 Monte Carlo methods in financial engineering',
                'Kalra et al. (2014) \u2014 Decision making under deep uncertainty',
              ].map((ref, i) => (
                <div key={i} style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  padding: '5px 10px',
                  background: 'var(--bg-elevated)',
                  borderRadius: '6px',
                  borderLeft: '2px solid rgba(99,102,241,0.25)',
                }}>
                  {ref}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      {pipelineResult && (
        <Card title="Parameter Sensitivity Analysis">
          <SensitivityTornado
            scored={pipelineResult.scored}
            interventions={pipelineResult.interventions_detail}
            params={{
              B: pipelineResult.parameters_used?.B ?? 350000,
              Gamma: pipelineResult.parameters_used?.Gamma ?? 70000,
              beta: pipelineResult.parameters_used?.beta ?? 0.3,
              lambda_: pipelineResult.parameters_used?.lambda_ ?? 0.5,
              S: pipelineResult.parameters_used?.S ?? 1000,
              T: pipelineResult.parameters_used?.T ?? 20,
            }}
          />
        </Card>
      )}
    </div>
    </div>
  );
}
