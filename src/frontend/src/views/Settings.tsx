import { useState } from 'react';
import { Card } from '../components/Card';
import type { PipelineParams, PipelineResponse } from '../data/api';
import { getApiKey, saveApiKey } from '../data/gemini';

interface Props {
  params: PipelineParams;
  setParams: (p: PipelineParams) => void;
  onRunPipeline: () => void;
  pipelineResult: PipelineResponse | null;
  projectName: string;
  setProjectName: (name: string) => void;
}

export function Settings({ params, setParams, onRunPipeline, pipelineResult, projectName, setProjectName }: Props) {
  const [coordSystem, setCoordSystem] = useState('GDA2020 / MGA55');
  const [geminiKey, setGeminiKey] = useState(getApiKey() ?? '');
  const [keySaved, setKeySaved] = useState(false);

  function handleSaveKey() {
    saveApiKey(geminiKey.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }

  const siteArea = pipelineResult
    ? `${pipelineResult.zones.reduce((sum, z) => sum + z.area_ha, 0).toFixed(1)} ha`
    : '\u2014';

  const sliders = [
    {
      label: 'Risk Penalty (\u03bb)',
      key: 'lambda_' as keyof PipelineParams,
      min: 0, max: 1, step: 0.05,
      display: params.lambda_.toFixed(2),
      color: 'var(--accent-amber)',
    },
    {
      label: 'Resilience Weight (\u03b2)',
      key: 'beta' as keyof PipelineParams,
      min: 0, max: 1, step: 0.05,
      display: params.beta.toFixed(2),
      color: 'var(--accent-purple)',
    },
    {
      label: 'Scenario Count (S)',
      key: 'S' as keyof PipelineParams,
      min: 100, max: 5000, step: 100,
      display: params.S.toLocaleString(),
      color: 'var(--accent-green)',
    },
    {
      label: 'Planning Horizon (T years)',
      key: 'T' as keyof PipelineParams,
      min: 5, max: 30, step: 1,
      display: `${params.T} yr`,
      color: 'var(--text-primary)',
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div className="content-area">
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Mercury engine parameters · project configuration</p>
      </div>

      {pipelineResult?.parameters_used && (
        <Card title="Last Run Parameters">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { label: 'Budget (B)', value: `AUD ${pipelineResult.parameters_used.B.toLocaleString()}` },
              { label: 'CVaR Cap (\u0393)', value: `AUD ${pipelineResult.parameters_used.Gamma.toLocaleString()}` },
              { label: '\u03bb (risk penalty)', value: pipelineResult.parameters_used.lambda_ },
              { label: '\u03b2 (resilience weight)', value: pipelineResult.parameters_used.beta },
              { label: 'S (scenarios)', value: pipelineResult.parameters_used.S.toLocaleString() },
              { label: 'T (horizon)', value: `${pipelineResult.parameters_used.T} years` },
            ].map(item => (
              <div key={item.label} style={{
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{item.label}</div>
                <div className="mono" style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Mercury Engine Parameters">
        <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span className="label">CVaR Confidence Level (\u03b1)</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent)' }}>0.95</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Fixed at 0.95 — hardcoded in backend</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
          {sliders.map(param => (
            <div key={param.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="label">{param.label}</label>
                <span style={{ fontSize: '14px', fontWeight: '700', color: param.color }}>{param.display}</span>
              </div>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={params[param.key] as number}
                onChange={e => setParams({ ...params, [param.key]: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                <span>{param.min}</span><span>{param.max}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="divider" />

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Parameter changes will take effect on next pipeline run.
        </div>

        <button
          onClick={onRunPipeline}
          className="btn btn-primary"
        >
          Re-run Mercury Pipeline
        </button>
      </Card>

      <Card title="Project Configuration">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="label" style={{ display: 'block', marginBottom: '6px' }}>Project Name</label>
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
            />
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: '6px' }}>Site Area</label>
            <input
              readOnly
              value={siteArea}
              style={{ cursor: 'not-allowed', color: 'var(--text-secondary)' }}
            />
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: '6px' }}>Budget (B)</label>
            <input
              type="number"
              value={params.B}
              onChange={e => setParams({ ...params, B: Number(e.target.value) })}
            />
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: '6px' }}>CVaR Cap (\u0393)</label>
            <input
              type="number"
              value={params.Gamma}
              onChange={e => setParams({ ...params, Gamma: Number(e.target.value) })}
            />
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: '6px' }}>Coordinate System</label>
            <input
              value={coordSystem}
              onChange={e => setCoordSystem(e.target.value)}
            />
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: '6px' }}>Currency</label>
            <input
              readOnly
              value="AUD"
              style={{ cursor: 'not-allowed', color: 'var(--text-secondary)' }}
            />
          </div>
        </div>
      </Card>

      <Card title="AI Configuration">
        <div style={{ maxWidth: 480 }}>
          <label className="label" style={{ display: 'block', marginBottom: 6 }}>Gemini API Key</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={geminiKey}
              onChange={e => { setGeminiKey(e.target.value); setKeySaved(false); }}
              placeholder="AIza..."
              style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveKey(); }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSaveKey}
              disabled={!geminiKey.trim()}
            >
              {keySaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Used for MIDAS AI and AI site data generation. Stored in localStorage only.
          </p>
        </div>
      </Card>

      <Card title="About">
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
          <div style={{ marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>MIDAS</strong> \u2014 Mission-Integrated Decision and Analysis System
          </div>
          <div>Mercury Engine: v1.1.0</div>
          <div>MIDAS UI: v2.0.0</div>
          <div>Build: 2026-03-12</div>
        </div>
      </Card>
    </div>
    </div>
  );
}
