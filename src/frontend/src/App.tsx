import { useState, useEffect } from 'react';
import { NavRail } from './components/NavRail';
import type { View } from './components/NavRail';
import { TopBar } from './components/TopBar';
import { Dashboard } from './views/Dashboard';
import { DataIngestion } from './views/DataIngestion';
import { Zones } from './views/Zones';
import { Interventions } from './views/Interventions';
import { Scenarios } from './views/Scenarios';
import { Sensitivity } from './views/Sensitivity';
import { Optimisation } from './views/Optimisation';
import { Scoring } from './views/Scoring';
import { Portfolio } from './views/Portfolio';
import { Explainability } from './views/Explainability';
import { Settings } from './views/Settings';
import { MidasAI } from './views/MidasAI';
import { GeminiAssistant } from './components/GeminiAssistant';
import { Onboarding } from './components/Onboarding';
import type { ProjectData } from './components/Onboarding';
import { runPipeline, DEFAULT_PARAMS } from './data/api';
import type { PipelineResponse, PipelineParams, DatasetIn } from './data/api';
import { SYNTHETIC_DATASET } from './data/synthetic';
import { getAllDocuments } from './data/documentStore';
import type { StoredDocument } from './data/documentStore';

type ApiStatus = 'idle' | 'loading' | 'success' | 'error';

const VIEW_TITLES: Record<View, string> = {
  dashboard: 'Dashboard',
  ingestion: 'Data Ingestion',
  zones: 'Zones',
  interventions: 'Interventions Library',
  scenarios: 'Scenarios',
  sensitivity: 'Sensitivity',
  optimisation: 'Optimisation',
  scoring: 'Scoring',
  portfolio: 'Portfolio',
  explainability: 'Explainability',
  'midas-ai': 'MIDAS AI',
  settings: 'Settings',
};

export default function App() {
  const [onboardingDone, setOnboardingDone] = useState(
    () => !!localStorage.getItem('midas_project')
  );

  const [view, setView] = useState<View>('dashboard');
  const [pipelineResult, setPipelineResult] = useState<PipelineResponse | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('idle');
  const [params, setParams] = useState<PipelineParams>(DEFAULT_PARAMS);
  const [projectName, setProjectName] = useState('Myrtle Farm');
  const [isDirty, setIsDirty] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [lastDataset, setLastDataset] = useState<DatasetIn | null>(null);
  const [assistantTrigger, setAssistantTrigger] = useState<string | null>(null);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);

  useEffect(() => {
    getAllDocuments().then(setDocuments).catch(() => {});
  }, []);

  const handleOnboardingComplete = (data: ProjectData) => {
    localStorage.setItem('midas_project', JSON.stringify({
      projectName: data.projectName,
      siteName: data.siteName,
    }));
    setProjectName(data.projectName);
    setParams({
      B: data.budget,
      Gamma: data.gamma,
      T: data.T,
      beta: data.beta,
      lambda_: data.lambda_,
      S: params.S,
    });
    if (data.pipelineResult) {
      setPipelineResult(data.pipelineResult);
      setApiStatus('success');
      setIsDirty(false);
    }
    setOnboardingDone(true);
  };

  if (!onboardingDone) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const handleRunPipeline = async (dataset?: DatasetIn) => {
    setApiStatus('loading');
    const resolved = dataset ?? SYNTHETIC_DATASET;
    setLastDataset(resolved);
    try {
      const result = await runPipeline(resolved, params);
      setPipelineResult(result);
      setApiStatus('success');
      setIsDirty(false);
    } catch {
      setApiStatus('error');
    }
  };

  const handleRecalculate = async () => {
    if (!pipelineResult) return;
    setIsRecalculating(true);
    setIsDirty(false);
    try {
      const result = await runPipeline(lastDataset ?? SYNTHETIC_DATASET, params);
      setPipelineResult(result);
      setApiStatus('success');
    } catch {
      setApiStatus('error');
    } finally {
      setIsRecalculating(false);
    }
  };

  const renderView = (v: View) => {
    switch (v) {
      case 'dashboard': return (
        <Dashboard
          pipelineResult={pipelineResult}
          projectName={projectName}
          onRunPipeline={handleRunPipeline}
          onNavigate={(v) => setView(v as View)}
          isDirty={isDirty}
          onRecalculate={handleRecalculate}
          onOpenAssistant={(msg) => { setAssistantTrigger(msg); setView('midas-ai'); }}
        />
      );
      case 'ingestion': return (
        <DataIngestion
          pipelineResult={pipelineResult}
          setPipelineResult={setPipelineResult}
          setApiStatus={setApiStatus}
          params={params}
          onRunPipeline={handleRunPipeline}
        />
      );
      case 'zones': return <Zones pipelineResult={pipelineResult} projectName={projectName} />;
      case 'interventions': return <Interventions pipelineResult={pipelineResult} onDirty={() => setIsDirty(true)} />;
      case 'scenarios': return (
        <Scenarios
          pipelineResult={pipelineResult}
          params={params}
          setParams={setParams}
          onRunPipeline={handleRunPipeline}
        />
      );
      case 'sensitivity': return (
        <Sensitivity
          pipelineResult={pipelineResult}
          params={params}
          onRunPipeline={handleRunPipeline}
        />
      );
      case 'optimisation': return (
        <Optimisation
          pipelineResult={pipelineResult}
          params={params}
          setParams={setParams}
          onRunPipeline={handleRunPipeline}
        />
      );
      case 'scoring': return <Scoring pipelineResult={pipelineResult} />;
      case 'portfolio': return <Portfolio pipelineResult={pipelineResult} />;
      case 'explainability': return <Explainability pipelineResult={pipelineResult} />;
      case 'midas-ai': return (
        <MidasAI
          pipelineResult={pipelineResult}
          triggerMessage={assistantTrigger}
          onTriggered={() => setAssistantTrigger(null)}
          documents={documents}
          params={params}
          onApplyParams={(changes) => { setParams(p => ({ ...p, ...changes })); setIsDirty(true); }}
        />
      );
      case 'settings': return (
        <Settings
          params={params}
          setParams={setParams}
          onRunPipeline={handleRunPipeline}
          pipelineResult={pipelineResult}
          projectName={projectName}
          setProjectName={setProjectName}
        />
      );
    }
  };

  const progressActive = isRecalculating || apiStatus === 'loading';

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-base)' }}>
      <div className={`progress-bar ${progressActive ? 'progress-bar--active' : 'progress-bar--idle'}`} />

      <NavRail active={view} onNavigate={setView} projectName={projectName} pipelineResult={pipelineResult} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar
          viewTitle={VIEW_TITLES[view]}
          apiStatus={apiStatus}
          onRunPipeline={handleRunPipeline}
          pipelineResult={pipelineResult}
          projectName={projectName}
          isDirty={isDirty}
          isRecalculating={isRecalculating}
          onRecalculate={handleRecalculate}
        />

        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
          {renderView(view)}
        </main>
      </div>

      <GeminiAssistant
        onNavigateMidasAI={(msg) => {
          if (msg) setAssistantTrigger(msg);
          setView('midas-ai');
        }}
      />
    </div>
  );
}
