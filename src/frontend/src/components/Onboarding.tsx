import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { runPipeline } from '../data/api';
import type { DatasetIn, PipelineResponse } from '../data/api';
import { getApiKey, saveApiKey, callGemini } from '../data/gemini';
import { SYNTHETIC_DATASET } from '../data/synthetic';

export interface ProjectData {
  projectName: string;
  siteName: string;
  budget: number;
  gamma: number;
  T: number;
  beta: number;
  lambda_: number;
  dataset: DatasetIn | null;
  pipelineResult?: PipelineResponse;
}

interface OnboardingProps {
  onComplete: (projectData: ProjectData) => void;
}

const SCHEMA_SAMPLE = `{
  "drone": {
    "canopy_cover": 0.35,
    "bare_soil_fraction": 0.20,
    "slope_degrees": 8.0,
    "aspect_degrees": 180,
    "drainage_index": 0.60,
    "shade_fraction": 0.25,
    "uv_index": 6.5,
    "georef_confidence": 0.92,
    "coverage_fraction": 0.95
  },
  "weather": {
    "mean_annual_rainfall_mm": 650,
    "mean_annual_temp_c": 17.5,
    "extreme_heat_days_per_year": 12,
    "frost_days_per_year": 5,
    "wind_speed_ms": 4.2
  },
  "hazard": {
    "bushfire_risk": 0.40,
    "flood_risk": 0.20,
    "drought_risk": 0.35,
    "erosion_risk": 0.15
  },
  "site": {
    "area_ha": 25,
    "soil_depth_cm": 45,
    "soil_type": "clay_loam",
    "proximity_to_water_m": 120,
    "land_use_current": "grazing"
  },
  "economic": {
    "land_value_aud_per_ha": 8500,
    "carbon_price_aud_per_tco2e": 35,
    "discount_rate": 0.07,
    "labour_cost_index": 1.0
  }
}`;

const GEMINI_DATASET_PROMPT = `You are a site data generator for MIDAS, a sustainability planning platform for Australian properties.
Given a plain-English description, generate a JSON object with EXACTLY this structure (all numeric values must be realistic for Australian agricultural properties):
{
  "drone": { "canopy_cover": 0-1, "bare_soil_fraction": 0-1, "slope_degrees": float, "aspect_degrees": 0-360, "drainage_index": 0-1, "shade_fraction": 0-1, "uv_index": float, "georef_confidence": 0-1, "coverage_fraction": 0-1 },
  "weather": { "mean_annual_rainfall_mm": float, "mean_annual_temp_c": float, "extreme_heat_days_per_year": int, "frost_days_per_year": int, "wind_speed_ms": float },
  "hazard": { "bushfire_risk": 0-1, "flood_risk": 0-1, "drought_risk": 0-1, "erosion_risk": 0-1 },
  "site": { "area_ha": float, "soil_depth_cm": float, "soil_type": "string", "proximity_to_water_m": float, "land_use_current": "string" },
  "economic": { "land_value_aud_per_ha": float, "carbon_price_aud_per_tco2e": float, "discount_rate": 0-1, "labour_cost_index": float }
}
Respond ONLY with the JSON object. No markdown fences, no explanation.`;

const PIPELINE_STAGES = [
  'Ingestion',
  'Zoning',
  'Interventions',
  'Optimisation & Scoring',
];

const slideVariants = {
  enter: { x: 60, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -60, opacity: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: i <= current ? '#6366f1' : '#2a2a2a',
            transition: 'width 0.2s, background 0.2s',
          }}
        />
      ))}
      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Geist Mono, monospace' }}>
        Step {current + 1} of {total}
      </span>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [siteName, setSiteName] = useState('');
  const [budget, setBudget] = useState(350000);
  const [gamma, setGamma] = useState(70000);
  const [T, setT] = useState(20);
  const [beta, setBeta] = useState(0.5);
  const [lambdaVal, setLambdaVal] = useState(0.5);

  const [uploadedDataset, setUploadedDataset] = useState<DatasetIn | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [geminiKey, setGeminiKey] = useState(getApiKey() ?? '');
  const [siteDescription, setSiteDescription] = useState('');
  const [generatedJson, setGeneratedJson] = useState('');
  const [generatedDataset, setGeneratedDataset] = useState<DatasetIn | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [dataSource, setDataSource] = useState<'uploaded' | 'generated' | 'synthetic' | null>(null);

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(-1);
  const [pipelineError, setPipelineError] = useState('');
  const [pipelineResult, setPipelineResult] = useState<PipelineResponse | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const activeDataset = (): DatasetIn => {
    if (dataSource === 'uploaded' && uploadedDataset) return uploadedDataset;
    if (dataSource === 'generated' && generatedDataset) return generatedDataset;
    return SYNTHETIC_DATASET;
  };

  const canContinueStep2 = dataSource !== null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as DatasetIn;
        setUploadedDataset(parsed);
        setUploadedFilename(file.name);
        setDataSource('uploaded');
      } catch {
        alert('Invalid JSON file. Please check the format matches the schema.');
      }
    };
    reader.readAsText(file);
  };

  const handleGenerateAI = async () => {
    if (!geminiKey || !siteDescription) return;
    setAiLoading(true);
    setAiError('');
    if (geminiKey) saveApiKey(geminiKey);
    try {
      const raw = await callGemini(geminiKey, GEMINI_DATASET_PROMPT, [
        { role: 'user', text: siteDescription },
      ]);
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as DatasetIn;
      setGeneratedJson(JSON.stringify(parsed, null, 2));
      setGeneratedDataset(parsed);
      setDataSource('generated');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleEditGeneratedJson = (val: string) => {
    setGeneratedJson(val);
    try {
      const parsed = JSON.parse(val) as DatasetIn;
      setGeneratedDataset(parsed);
    } catch {
      // keep old parsed value until valid JSON
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([SCHEMA_SAMPLE], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'midas_dataset_template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLaunch = async () => {
    setPipelineRunning(true);
    setPipelineError('');
    setPipelineStage(0);

    const dataset = activeDataset();
    const params = { B: budget, Gamma: gamma, T, beta, lambda_: lambdaVal, S: 1000 };

    const stageDurations = [900, 950, 950, 1000];
    const totalMinDuration = stageDurations.reduce((a, b) => a + b, 0);
    let stageIdx = 0;

    const advanceStages = () => {
      if (stageIdx < PIPELINE_STAGES.length - 1) {
        stageIdx++;
        setPipelineStage(stageIdx);
        setTimeout(advanceStages, stageDurations[stageIdx]);
      }
    };
    setTimeout(advanceStages, stageDurations[0]);

    try {
      const [result] = await Promise.all([
        runPipeline(dataset, params),
        new Promise(resolve => setTimeout(resolve, totalMinDuration)),
      ]);
      setPipelineResult(result as PipelineResponse);
      setTimeout(() => {
        setLeaving(true);
        setTimeout(() => {
          onComplete({
            projectName: projectName || 'Myrtle Farm',
            siteName: siteName || 'South Paddock, QLD',
            budget,
            gamma,
            T,
            beta,
            lambda_: lambdaVal,
            dataset,
            pipelineResult: result,
          });
        }, 500);
      }, 800);
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Pipeline failed');
      setPipelineRunning(false);
      setPipelineStage(-1);
    }
  };

  if (leaving) {
    return (
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 9999 }}
      />
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#0a0a0a',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Persistent top-left logo for steps 1+ */}
      {step > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: 24,
            left: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 10,
          }}
        >
          <img src="/vite.png" alt="MIDAS" style={{ width: 28, height: 28, display: 'block' }} />
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.08em',
            fontFamily: "'Barlow Condensed', sans-serif",
            color: '#f5f5f3',
            textTransform: 'uppercase',
          }}>
            MIDAS
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {step === 0 && <WelcomeScreen key="welcome" onNext={() => setStep(1)} />}
        {step === 1 && (
          <SetupScreen
            key="setup"
            projectName={projectName} setProjectName={setProjectName}
            siteName={siteName} setSiteName={setSiteName}
            budget={budget} setBudget={setBudget}
            gamma={gamma} setGamma={setGamma}
            T={T} setT={setT}
            beta={beta} setBeta={setBeta}
            lambdaVal={lambdaVal} setLambdaVal={setLambdaVal}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <DataScreen
            key="data"
            uploadedFilename={uploadedFilename}
            fileRef={fileRef}
            onFileUpload={handleFileUpload}
            onDownloadTemplate={downloadTemplate}
            geminiKey={geminiKey} setGeminiKey={setGeminiKey}
            siteDescription={siteDescription} setSiteDescription={setSiteDescription}
            generatedJson={generatedJson} onEditGeneratedJson={handleEditGeneratedJson}
            aiLoading={aiLoading}
            aiError={aiError}
            onGenerateAI={handleGenerateAI}
            dataSource={dataSource}
            onSkip={() => { setDataSource('synthetic'); setStep(3); }}
            canContinue={canContinueStep2}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <LaunchScreen
            key="launch"
            projectName={projectName || 'Myrtle Farm'}
            siteName={siteName || 'South Paddock, QLD'}
            budget={budget}
            gamma={gamma}
            T={T}
            beta={beta}
            lambdaVal={lambdaVal}
            dataSource={dataSource ?? 'synthetic'}
            pipelineRunning={pipelineRunning}
            pipelineStage={pipelineStage}
            pipelineError={pipelineError}
            pipelineResult={pipelineResult}
            onLaunch={handleLaunch}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        padding: '0 10vw',
        position: 'relative',
      }}
    >
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0, width: '100%', maxWidth: 480 }}
      >
        <motion.div variants={fadeUp}>
          <img
            src="/vite.png"
            alt="MIDAS"
            style={{ width: 64, height: 64, display: 'block', marginBottom: 28 }}
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <div style={{
            fontSize: 88,
            fontWeight: 700,
            letterSpacing: '0.08em',
            fontFamily: "'Barlow Condensed', sans-serif",
            color: '#f0f0f5',
            textTransform: 'uppercase',
            lineHeight: 0.9,
            marginBottom: 20,
          }}>
            MIDAS
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 28 }}>
            Mission-Integrated Decarbonisation<br />Allocation System.
          </div>
        </motion.div>

        <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%' }}>
          <button className="ob-btn-primary" onClick={onNext} style={{ fontSize: 14, padding: '11px 28px' }}>
            New Project →
          </button>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontFamily: 'Geist Mono, monospace',
            color: 'var(--text-muted)',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
            Mercury v1.1
          </div>
        </motion.div>
      </motion.div>

      <div style={{
        position: 'absolute',
        bottom: 24,
        right: 32,
        fontSize: 11,
        color: 'var(--text-muted)',
        fontFamily: 'Geist Mono, monospace',
      }}>
        Open Source · github.com/SirRiceBurger/midas
      </div>
    </motion.div>
  );
}

interface SetupScreenProps {
  projectName: string; setProjectName: (v: string) => void;
  siteName: string; setSiteName: (v: string) => void;
  budget: number; setBudget: (v: number) => void;
  gamma: number; setGamma: (v: number) => void;
  T: number; setT: (v: number) => void;
  beta: number; setBeta: (v: number) => void;
  lambdaVal: number; setLambdaVal: (v: number) => void;
  onNext: () => void;
}

function SetupScreen(props: SetupScreenProps) {
  const { projectName, setProjectName, siteName, setSiteName, budget, setBudget,
    gamma, setGamma, T, setT, beta, setBeta, lambdaVal, setLambdaVal, onNext } = props;

  return (
    <motion.div
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{ width: '100%', maxWidth: 560, padding: '0 20px' }}
    >
      <StepDots current={0} total={3} />
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Project Setup</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 13 }}>
        Configure your project parameters. You can adjust these later in Settings.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Project Name">
            <input
              className="ob-input"
              placeholder="e.g. Myrtle Farm"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
            />
          </FormField>
          <FormField label="Site Name / Location">
            <input
              className="ob-input"
              placeholder="e.g. South Paddock, QLD"
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
            />
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Total Budget (AUD)">
            <input
              className="ob-input mono"
              type="number"
              placeholder="350000"
              value={budget}
              onChange={e => setBudget(Number(e.target.value))}
            />
          </FormField>
          <FormField label="CVaR Risk Cap Γ (AUD)">
            <input
              className="ob-input mono"
              type="number"
              placeholder="70000"
              value={gamma}
              onChange={e => setGamma(Number(e.target.value))}
            />
          </FormField>
        </div>

        <FormField label={<>Planning Horizon T — <span className="mono" style={{ color: '#6366f1', fontSize: 13 }}>{T} years</span></>}>
          <input
            type="range"
            min={5}
            max={30}
            step={1}
            value={T}
            onChange={e => setT(Number(e.target.value))}
            style={{ accentColor: '#6366f1', width: '100%', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            <span>5 yrs</span><span>30 yrs</span>
          </div>
        </FormField>

        <FormField label={<>Resilience Weighting β — <span className="mono" style={{ color: '#6366f1', fontSize: 13 }}>{beta.toFixed(2)}</span></>}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={beta}
            onChange={e => setBeta(Number(e.target.value))}
            style={{ accentColor: '#6366f1', width: '100%', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            <span>0</span><span>1</span>
          </div>
        </FormField>

        <FormField label="Risk Penalty λ">
          <input
            className="ob-input mono"
            type="number"
            step={0.05}
            min={0}
            max={5}
            placeholder="0.5"
            value={lambdaVal}
            onChange={e => setLambdaVal(Number(e.target.value))}
          />
        </FormField>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28 }}>
        <button className="ob-btn-primary" onClick={onNext}>
          Continue →
        </button>
      </div>
    </motion.div>
  );
}

interface DataScreenProps {
  uploadedFilename: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;
  geminiKey: string; setGeminiKey: (v: string) => void;
  siteDescription: string; setSiteDescription: (v: string) => void;
  generatedJson: string; onEditGeneratedJson: (v: string) => void;
  aiLoading: boolean;
  aiError: string;
  onGenerateAI: () => void;
  dataSource: 'uploaded' | 'generated' | 'synthetic' | null;
  onSkip: () => void;
  canContinue: boolean;
  onNext: () => void;
}

function DataScreen(props: DataScreenProps) {
  const {
    uploadedFilename, fileRef, onFileUpload, onDownloadTemplate,
    geminiKey, setGeminiKey, siteDescription, setSiteDescription,
    generatedJson, onEditGeneratedJson, aiLoading, aiError, onGenerateAI,
    dataSource, onSkip, canContinue, onNext,
  } = props;

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid #1e1e1e',
    borderRadius: 12,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    flex: 1,
  };

  return (
    <motion.div
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{ width: '100%', maxWidth: 780, padding: '0 20px' }}
    >
      <StepDots current={1} total={3} />
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Site Data</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 13 }}>
        Provide site data via JSON upload or generate it with AI from a plain-English description.
      </p>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Upload card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: 'rgba(99,102,241,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>
              ↑
            </div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Upload JSON</span>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Required schema:</div>
          <pre style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 10,
            background: '#0d0d0d',
            border: '1px solid #1a1a1a',
            borderRadius: 6,
            padding: '10px 12px',
            maxHeight: 200,
            overflow: 'auto',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {SCHEMA_SAMPLE}
          </pre>

          <button className="ob-btn-secondary" onClick={onDownloadTemplate} style={{ fontSize: 12 }}>
            Download schema template
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={onFileUpload}
          />

          {uploadedFilename ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(62,207,142,0.08)', border: '1px solid rgba(62,207,142,0.2)', borderRadius: 8 }}>
              <span style={{ color: 'var(--accent-green)', fontSize: 14 }}>✓</span>
              <span style={{ fontSize: 12, color: 'var(--accent-green)', fontFamily: 'Geist Mono, monospace' }}>{uploadedFilename}</span>
            </div>
          ) : (
            <button
              className="ob-btn-secondary"
              onClick={() => fileRef.current?.click()}
              style={{ fontSize: 12, borderStyle: 'dashed' }}
            >
              Choose file…
            </button>
          )}
        </div>

        {/* AI generation card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: 'rgba(99,102,241,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>
              ✦
            </div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Generate with AI</span>
          </div>

          <FormField label="Gemini API Key">
            <input
              className="ob-input"
              type="password"
              placeholder="AIza..."
              value={geminiKey}
              onChange={e => setGeminiKey(e.target.value)}
            />
          </FormField>

          <FormField label="Describe your site">
            <textarea
              className="ob-input"
              rows={4}
              placeholder="e.g. 45 hectare cattle property in southern Queensland, clay loam soils, 8 degree average slope, 650mm rainfall..."
              value={siteDescription}
              onChange={e => setSiteDescription(e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'Geist, sans-serif' }}
            />
          </FormField>

          <button
            className="ob-btn-primary"
            onClick={onGenerateAI}
            disabled={!geminiKey || !siteDescription || aiLoading}
            style={{ fontSize: 13 }}
          >
            {aiLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spinner /> Generating...
              </span>
            ) : 'Generate dataset →'}
          </button>

          {aiError && (
            <div style={{ fontSize: 12, color: 'var(--accent-red)', padding: '8px 12px', background: 'var(--accent-red-dim)', borderRadius: 6 }}>
              {aiError}
            </div>
          )}

          {generatedJson && !aiError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>✓</span> Generated — review and edit below
              </div>
              <textarea
                className="ob-input mono"
                value={generatedJson}
                onChange={e => onEditGeneratedJson(e.target.value)}
                rows={6}
                style={{ maxHeight: 200, resize: 'vertical', fontSize: 10, lineHeight: 1.5 }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
        <button
          onClick={onSkip}
          style={{
            background: 'none',
            border: 'none',
            color: dataSource === 'synthetic' ? '#6366f1' : 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'Geist, sans-serif',
          }}
        >
          {dataSource === 'synthetic' ? '✓ Using synthetic data' : 'Skip — use synthetic data →'}
        </button>
        <button
          className="ob-btn-primary"
          onClick={onNext}
          disabled={!canContinue}
        >
          Continue →
        </button>
      </div>
    </motion.div>
  );
}

interface LaunchScreenProps {
  projectName: string;
  siteName: string;
  budget: number;
  gamma: number;
  T: number;
  beta: number;
  lambdaVal: number;
  dataSource: 'uploaded' | 'generated' | 'synthetic';
  pipelineRunning: boolean;
  pipelineStage: number;
  pipelineError: string;
  pipelineResult: PipelineResponse | null;
  onLaunch: () => void;
}

function LaunchScreen(props: LaunchScreenProps) {
  const {
    projectName, siteName, budget, gamma, T, beta, lambdaVal, dataSource,
    pipelineRunning, pipelineStage, pipelineError, pipelineResult, onLaunch,
  } = props;

  const dataSourceLabel = { uploaded: 'Uploaded JSON', generated: 'AI-generated', synthetic: 'Synthetic (built-in)' }[dataSource];

  const fmt = (n: number) => n.toLocaleString('en-AU');

  return (
    <motion.div
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{ width: '100%', maxWidth: 500, padding: '0 20px' }}
    >
      <StepDots current={2} total={3} />
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Ready to launch</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 13 }}>
        Review your configuration, then run the Mercury pipeline.
      </p>

      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #1e1e1e',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}>
        <SummaryRow label="Project" value={`${projectName} / ${siteName}`} />
        <SummaryRow label="Budget" value={`AUD ${fmt(budget)}`} mono />
        <SummaryRow label="CVaR Cap Γ" value={`AUD ${fmt(gamma)}`} mono />
        <SummaryRow label="Horizon" value={`${T} years`} mono />
        <SummaryRow label="β" value={beta.toFixed(2)} mono />
        <SummaryRow label="λ" value={lambdaVal.toFixed(2)} mono last />
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Data Source</span>
          <span style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>{dataSourceLabel}</span>
        </div>
      </div>

      {!pipelineRunning && !pipelineResult && (
        <button
          className="ob-btn-primary"
          onClick={onLaunch}
          style={{ width: '100%', fontSize: 15, padding: '14px', borderRadius: 10 }}
        >
          Run Mercury Pipeline →
        </button>
      )}

      {pipelineRunning && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid #1e1e1e',
          borderRadius: 12,
          padding: 20,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner /> Running Mercury pipeline...
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PIPELINE_STAGES.map((stage, i) => (
              <PipelineStageRow key={i} label={stage} state={
                i < pipelineStage ? 'done' : i === pipelineStage ? 'running' : 'pending'
              } />
            ))}
          </div>
        </div>
      )}

      {pipelineError && (
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: '12px 16px', background: 'var(--accent-red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--accent-red)', marginBottom: 12 }}>
            {pipelineError}
          </div>
          <button className="ob-btn-secondary" onClick={onLaunch} style={{ width: '100%' }}>
            Retry
          </button>
        </div>
      )}
    </motion.div>
  );
}

function SummaryRow({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: last ? 0 : 10,
      marginBottom: last ? 0 : 10,
      borderBottom: last ? 'none' : '1px solid #1a1a1a',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{
        fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: mono ? 'Geist Mono, monospace' : 'Geist, sans-serif',
        fontWeight: mono ? 500 : 600,
      }}>{value}</span>
    </div>
  );
}

function PipelineStageRow({ label, state }: { label: string; state: 'pending' | 'running' | 'done' }) {
  return (
    <motion.div
      initial={{ opacity: 0.4 }}
      animate={{ opacity: state === 'pending' ? 0.4 : 1 }}
      style={{ display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <div style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        border: `2px solid ${state === 'done' ? '#3ecf8e' : state === 'running' ? '#6366f1' : '#2a2a2a'}`,
        background: state === 'done' ? 'rgba(62,207,142,0.12)' : state === 'running' ? 'rgba(99,102,241,0.12)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        flexShrink: 0,
        transition: 'all 0.3s',
      }}>
        {state === 'done' ? <span style={{ color: '#3ecf8e' }}>✓</span>
          : state === 'running' ? <Spinner size={10} />
          : null}
      </div>
      <span style={{
        fontSize: 13,
        color: state === 'done' ? 'var(--text-primary)' : state === 'running' ? '#a5b4fc' : 'var(--text-muted)',
        fontWeight: state === 'running' ? 600 : 400,
        transition: 'color 0.3s',
      }}>{label}</span>
    </motion.div>
  );
}

function Spinner({ size = 12 }: { size?: number }) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
      style={{
        width: size,
        height: size,
        border: `${Math.max(1.5, size / 6)}px solid rgba(255,255,255,0.15)`,
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        flexShrink: 0,
      }}
    />
  );
}
