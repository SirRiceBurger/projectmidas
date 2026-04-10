import { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { interventions as syntheticInterventions } from '../data/synthetic';
import type { PipelineResponse, InterventionRecord, InterventionCreateIn, FeasibilityRuleIn } from '../data/api';
import {
  fetchInterventions,
  createIntervention,
  updateIntervention,
  deleteIntervention,
} from '../data/api';
import { getApiKey, estimateIntervention } from '../data/gemini';

interface Props {
  pipelineResult?: PipelineResponse | null;
  onDirty?: () => void;
}

const FIELD_OPTIONS = [
  'canopy', 'bare_soil', 'slope', 'aspect', 'drainage',
  'shade', 'uv', 'bushfire', 'flood', 'drought', 'proximity',
];

const OPERATOR_OPTIONS: FeasibilityRuleIn['operator'][] = ['>', '<', '>=', '<=', '=='];

const BLANK_RULE: FeasibilityRuleIn = {
  field: 'slope',
  operator: '>',
  threshold: 0,
  effect: 'infeasible',
  reason: '',
};

const BLANK_FORM: InterventionCreateIn = {
  name: '',
  description: '',
  expected_emissions: 0,
  success_probability: 0.8,
  expected_cost: 0,
  cvar_loss: 0,
  maintenance_cost_annual: 0,
  resilience_score: 0.5,
  use_cost_model: false,
  feasibility_rules: [],
  enabled: true,
};

function buildSyntheticRecords(): InterventionRecord[] {
  return syntheticInterventions.map(inv => ({
    id: inv.id,
    name: inv.name,
    description: inv.description,
    expected_emissions: inv.expectedEmissions,
    success_probability: inv.successProbability,
    expected_cost: inv.cost,
    cvar_loss: inv.cvar,
    maintenance_cost_annual: inv.maintenance,
    resilience_score: inv.resilience,
    use_cost_model: false,
    feasibility_rules: inv.id === 'I1'
      ? [{ field: 'bushfire', operator: '>', threshold: 0.45, effect: 'infeasible', reason: 'High bushfire-edge risk — planting excluded' }]
      : inv.id === 'I3'
      ? [{ field: 'slope', operator: '>', threshold: 12, effect: 'infeasible', reason: 'Slope renders swale network ineffective' },
         { field: 'drainage', operator: '<', threshold: 0.3, effect: 'infeasible', reason: 'Inadequate drainage index' }]
      : [{ field: 'shade', operator: '>', threshold: 0.6, effect: 'infeasible', reason: 'Excessive shading reduces PV yield' }],
    enabled: true,
    is_builtin: true,
    created_at: '2026-03-01T00:00:00Z',
  }));
}

function computeRace(rec: InterventionRecord): number {
  const denom = rec.expected_cost + 0.5 * rec.cvar_loss;
  if (denom === 0) return 0;
  return (rec.expected_emissions * rec.success_probability) / denom;
}

function formatSci(n: number): string {
  return n.toExponential(2);
}

interface FormPanelProps {
  editing: InterventionRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

function FormPanel({ editing, onClose, onSaved }: FormPanelProps) {
  const [form, setForm] = useState<InterventionCreateIn>(
    editing
      ? {
          name: editing.name,
          description: editing.description,
          expected_emissions: editing.expected_emissions,
          success_probability: editing.success_probability,
          expected_cost: editing.expected_cost,
          cvar_loss: editing.cvar_loss,
          maintenance_cost_annual: editing.maintenance_cost_annual,
          resilience_score: editing.resilience_score,
          use_cost_model: editing.use_cost_model,
          feasibility_rules: editing.feasibility_rules.map(r => ({ ...r })),
          enabled: editing.enabled,
        }
      : { ...BLANK_FORM, feasibility_rules: [] }
  );
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  async function handleAiEstimate() {
    const key = getApiKey();
    if (!key) {
      setEstimateError('No Gemini API key set — enter it in the AI Assistant (bottom right ↗)');
      return;
    }
    if (!form.name.trim()) {
      setEstimateError('Enter a name or description first so the AI has context.');
      return;
    }
    setEstimating(true);
    setEstimateError(null);
    try {
      const est = await estimateIntervention(key, `${form.name}. ${form.description}`);
      setForm(prev => ({
        ...prev,
        expected_emissions: est.expected_emissions,
        expected_cost: est.expected_cost,
        cvar_loss: est.cvar_loss,
        maintenance_cost_annual: est.maintenance_cost_annual,
        resilience_score: est.resilience_score,
        success_probability: est.success_probability,
        feasibility_rules: est.feasibility_rules.length > 0 ? (est.feasibility_rules as FeasibilityRuleIn[]) : prev.feasibility_rules,
      }));
    } catch (e) {
      setEstimateError(e instanceof Error ? e.message : 'Estimation failed');
    } finally {
      setEstimating(false);
    }
  }

  function setField<K extends keyof InterventionCreateIn>(key: K, value: InterventionCreateIn[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function updateRule(index: number, patch: Partial<FeasibilityRuleIn>) {
    setForm(prev => {
      const rules = prev.feasibility_rules.map((r, i) => i === index ? { ...r, ...patch } : r);
      return { ...prev, feasibility_rules: rules };
    });
  }

  function addRule() {
    setForm(prev => ({ ...prev, feasibility_rules: [...prev.feasibility_rules, { ...BLANK_RULE }] }));
  }

  function removeRule(index: number) {
    setForm(prev => ({ ...prev, feasibility_rules: prev.feasibility_rules.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setApiError('Name is required.');
      return;
    }
    setSaving(true);
    setApiError(null);
    try {
      if (editing) {
        await updateIntervention(editing.id, form);
      } else {
        await createIntervention(form);
      }
      onSaved();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {};

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    display: 'block',
  };

  const fieldWrap: React.CSSProperties = { marginBottom: '12px' };

  const dimmed = form.use_cost_model ? 0.4 : 1;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99,
        }}
      />
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        height: '100vh',
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderRight: 'none',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '15px', marginBottom: '2px' }}>
            {editing ? 'Edit Intervention' : 'New Intervention'}
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {editing ? `Editing: ${editing.id}` : 'Define a custom intervention'}
          </p>
        </div>

        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          {apiError && (
            <div style={{
              marginBottom: '12px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              fontSize: '12px',
              color: 'var(--accent-red)',
            }}>
              {apiError}
            </div>
          )}

          <div style={fieldWrap}>
            <label style={labelStyle}>Name *</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="e.g. Biochar Application"
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: '64px', resize: 'vertical' }}
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Brief description of the intervention"
            />
          </div>

          <div style={{ ...fieldWrap, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="use_cost_model"
              checked={form.use_cost_model}
              onChange={e => setField('use_cost_model', e.target.checked)}
            />
            <label htmlFor="use_cost_model" style={{ fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Use live cost model
            </label>
          </div>
          {form.use_cost_model && (
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px', marginTop: '-6px' }}>
              Values computed from site data on pipeline run
            </p>
          )}

          <div style={{ opacity: dimmed, pointerEvents: form.use_cost_model ? 'none' : 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Metrics</span>
              <button
                type="button"
                onClick={handleAiEstimate}
                disabled={estimating}
                className="btn btn-secondary btn-sm"
                style={{ color: '#818cf8', borderColor: 'rgba(99,102,241,0.25)' }}
              >
                {estimating ? 'Estimating…' : '✦ Estimate with AI'}
              </button>
            </div>
            {estimateError && (
              <div style={{
                marginBottom: '8px', padding: '7px 10px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-sm)', fontSize: '11px', color: '#f87171',
              }}>
                {estimateError}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Expected Emissions (tCO2e) *</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.expected_emissions}
                  onChange={e => setField('expected_emissions', Number(e.target.value))}
                />
              </div>
              <div>
                <label style={labelStyle}>Success Probability *</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.success_probability}
                  min={0} max={1} step={0.01}
                  onChange={e => setField('success_probability', Number(e.target.value))}
                />
              </div>
              <div>
                <label style={labelStyle}>Expected Cost (AUD) *</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.expected_cost}
                  onChange={e => setField('expected_cost', Number(e.target.value))}
                />
              </div>
              <div>
                <label style={labelStyle}>CVaR Estimate (AUD) *</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.cvar_loss}
                  onChange={e => setField('cvar_loss', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Annual Maintenance (AUD)</label>
              <input
                type="number"
                style={inputStyle}
                value={form.maintenance_cost_annual}
                onChange={e => setField('maintenance_cost_annual', Number(e.target.value))}
              />
            </div>
            <div>
              <label style={labelStyle}>Resilience Score (0-1)</label>
              <input
                type="number"
                style={inputStyle}
                value={form.resilience_score}
                min={0} max={1} step={0.01}
                onChange={e => setField('resilience_score', Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ ...fieldWrap, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="enabled"
              checked={form.enabled}
              onChange={e => setField('enabled', e.target.checked)}
            />
            <label htmlFor="enabled" style={{ fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Enabled
            </label>
          </div>

          <div className="divider" style={{ margin: '16px 0 12px' }} />

          <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="label">Feasibility Rules</div>
            <button
              className="btn"
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={addRule}
            >
              + Add Rule
            </button>
          </div>

          {form.feasibility_rules.length === 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              No rules defined. Intervention is feasible in all zones.
            </p>
          )}

          {form.feasibility_rules.map((rule, i) => (
            <div key={i} style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px',
              marginBottom: '8px',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                <select
                  style={inputStyle}
                  value={rule.field}
                  onChange={e => updateRule(i, { field: e.target.value })}
                >
                  {FIELD_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select
                  style={inputStyle}
                  value={rule.operator}
                  onChange={e => updateRule(i, { operator: e.target.value as FeasibilityRuleIn['operator'] })}
                >
                  {OPERATOR_OPTIONS.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
                <input
                  type="number"
                  style={inputStyle}
                  value={rule.threshold}
                  step={0.01}
                  onChange={e => updateRule(i, { threshold: Number(e.target.value) })}
                />
                <button
                  onClick={() => removeRule(i)}
                  className="btn btn-danger btn-sm"
                  style={{ lineHeight: 1 }}
                >
                  x
                </button>
              </div>
              <input
                style={inputStyle}
                value={rule.reason}
                onChange={e => updateRule(i, { reason: e.target.value })}
                placeholder="e.g. Too steep for swale construction"
              />
            </div>
          ))}
        </div>

        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: '8px',
        }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

export function Interventions({ pipelineResult, onDirty }: Props) {
  const [apiInterventions, setApiInterventions] = useState<InterventionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InterventionRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchInterventions()
      .then(setApiInterventions)
      .catch(() => {
        setApiInterventions(buildSyntheticRecords());
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const interventions = apiInterventions.length > 0 ? apiInterventions : buildSyntheticRecords();

  const enabledCount = interventions.filter(i => i.enabled).length;

  async function handleToggle(rec: InterventionRecord) {
    try {
      const updated = await updateIntervention(rec.id, { enabled: !rec.enabled });
      setApiInterventions(prev => prev.map(r => r.id === updated.id ? updated : r));
      onDirty?.();
    } catch {
      load();
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteIntervention(id);
      setApiInterventions(prev => prev.filter(r => r.id !== id));
      onDirty?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteConfirm(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(rec: InterventionRecord) {
    setEditing(rec);
    setFormOpen(true);
  }

  function handleFormSaved() {
    setFormOpen(false);
    setEditing(null);
    load();
    onDirty?.();
  }

  function handleFormClose() {
    setFormOpen(false);
    setEditing(null);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div className="content-area">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 className="page-title">Interventions Library</h1>
          <p className="page-subtitle">Intervention catalog with feasibility mapping and cost models</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {enabledCount} enabled / {interventions.length} total
            </span>
          </div>
          {error && (
            <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '4px' }}>{error}</p>
          )}
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Intervention
        </button>
      </div>

      {loading && (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading interventions...</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '12px' }}>
        {interventions.map(rec => {
          const scored = pipelineResult?.scored?.find(s => s.intervention_id === rec.id);
          const race = scored ? scored.race : computeRace(rec);
          const mercuryScore = scored?.mercury_score ?? null;

          const isInPortfolio = pipelineResult
            ? pipelineResult.portfolio.intervention_ids.includes(rec.id)
            : null;

          const exclusion = pipelineResult && !isInPortfolio
            ? pipelineResult.exclusion_reasons.find(r => r.intervention_id === rec.id)
            : null;

          const visibleRules = rec.feasibility_rules.slice(0, 3);
          const extraRules = rec.feasibility_rules.length - visibleRules.length;

          const isConfirmDelete = deleteConfirm === rec.id;

          return (
            <Card key={rec.id} style={{
              border: `1px solid ${rec.enabled ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
              background: rec.enabled ? 'rgba(34,197,94,0.02)' : 'var(--bg-surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                      {rec.name}
                    </h2>
                    <span className={rec.is_builtin ? 'badge' : 'badge badge-green'}>
                      {rec.is_builtin ? 'Builtin' : 'Custom'}
                    </span>
                    {isInPortfolio === true && (
                      <span className="badge badge-green">Selected</span>
                    )}
                    {isInPortfolio === false && rec.enabled && (
                      <span className="badge" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>Not selected</span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rec.description || 'No description.'}
                  </p>
                </div>
                <button
                  className={`toggle ${rec.enabled ? 'on' : 'off'}`}
                  style={{ marginLeft: '10px', flexShrink: 0 }}
                  onClick={() => handleToggle(rec)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                {[
                  { label: 'E[E]', value: `${rec.expected_emissions} tCO2e`, color: 'var(--accent-green)' },
                  { label: 'p', value: rec.success_probability.toFixed(2), color: 'var(--text-primary)' },
                  { label: 'Cost', value: `AUD ${(rec.expected_cost / 1000).toFixed(0)}k`, color: 'var(--text-primary)' },
                  { label: 'CVaR', value: `AUD ${(rec.cvar_loss / 1000).toFixed(0)}k`, color: rec.cvar_loss > 60000 ? 'var(--accent-red)' : 'var(--accent-amber)' },
                  { label: 'Resilience', value: rec.resilience_score.toFixed(2), color: 'var(--accent-green)' },
                  { label: 'RACE', value: formatSci(race), color: 'var(--accent)' },
                  { label: 'MercuryScore', value: mercuryScore !== null ? mercuryScore.toFixed(3) : '—', color: 'var(--accent-purple)' },
                ].map(m => (
                  <div key={m.label} style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '7px 9px',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>{m.label}</div>
                    <div className="mono" style={{ fontSize: '13px', fontWeight: '600', color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {rec.feasibility_rules.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div className="label" style={{ marginBottom: '5px' }}>Feasibility Rules</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {visibleRules.map((rule, i) => (
                      <div key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                        <span style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>
                          {rule.field} {rule.operator} {rule.threshold}
                        </span>
                        <span>-&gt; infeasible</span>
                        {rule.reason && <span style={{ color: 'var(--text-muted)' }}>({rule.reason})</span>}
                      </div>
                    ))}
                    {extraRules > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>+{extraRules} more</div>
                    )}
                  </div>
                </div>
              )}

              {exclusion && (
                <div style={{
                  marginBottom: '12px',
                  padding: '8px 10px',
                  background: 'rgba(245,158,11,0.07)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--accent-amber)', marginBottom: '2px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Excluded
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {exclusion.detail}
                  </div>
                </div>
              )}

              <div className="divider" style={{ margin: '10px 0' }} />

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => openEdit(rec)}
                >
                  Edit
                </button>

                {isConfirmDelete ? (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Confirm?</span>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(rec.id)}
                    >
                      Delete
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDeleteConfirm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeleteConfirm(rec.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {formOpen && (
        <FormPanel
          editing={editing}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}
    </div>
    </div>
  );
}
