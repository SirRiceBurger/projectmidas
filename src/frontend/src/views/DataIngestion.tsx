import { useState, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import { Card } from '../components/Card';
import { pipelineSources, SYNTHETIC_DATASET } from '../data/synthetic';
import type { PipelineResponse, DatasetIn, PipelineParams } from '../data/api';
import { getApiKey, callGemini } from '../data/gemini';
import { createIntervention } from '../data/api';
import type { InterventionCreateIn } from '../data/api';

const DATA_SYSTEM_PROMPT = `You are a data entry assistant for MIDAS, a sustainability planning platform for Australian properties.
Given a plain-English site description (and optionally a list of interventions), return a single valid JSON object with these keys:

"dataset": {
  "drone": { "canopy_cover": 0-1, "bare_soil_fraction": 0-1, "slope_degrees": number, "aspect_degrees": 0-360, "drainage_index": 0-1, "shade_fraction": 0-1, "uv_index": 0-1, "georef_confidence": 0-1, "coverage_fraction": 0-1 },
  "weather": { "mean_annual_rainfall_mm": number, "mean_annual_temp_c": number, "extreme_heat_days_per_year": number, "frost_days_per_year": number, "wind_speed_ms": number },
  "hazard": { "bushfire_risk": 0-1, "flood_risk": 0-1, "drought_risk": 0-1, "erosion_risk": 0-1 },
  "site": { "area_ha": number, "soil_depth_cm": number, "soil_type": string, "proximity_to_water_m": number, "land_use_current": string },
  "economic": { "land_value_aud_per_ha": number, "carbon_price_aud_per_tco2e": number, "discount_rate": 0-1, "labour_cost_index": 0-1 }
},
"interventions": [
  {
    "name": string,
    "description": string,
    "expected_emissions": number (tCO2e over 20yr horizon),
    "expected_cost": number (AUD upfront),
    "cvar_loss": number (AUD, 95th percentile loss),
    "maintenance_cost_annual": number (AUD/yr),
    "resilience_score": 0-1,
    "success_probability": 0-1,
    "feasibility_rules": [{ "field": one of canopy/bare_soil/slope/aspect/drainage/shade/uv/bushfire/flood/drought/proximity, "operator": one of >/</>=/<=/==, "threshold": number, "effect": "infeasible", "reason": string }]
  }
]

If no interventions are mentioned, return "interventions": [].
Use realistic Australian values. Respond ONLY with the JSON object. No markdown fences, no explanation.`;

type UploadStatus = 'idle' | 'loading' | 'success' | 'error';

interface Props {
  pipelineResult: PipelineResponse | null;
  setPipelineResult: (r: PipelineResponse) => void;
  setApiStatus: (s: 'idle' | 'loading' | 'success' | 'error') => void;
  params: PipelineParams;
  onRunPipeline: (dataset?: DatasetIn) => Promise<void>;
}

function readFileAsJson(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target?.result as string));
      } catch {
        reject(new Error(`Invalid JSON in ${file.name}`));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

const SOURCE_KEY_MAP: Record<string, keyof PipelineResponse['data_quality']> = {
  drone: 'drone',
  weather: 'weather',
  hazard: 'hazard',
  site: 'site',
  economic: 'economic',
};

export function DataIngestion({ pipelineResult, setPipelineResult, setApiStatus, onRunPipeline }: Props) {
  void setPipelineResult; // provided by parent for future use; not yet needed in this view
  void setApiStatus;
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [runAt, setRunAt] = useState<string | null>(null);
  const [aiDescription, setAiDescription] = useState('');
  const [aiDataset, setAiDataset] = useState<DatasetIn | null>(null);
  const [aiInterventions, setAiInterventions] = useState<InterventionCreateIn[]>([]);
  const [selectedInterventions, setSelectedInterventions] = useState<Set<number>>(new Set());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCreating, setAiCreating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const droneRef = useRef<HTMLInputElement>(null);
  const weatherRef = useRef<HTMLInputElement>(null);
  const hazardRef = useRef<HTMLInputElement>(null);
  const siteRef = useRef<HTMLInputElement>(null);
  const economicRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pipelineResult) setRunAt(new Date().toLocaleString());
  }, [pipelineResult]);

  async function handleAiGenerate() {
    const key = getApiKey();
    if (!key) {
      setAiError('No Gemini API key — enter it in the AI Assistant (bottom right ↗)');
      return;
    }
    if (!aiDescription.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiDataset(null);
    setAiInterventions([]);
    setSelectedInterventions(new Set());
    try {
      const raw = await callGemini(key, DATA_SYSTEM_PROMPT, [{ role: 'user', text: aiDescription }]);
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as { dataset: DatasetIn; interventions: InterventionCreateIn[] };
      setAiDataset(parsed.dataset);
      const ivs = parsed.interventions ?? [];
      setAiInterventions(ivs);
      setSelectedInterventions(new Set(ivs.map((_, i) => i)));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCreateInterventions() {
    if (aiInterventions.length === 0) return;
    setAiCreating(true);
    try {
      for (const [i, iv] of aiInterventions.entries()) {
        if (selectedInterventions.has(i)) {
          await createIntervention({ ...iv, enabled: true, use_cost_model: false });
        }
      }
      setAiInterventions([]);
      setSelectedInterventions(new Set());
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to create interventions');
    } finally {
      setAiCreating(false);
    }
  }

  const hasFiles = () => {
    return [droneRef, weatherRef, hazardRef, siteRef, economicRef].some(
      r => r.current?.files && r.current.files.length > 0
    );
  };

  const handleRun = async () => {
    setUploadStatus('loading');
    setUploadError(null);

    try {
      let dataset: DatasetIn | undefined;

      if (aiDataset && !hasFiles()) {
        dataset = aiDataset;
      } else if (hasFiles()) {
        const getOrDefault = async <K extends keyof DatasetIn>(
          ref: RefObject<HTMLInputElement | null>,
          key: K
        ): Promise<DatasetIn[K]> => {
          const files = ref.current?.files;
          if (files && files.length > 0) {
            return (await readFileAsJson(files[0])) as DatasetIn[K];
          }
          return SYNTHETIC_DATASET[key];
        };

        dataset = {
          drone: await getOrDefault(droneRef, 'drone'),
          weather: await getOrDefault(weatherRef, 'weather'),
          hazard: await getOrDefault(hazardRef, 'hazard'),
          site: await getOrDefault(siteRef, 'site'),
          economic: await getOrDefault(economicRef, 'economic'),
        };
      }

      await onRunPipeline(dataset);
      setUploadStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setUploadError(msg);
      setUploadStatus('error');
    }
  };

  const usingFiles = hasFiles();

  const overallCompleteness = pipelineResult
    ? (() => {
        const dq = pipelineResult.data_quality;
        const vals = [dq.drone.completeness, dq.weather.completeness, dq.hazard.completeness, dq.site.completeness, dq.economic.completeness];
        return (vals.reduce((a, b) => a + b, 0) / vals.length) * 100;
      })()
    : null;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div className="content-area">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 className="page-title">Data Ingestion</h1>
          <p className="page-subtitle">Assemble D = {'{'}D_drone, D_weather, D_hazard, D_site, D_economic{'}'}</p>
        </div>
        <span className="badge badge-green">5 / 5 sources loaded</span>
      </div>

      <Card style={{
        border: '1px solid rgba(99,102,241,0.25)',
        background: 'rgba(99,102,241,0.04)',
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ marginBottom: '4px' }}>Upload site data to run Mercury pipeline</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Upload JSON files for each data source, or click below to run with canonical synthetic data.
            Each file must be a flat JSON object with the fields listed below.
          </p>
          <details style={{ marginTop: '10px' }}>
            <summary style={{ fontSize: '11px', color: '#818cf8', cursor: 'pointer' }}>View required JSON schemas</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', marginTop: '10px' }}>
              {[
                { title: 'drone.json', fields: 'canopy_cover, bare_soil_fraction, slope_degrees, aspect_degrees, drainage_index, shade_fraction, uv_index, georef_confidence, coverage_fraction' },
                { title: 'weather.json', fields: 'mean_annual_rainfall_mm, mean_annual_temp_c, extreme_heat_days_per_year, frost_days_per_year, wind_speed_ms' },
                { title: 'hazard.json', fields: 'bushfire_risk, flood_risk, drought_risk, erosion_risk' },
                { title: 'site.json', fields: 'area_ha, soil_depth_cm, soil_type (string), proximity_to_water_m, land_use_current (string)' },
                { title: 'economic.json', fields: 'land_value_aud_per_ha, carbon_price_aud_per_tco2e, discount_rate, labour_cost_index' },
              ].map(s => (
                <div key={s.title} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8', marginBottom: '4px' }}>{s.title}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.fields}</div>
                </div>
              ))}
            </div>
          </details>
        </div>

        <div style={{
          background: 'rgba(99,102,241,0.05)',
          border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#818cf8' }}>✦ Generate site data with AI</span>
            {aiDataset && <span style={{ fontSize: '10px', color: 'var(--accent-green)' }}>✓ Dataset ready</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <textarea
              value={aiDescription}
              onChange={e => { setAiDescription(e.target.value); setAiDataset(null); }}
              placeholder="Describe your site and optionally list interventions — e.g. 40ha cleared farm near Ballarat, moderate rainfall, gentle slopes. Interventions: solar on shed, creek revegetation, wetland restoration."
              rows={2}
              style={{ flex: 1, resize: 'none', lineHeight: 1.5, fontSize: '12px' }}
            />
            <button
              onClick={handleAiGenerate}
              disabled={aiLoading || !aiDescription.trim()}
              className="btn btn-secondary btn-sm"
              style={{ color: '#818cf8', borderColor: 'rgba(99,102,241,0.3)', flexShrink: 0 }}
            >
              {aiLoading ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {aiError && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#f87171' }}>{aiError}</div>
          )}
          {aiDataset && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--accent-green)' }}>
              ✓ Site dataset ready — click "Run with AI-generated data" below.
            </div>
          )}
          {aiInterventions.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Interventions to create — uncheck any you don't want:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                {aiInterventions.map((iv, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '11px' }}>
                    <input
                      type="checkbox"
                      checked={selectedInterventions.has(i)}
                      onChange={() => setSelectedInterventions(prev => {
                        const next = new Set(prev);
                        if (next.has(i)) { next.delete(i); } else { next.add(i); }
                        return next;
                      })}
                      style={{ marginTop: '2px', flexShrink: 0 }}
                    />
                    <div>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{iv.name}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                        {iv.expected_emissions} tCO2e · AUD {iv.expected_cost?.toLocaleString()}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <button
                onClick={handleCreateInterventions}
                disabled={aiCreating || selectedInterventions.size === 0}
                className="btn btn-primary btn-sm"
              >
                {aiCreating ? 'Creating…' : `Create ${selectedInterventions.size} intervention${selectedInterventions.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>

        {/* Hidden file inputs — preserved for programmatic triggering */}
        {[
          { ref: droneRef, key: 'drone' },
          { ref: weatherRef, key: 'weather' },
          { ref: hazardRef, key: 'hazard' },
          { ref: siteRef, key: 'site' },
          { ref: economicRef, key: 'economic' },
        ].map(({ ref, key }) => (
          <input
            key={key}
            ref={ref}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={e => {
              setUploadStatus('idle');
              const files = e.target.files;
              if (files && files.length > 0) {
                setUploadedFiles(prev => {
                  const names = Array.from(files).map(f => f.name);
                  const merged = [...prev, ...names].filter((n, i, arr) => arr.indexOf(n) === i);
                  return merged;
                });
              }
            }}
          />
        ))}

        {/* Drop zone */}
        <div
          style={{
            border: isDragOver ? '2px dashed #f97316' : '2px dashed rgba(99,102,241,0.3)',
            borderRadius: 12,
            padding: '32px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragOver ? 'rgba(249,115,22,0.06)' : 'rgba(99,102,241,0.03)',
            transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
            transition: 'all 0.15s ease',
            marginBottom: '16px',
          }}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragEnter={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'));
            if (files.length > 0) {
              setUploadedFiles(prev => {
                const names = files.map(f => f.name);
                const merged = [...prev, ...names].filter((n, i, arr) => arr.indexOf(n) === i);
                return merged;
              });
              setUploadStatus('idle');
            }
          }}
        >
          {/* Upload icon */}
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: isDragOver ? 'rgba(249,115,22,0.12)' : 'rgba(99,102,241,0.1)',
            border: isDragOver ? '1px solid rgba(249,115,22,0.3)' : '1px solid rgba(99,102,241,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            fontSize: 18,
            color: isDragOver ? '#f97316' : 'rgba(99,102,241,0.6)',
          }}>
            &#8593;
          </div>

          <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {isDragOver ? 'Drop files or folders here' : 'Drop files here'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>or</div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => droneRef.current?.click()}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '6px 16px',
                fontSize: 12,
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              Browse Files
            </button>
            <button
              type="button"
              onClick={() => droneRef.current?.click()}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '6px 16px',
                fontSize: 12,
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              Browse Folders
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Accepts JSON files for drone, weather, hazard, site, economic data
          </div>
        </div>

        {/* Uploaded file pills */}
        {uploadedFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {uploadedFiles.map(name => (
              <span
                key={name}
                style={{
                  fontSize: 10,
                  background: 'rgba(99,102,241,0.1)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: 10,
                  padding: '2px 8px',
                  color: '#818cf8',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleRun}
            disabled={uploadStatus === 'loading'}
            className="btn btn-primary"
          >
            {uploadStatus === 'loading'
              ? 'Running pipeline\u2026'
              : usingFiles
              ? 'Run Mercury Pipeline'
              : aiDataset
              ? 'Run with AI-generated data'
              : 'Run with synthetic data'}
          </button>

          {!usingFiles && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              No files uploaded — will use canonical I1/I2/I3 synthetic dataset
            </span>
          )}
        </div>

        {uploadStatus === 'success' && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            background: 'rgba(62,207,142,0.08)',
            border: '1px solid rgba(62,207,142,0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            color: 'var(--accent-green)',
            fontWeight: '500',
          }}>
            Pipeline complete — navigate to Portfolio for results
          </div>
        )}

        {uploadStatus === 'error' && uploadError && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            background: 'var(--accent-red-dim)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            color: 'var(--accent-red)',
          }}>
            Error: {uploadError}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '12px' }}>
        {pipelineSources.map(source => {
          const dqKey = SOURCE_KEY_MAP[source.id];
          const live = pipelineResult?.data_quality[dqKey];
          const completeness = live ? live.completeness * 100 : source.completeness;
          const qualityFlag = live
            ? live.quality.charAt(0).toUpperCase() + live.quality.slice(1)
            : source.qualityFlag;
          const fieldsOrRecords = live ? `${live.fields} fields` : source.records.toLocaleString();
          const lastUpdated = live && runAt ? runAt : source.lastUpdated;
          const status = live ? 'Loaded' : source.status;

          return (
            <Card key={source.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ marginBottom: '4px' }}>{source.name}</h3>
                  <span className={`badge ${qualityFlag === 'High' ? 'badge-green' : 'badge-amber'}`}>
                    {qualityFlag} quality
                  </span>
                </div>
                <span className="badge badge-green">{status}</span>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Completeness</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: completeness >= 100 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                    {completeness.toFixed(0)}%
                  </span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(completeness, 100)}%`,
                    background: completeness >= 100
                      ? 'linear-gradient(90deg, var(--accent-green), #2da870)'
                      : 'linear-gradient(90deg, var(--accent-amber), #d97706)',
                    borderRadius: '3px',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {[
                  ['Records', fieldsOrRecords],
                  ['Last updated', lastUpdated],
                  ...(source.georeferencingConfidence !== null
                    ? [['Georef. confidence', `${(source.georeferencingConfidence * 100).toFixed(0)}%`]]
                    : []),
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{label}</span>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}>{val}</span>
                  </div>
                ))}
              </div>

              <div style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
                lineHeight: '1.5',
              }}>
                {source.notes}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>Dataset Validation Summary</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {pipelineResult
                ? `5/5 sources loaded — ${pipelineResult.zones.length} zones processed — pipeline complete`
                : '5/5 sources loaded — unified dataset assembled — pipeline ready'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: '22px', fontWeight: '700', color: 'var(--accent-green)', letterSpacing: '-0.02em' }}>
                {overallCompleteness !== null ? `${overallCompleteness.toFixed(1)}%` : '98.6%'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Overall completeness</div>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[
            {
              label: 'Total records',
              value: pipelineResult ? `${pipelineResult.zones.length} zones` : '236,132',
            },
            { label: 'Spatial CRS', value: 'GDA2020 / MGA55' },
            { label: 'Temporal span', value: '2006 – 2026' },
            {
              label: 'Pipeline run',
              value: runAt ?? '2026-03-12 08:41',
            },
          ].map(m => (
            <div key={m.label}>
              <div style={{ fontSize: '13px', fontWeight: '600' }}>{m.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {pipelineResult && (
        <Card>
          <div style={{ fontWeight: '600', marginBottom: '12px', fontSize: '13px' }}>Parameters Used</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
            {[
              ['B', `AUD ${pipelineResult.parameters_used.B.toLocaleString()}`],
              ['\u0393', `AUD ${pipelineResult.parameters_used.Gamma.toLocaleString()}`],
              ['\u03b2', pipelineResult.parameters_used.beta.toString()],
              ['\u03bb', pipelineResult.parameters_used.lambda_.toString()],
              ['S', pipelineResult.parameters_used.S.toLocaleString()],
              ['T', `${pipelineResult.parameters_used.T} years`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{k}</span>
                <span className="mono" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
    </div>
  );
}
