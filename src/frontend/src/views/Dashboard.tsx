import { useState, useEffect } from 'react';
import type { PipelineResponse } from '../data/api';
import { DocumentLibrary } from '../components/DocumentLibrary';
import { getAllDocuments, type StoredDocument } from '../data/documentStore';
import { SiteMap } from '../components/SiteMap';

interface Props {
  pipelineResult: PipelineResponse | null;
  projectName: string;
  onRunPipeline: () => void;
  onNavigate: (view: string) => void;
  isDirty: boolean;
  onRecalculate: () => void;
  onOpenAssistant?: (msg: string) => void;
}

const SYNTHETIC_FALLBACK = [
  { id: 'I1', name: 'Revegetation Belt', race: 7.03e-4, zone: 'A', inPortfolio: true, excluded: false },
  { id: 'I2', name: 'Rooftop Solar Retrofit', race: 7.20e-4, zone: 'A', inPortfolio: true, excluded: false },
  { id: 'I3', name: 'Water Retention & Soil Restoration', race: 5.57e-4, zone: 'A', inPortfolio: false, excluded: false },
];

function StatusBadge({ inPortfolio, excluded }: { inPortfolio: boolean; excluded: boolean }) {
  if (inPortfolio) {
    return (
      <span style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 4,
        background: 'rgba(34,197,94,0.12)',
        color: '#22c55e',
        border: '1px solid rgba(34,197,94,0.25)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
        In Portfolio
      </span>
    );
  }
  if (excluded) {
    return (
      <span style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 4,
        background: 'rgba(239,68,68,0.12)',
        color: '#ef4444',
        border: '1px solid rgba(239,68,68,0.25)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
        Excluded
      </span>
    );
  }
  return (
    <span style={{
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 4,
      background: 'rgba(99,102,241,0.12)',
      color: '#818cf8',
      border: '1px solid rgba(99,102,241,0.25)',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      Feasible
    </span>
  );
}

export function Dashboard({ pipelineResult, projectName, onRunPipeline, onNavigate, isDirty, onRecalculate, onOpenAssistant }: Props) {
  const [activeTab, setActiveTab] = useState<'files' | 'interventions' | 'timeline'>('files');
  const [aiInput, setAiInput] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  void documents; // fetched for side-effect caching; consumed indirectly

  useEffect(() => {
    getAllDocuments().then(setDocuments);
  }, []);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(prev =>
      prev.size === visibleRows.length
        ? new Set()
        : new Set(visibleRows.map(r => r.id))
    );
  }

  function askAboutSelected() {
    const names = interventionRows
      .filter(r => selected.has(r.id))
      .map(r => r.name)
      .join(', ');
    onOpenAssistant?.(`Tell me about these interventions: ${names}`);
    setSelected(new Set());
  }

  function handleAiSubmit() {
    const msg = aiInput.trim();
    if (!msg) return;
    setAiInput('');
    onOpenAssistant?.(msg);
  }

  const totalArea = pipelineResult
    ? pipelineResult.zones.reduce((s, z) => s + z.area_ha, 0)
    : 25;

  const lastRunLabel = 'just now';

  const exportReport = () => window.print();

  const interventionRows = (() => {
    if (!pipelineResult) return SYNTHETIC_FALLBACK;

    const portfolioIds = new Set(pipelineResult.portfolio.intervention_ids);
    const excludedFeasibility = new Set(
      pipelineResult.exclusion_reasons
        .filter(r => r.reason_code === 'feasibility')
        .map(r => r.intervention_id)
    );

    return pipelineResult.interventions_detail.map(iv => {
      const scored = pipelineResult.scored.find(s => s.intervention_id === iv.id);
      const zone = pipelineResult.feasibility.find(f => f.feasible_intervention_ids.includes(iv.id));
      return {
        id: iv.id,
        name: iv.name,
        race: scored?.race ?? 0,
        zone: zone?.zone_id ?? '—',
        inPortfolio: portfolioIds.has(iv.id),
        excluded: excludedFeasibility.has(iv.id),
      };
    });
  })();

  const visibleRows = searchQuery.trim()
    ? interventionRows.filter(iv => iv.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : interventionRows;

  const maxRace = visibleRows.length > 0
    ? Math.max(...visibleRows.map(r => r.race), 1e-10)
    : 1e-10;

  // Shared pill button style
  const pillStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: '6px 16px',
    fontSize: 13,
    background: '#1a1a1a',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'background 0.15s',
  };

  // Toolbar ghost button style
  const ghostBtnStyle: React.CSSProperties = {
    height: 30,
    padding: '0 10px',
    fontSize: 13,
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    borderRadius: 6,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    transition: 'background 0.15s',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div className="content-area">

        {/* 1. Page header */}
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">{projectName ?? 'My Project'}</h1>
          <p className="page-subtitle">
            {pipelineResult
              ? `${pipelineResult.zones.length} zones · ${totalArea.toFixed(1)} ha · Last run ${lastRunLabel}`
              : 'No pipeline run yet'}
          </p>
        </div>

        {/* 2. Full-width AI chat bar */}
        <div
          className="ai-bar"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 18, opacity: 0.45, flexShrink: 0 }}>✦</span>
          <input
            style={{ flex: 1, minWidth: 0 }}
            placeholder="Ask MIDAS anything..."
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAiSubmit(); }}
          />
          <button
            className="btn btn-primary btn-sm"
            style={{ padding: '6px 14px', fontSize: 13, flexShrink: 0 }}
            onClick={handleAiSubmit}
            disabled={!aiInput.trim()}
          >
            ↑
          </button>
        </div>

        {/* 3. Pill action buttons row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          <button
            style={pillStyle}
            onClick={onRunPipeline}
            onMouseEnter={e => (e.currentTarget.style.background = '#222')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1a1a1a')}
          >
            <span style={{ color: '#4ade80', fontSize: 11 }}>▶</span>
            Run Mercury Pipeline
          </button>
          <button
            style={pillStyle}
            onClick={() => onNavigate('scenarios')}
            onMouseEnter={e => (e.currentTarget.style.background = '#222')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1a1a1a')}
          >
            <span>◈</span> View Scenarios
          </button>
          <button
            style={pillStyle}
            onClick={exportReport}
            onMouseEnter={e => (e.currentTarget.style.background = '#222')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1a1a1a')}
          >
            <span>↗</span> Export Report
          </button>
          <button
            style={{
              ...pillStyle,
              opacity: !pipelineResult ? 0.45 : 1,
              cursor: !pipelineResult ? 'not-allowed' : 'pointer',
            }}
            onClick={onRecalculate}
            disabled={!pipelineResult}
            onMouseEnter={e => { if (pipelineResult) e.currentTarget.style.background = '#222'; }}
            onMouseLeave={e => (e.currentTarget.style.background = '#1a1a1a')}
          >
            {isDirty && (
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#eab308',
                display: 'inline-block',
                flexShrink: 0,
              }} />
            )}
            <span>↺</span> Recalculate
          </button>
        </div>

        {/* 4. Site map overview (only when pipeline data is available) */}
        {pipelineResult && (
          <div style={{ marginBottom: 20 }}>
            <SiteMap
              zones={pipelineResult.zones}
              feasibility={pipelineResult.feasibility}
              portfolio={pipelineResult.portfolio}
              onNavigateToZones={() => onNavigate('zones')}
              height={220}
            />
          </div>
        )}

        {/* 5. Tabs + toolbar row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          marginBottom: 16,
          gap: 0,
        }}>
          {/* Left: tabs */}
          <div style={{ display: 'flex', gap: 24, flex: 1, alignItems: 'flex-end' }}>
            <button
              className={`tab${activeTab === 'files' ? ' tab-active' : ''}`}
              onClick={() => setActiveTab('files')}
            >
              Files
            </button>
            <button
              className={`tab${activeTab === 'interventions' ? ' tab-active' : ''}`}
              onClick={() => setActiveTab('interventions')}
            >
              Interventions
            </button>
            <button
              className={`tab${activeTab === 'timeline' ? ' tab-active' : ''}`}
              onClick={() => setActiveTab('timeline')}
            >
              Timeline
            </button>
          </div>

          {/* Right: search + icon buttons — only visible on Interventions tab */}
          {activeTab === 'interventions' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
              <input
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: 180,
                  height: 30,
                  fontSize: 13,
                  padding: '0 10px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                }}
              />
              <button
                style={ghostBtnStyle}
                title="Upload files"
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                ↑
              </button>
              <button
                style={ghostBtnStyle}
                title="Filters"
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                ⊞
              </button>
            </div>
          )}
        </div>

        {/* 5. Selection action bar */}
        {activeTab === 'interventions' && selected.size > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            marginBottom: 12,
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 6,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 4 }}>
              {selected.size} selected
            </span>
            <button className="btn btn-secondary btn-sm" onClick={askAboutSelected}>
              ✦ Ask MIDAS
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('interventions')}>
              Edit
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        )}

        {/* 6 & 7. Tab content */}
        {activeTab === 'files' ? (
          <DocumentLibrary onDocumentsChange={setDocuments} />
        ) : activeTab === 'timeline' ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '32px 0' }}>
            Timeline coming soon
          </div>
        ) : visibleRows.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 0',
            gap: 8,
          }}>
            <span style={{ fontSize: 40, opacity: 0.15, lineHeight: 1 }}>◫</span>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
              {searchQuery.trim() ? 'No matching interventions' : 'No interventions yet'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {searchQuery.trim() ? 'Try a different search term' : 'Run the Mercury pipeline to see results'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={selected.size === visibleRows.length && visibleRows.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>NAME</th>
                <th>ZONE</th>
                <th>TYPE</th>
                <th>RACE SCORE</th>
                <th>LAST MODIFIED</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(iv => {
                const barWidth = maxRace > 0 ? Math.min(100, (iv.race / maxRace) * 100) : 0;
                return (
                  <tr
                    key={iv.id}
                    style={{ cursor: 'pointer', background: selected.has(iv.id) ? 'rgba(99,102,241,0.05)' : undefined }}
                    onClick={() => toggleSelect(iv.id)}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={selected.has(iv.id)}
                        onChange={() => toggleSelect(iv.id)}
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: '#f5f5f3', marginBottom: 4 }}>
                        {iv.name}
                      </div>
                      <div style={{ height: 2, background: '#1f1f1f', borderRadius: 1, width: 120 }}>
                        <div style={{
                          height: '100%',
                          background: '#6366f1',
                          borderRadius: 1,
                          width: `${barWidth}%`,
                        }} />
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{iv.zone}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Intervention</td>
                    <td>
                      <span className="mono" style={{ fontSize: 12 }}>
                        {iv.race > 0 ? iv.race.toExponential(2) : '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'Geist Mono, monospace' }}>
                        —
                      </span>
                    </td>
                    <td>
                      <StatusBadge inPortfolio={iv.inPortfolio} excluded={iv.excluded} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

      </div>
    </div>
  );
}
