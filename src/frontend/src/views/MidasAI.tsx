import { useState, useRef, useEffect, useCallback } from 'react';
import { getApiKey, callGemini } from '../data/gemini';
import type { GeminiMessage } from '../data/gemini';
import type { PipelineResponse, PipelineParams } from '../data/api';
import type { StoredDocument } from '../data/documentStore';
import { DocumentLibrary } from '../components/DocumentLibrary';

// Citation format: [[doc:filename.pdf|exact quote from document]]
const CITATION_RE = /\[\[doc:([^|\]]+)\|([^\]]*)\]\]/g;

// Param proposal format: [[params:{"B":500000}]]
const PARAM_RE = /\[\[params:(\{[^}]+\})\]\]/;

// ─── Markdown stripper ────────────────────────────────────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, (m) => m)
    .trim();
}

// ─── DocViewer ────────────────────────────────────────────────────────────────
interface DocViewerProps {
  doc: StoredDocument;
  quote: string;
  onClose: () => void;
}

function DocViewer({ doc, quote, onClose }: DocViewerProps) {
  const firstMatchRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setTimeout(() => {
      firstMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, []);

  function buildContent() {
    if (!quote.trim()) return <span>{doc.extractedText}</span>;
    const text = doc.extractedText;
    const lower = text.toLowerCase();
    const lowerQ = quote.toLowerCase().trim();
    const nodes: React.ReactNode[] = [];
    let pos = 0;
    let key = 0;
    let first = true;
    let idx: number;
    while ((idx = lower.indexOf(lowerQ, pos)) !== -1) {
      if (idx > pos) nodes.push(text.slice(pos, idx));
      nodes.push(
        <mark
          key={key++}
          ref={first ? (el) => { firstMatchRef.current = el; first = false; } : undefined}
          style={{
            background: 'rgba(139,92,246,0.35)',
            color: '#c4b5fd',
            borderRadius: 3,
            padding: '1px 2px',
          }}
        >
          {text.slice(idx, idx + lowerQ.length)}
        </mark>
      );
      pos = idx + lowerQ.length;
    }
    if (pos < text.length) nodes.push(text.slice(pos));
    return <>{nodes}</>;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)', zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#111', border: '1px solid #2a2a2a', borderRadius: 12,
          width: '100%', maxWidth: 760, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #1f1f1f',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f5f5f3' }}>{doc.filename}</div>
            {quote && (
              <div style={{
                marginTop: 4, fontSize: 11, color: '#a78bfa',
                fontFamily: 'Geist Mono, monospace',
                background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 4, padding: '2px 8px', display: 'inline-block', maxWidth: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                "{quote}"
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 6,
              color: '#666', cursor: 'pointer', padding: '4px 10px', fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 24px',
          fontSize: 13, lineHeight: 1.8, color: '#ccc',
          fontFamily: 'Merriweather, Georgia, serif',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {buildContent()}
        </div>
      </div>
    </div>
  );
}

// ─── CitationChip ─────────────────────────────────────────────────────────────
function CitationChip({
  filename, quote, docs, onOpenViewer,
}: {
  filename: string;
  quote: string;
  docs: StoredDocument[];
  onOpenViewer: (doc: StoredDocument, quote: string) => void;
}) {
  const doc = docs.find(d => d.filename === filename);
  return (
    <button
      onClick={() => doc && onOpenViewer(doc, quote)}
      title={doc ? `View in ${filename}` : `${filename} (not found)`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '1px 7px',
        background: doc ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${doc ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 4, fontSize: 11,
        color: doc ? '#c4b5fd' : 'var(--text-muted)',
        cursor: doc ? 'pointer' : 'default',
        fontFamily: 'Geist Mono, monospace',
        verticalAlign: 'middle', lineHeight: 1.4,
        transition: 'background 0.15s',
      }}
    >
      <span style={{ opacity: 0.7 }}>◈</span>
      {filename}
    </button>
  );
}

// ─── MessageText ──────────────────────────────────────────────────────────────
function MessageText({
  text, docs, onOpenViewer,
}: {
  text: string;
  docs: StoredDocument[];
  onOpenViewer: (doc: StoredDocument, quote: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(CITATION_RE.source, 'g');
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <CitationChip
        key={key++}
        filename={match[1]}
        quote={match[2]}
        docs={docs}
        onOpenViewer={onOpenViewer}
      />
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ─── ThinkingDots ─────────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 0' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--text-muted)',
            display: 'inline-block',
            animation: `midasDotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes midasDotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── ParamPermissionCard ──────────────────────────────────────────────────────
const PARAM_LABELS: Record<string, string> = {
  B: 'Budget (B)',
  Gamma: 'CVaR Cap (Γ)',
  beta: 'Resilience Weight (β)',
  lambda_: 'Risk Penalty (λ)',
  S: 'Scenario Count (S)',
  T: 'Planning Horizon (T)',
};

function ParamPermissionCard({
  proposal,
  current,
  onAccept,
  onDecline,
}: {
  proposal: Partial<PipelineParams>;
  current: PipelineParams;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const keys = Object.keys(proposal) as (keyof PipelineParams)[];
  return (
    <div style={{
      background: 'rgba(99,102,241,0.07)',
      border: '1px solid rgba(99,102,241,0.25)',
      borderRadius: 12,
      padding: '14px 16px',
      marginTop: 8,
      maxWidth: '85%',
    }}>
      <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 600, marginBottom: 10, letterSpacing: '0.04em' }}>
        ◈ MIDAS proposes the following parameter changes
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {keys.map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)', width: 180, flexShrink: 0 }}>{PARAM_LABELS[k] ?? k}</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>
              {String(current[k])}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
            <span style={{ color: '#a5b4fc', fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 600 }}>
              {String(proposal[k])}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onAccept}
          style={{
            borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 600,
            background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          Apply changes
        </button>
        <button
          onClick={onDecline}
          style={{
            borderRadius: 8, padding: '6px 16px', fontSize: 12,
            background: 'transparent', color: 'var(--text-muted)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── System prompt ────────────────────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `You are the MIDAS Assistant — an expert advisor embedded in the MIDAS platform (Mission-Integrated Decision and Analysis System) for property-scale sustainability planning in Australia.

You help users understand:
- Their property and how site characteristics (slope, canopy, drainage, bushfire risk, etc.) affect which interventions are suitable
- Sustainability interventions: revegetation, solar, water retention, soil restoration, and others
- Mercury pipeline metrics:
  - RACE (Risk-Adjusted Carbon Efficiency): (E[E] × p) / (E[K] + λ·CVaR), balances carbon impact against cost and risk
  - CVaR (Conditional Value at Risk): the expected loss in the worst α% of scenarios — higher CVaR = more financial risk
  - MercuryScore: the composite ranking metric combining RACE, resilience, probability, CVaR penalty, and correlation penalty
  - Portfolio CVaR: combined risk across selected interventions, accounting for correlations between them
  - Planning horizon T: longer horizons compound emissions benefits but also uncertainty
  - Success probability p: likelihood the intervention achieves its planned outcomes
- Why Mercury may rank interventions differently from naive carbon-per-dollar (it accounts for risk, resilience, and portfolio diversification)
- How to interpret the Optimisation view, the Scenarios view, and Explainability outputs
- General sustainability concepts relevant to Australian land management

Be concise and direct. Use plain English. When quoting numbers or formulas, be precise.
If asked something outside sustainability planning or the MIDAS platform, politely redirect.

You can propose changes to Mercury engine parameters when the user asks. If proposing changes, include this block at the very end of your response (after all prose):
[[params:{"B":500000}]]
Only include parameters you want to change. Available parameters: B (budget AUD), Gamma (CVaR cap AUD), beta (resilience weight 0-1), lambda_ (risk penalty 0-1), S (scenario count 100-5000), T (planning horizon years 5-30). Only propose if the user explicitly requests a change. The user must approve before anything changes.

Important: Do not use markdown formatting in your responses. Do not use asterisks for bold (**), backticks for code (\`), pound signs for headers, or any other markdown syntax. Write in plain prose only.`;

function buildSystemPrompt(
  pipelineResult: PipelineResponse | null,
  documents: StoredDocument[],
  params: PipelineParams,
): string {
  let prompt = BASE_SYSTEM_PROMPT;

  prompt += `\n\nCURRENT PARAMETERS: B=AUD ${params.B.toLocaleString()}, Gamma=AUD ${params.Gamma.toLocaleString()}, beta=${params.beta}, lambda_=${params.lambda_}, S=${params.S}, T=${params.T} years.`;

  if (!pipelineResult) {
    prompt +=
      '\n\nNo pipeline results are available yet. Encourage the user to run the Mercury pipeline for site-specific analysis.';
  } else {
    const ctx = {
      zones: pipelineResult.zones,
      portfolio: pipelineResult.portfolio,
      scored_interventions: pipelineResult.scored,
      interventions: pipelineResult.interventions_detail,
      feasibility: pipelineResult.feasibility,
      exclusion_reasons: pipelineResult.exclusion_reasons,
      correlations: pipelineResult.correlations,
      all_portfolios: pipelineResult.all_portfolios,
      narrative: pipelineResult.narrative,
      audit_trail: pipelineResult.audit_trail,
      scenario_distributions: pipelineResult.scenario_distributions,
    };
    prompt +=
      `\n\n---\nCURRENT PIPELINE RESULTS (answer site-specific questions using this data):\n${JSON.stringify(ctx, null, 2)}\n---`;
  }

  if (documents.length > 0) {
    const docContext = documents
      .map(
        (d) =>
          `\n### ${d.filename} (${d.fileType}, ${d.wordCount} words)\n${d.extractedText.slice(0, 50000)}`,
      )
      .join('\n\n');

    prompt +=
      `\n\n---\nUPLOADED DOCUMENTS (use these as primary sources when answering questions):\n${docContext}\n---\n\nWhen your response references information from an uploaded document, include a citation in this exact format: [[doc:FILENAME|EXACT_QUOTE]] where FILENAME is the exact filename and EXACT_QUOTE is verbatim text from the document (20–120 chars) that directly supports your statement. The quote must exist word-for-word in the document. Example: [[doc:site-survey.pdf|bare soil fraction exceeds 35% across the northern paddock]]`;
  }

  return prompt;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  pipelineResult: PipelineResponse | null;
  triggerMessage: string | null;
  onTriggered: () => void;
  documents: StoredDocument[];
  params: PipelineParams;
  onApplyParams: (changes: Partial<PipelineParams>) => void;
}

type TabId = 'chat' | 'documents';

// ─── MidasAI ──────────────────────────────────────────────────────────────────
export function MidasAI({ pipelineResult, triggerMessage, onTriggered, documents, params, onApplyParams }: Props) {
  const [messages, setMessages] = useState<GeminiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ doc: StoredDocument; quote: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [localDocuments, setLocalDocuments] = useState<StoredDocument[]>(documents);
  const [pendingProposals, setPendingProposals] = useState<Record<number, Partial<PipelineParams>>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const apiKey = getApiKey();

  // Sync external documents into local state
  useEffect(() => {
    setLocalDocuments(documents);
  }, [documents]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    const key = getApiKey();
    if (!key || !text.trim() || loading) return;
    const userMsg: GeminiMessage = { role: 'user', text: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = '44px';
    try {
      const reply = await callGemini(key, buildSystemPrompt(pipelineResult, localDocuments, params), next);
      // Extract param proposal if present
      const paramMatch = PARAM_RE.exec(reply);
      const cleanReply = stripMarkdown(reply.replace(PARAM_RE, '').trim());
      setMessages(prev => {
        const updated = [...prev, { role: 'model' as const, text: cleanReply }];
        if (paramMatch) {
          try {
            const proposal = JSON.parse(paramMatch[1]) as Partial<PipelineParams>;
            setPendingProposals(pp => ({ ...pp, [updated.length - 1]: proposal }));
          } catch { /* ignore malformed proposal */ }
        }
        return updated;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [messages, loading, pipelineResult, localDocuments, params]);

  // Auto-send trigger message
  useEffect(() => {
    if (!triggerMessage) return;
    onTriggered();
    setActiveTab('chat');
    void sendMessage(triggerMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerMessage]);

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // Auto-resize
    e.target.style.height = '44px';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      position: 'relative',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        padding: '0 24px',
      }}>
        {(['chat', 'documents'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '11px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab
                ? '2px solid #6366f1'
                : '2px solid transparent',
              color: activeTab === tab ? '#6366f1' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer',
              letterSpacing: '0.03em',
              transition: 'color 0.15s, border-color 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'documents'
              ? `Documents${localDocuments.length > 0 ? ` (${localDocuments.length})` : ''}`
              : 'Chat'}
          </button>
        ))}
      </div>

      {/* Documents tab */}
      {activeTab === 'documents' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <DocumentLibrary onDocumentsChange={setLocalDocuments} />
          </div>
        </div>
      )}

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <>
          {/* Scrollable messages area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 16px',
          }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              {/* Header */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: '#f5f5f3',
                      textTransform: 'uppercase',
                    }}>
                      MIDAS AI
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Powered by Gemini 2.5 Flash
                    </div>
                  </div>
                  {localDocuments.length > 0 && (
                    <span style={{
                      background: 'rgba(34,197,94,0.1)',
                      color: '#4ade80',
                      border: '1px solid rgba(34,197,94,0.2)',
                      borderRadius: 12,
                      padding: '2px 10px',
                      fontSize: 10,
                      fontFamily: 'Geist Mono, monospace',
                    }}>
                      {localDocuments.length} doc{localDocuments.length !== 1 ? 's' : ''} in context
                    </span>
                  )}
                </div>
                <div style={{
                  marginTop: 16,
                  height: 1,
                  background: 'var(--border)',
                }} />
              </div>

              {/* Empty state */}
              {messages.length === 0 && !loading && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '64px 0',
                  opacity: 0.35,
                  gap: 12,
                }}>
                  <span style={{ fontSize: 32, lineHeight: 1 }}>✦</span>
                  <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>Ask MIDAS anything</span>
                </div>
              )}

              {/* No API key notice */}
              {!apiKey && messages.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginTop: 8,
                }}>
                  Set your Gemini API key in Settings to enable AI features
                </div>
              )}

              {/* Messages */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: 4,
                  }}>
                    {/* Sender label */}
                    <div style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      fontFamily: 'Geist Mono, monospace',
                      textAlign: m.role === 'user' ? 'right' : 'left',
                    }}>
                      {m.role === 'user' ? 'You' : 'MIDAS'}
                    </div>
                    {/* Bubble */}
                    <div style={{
                      maxWidth: m.role === 'user' ? '70%' : '85%',
                      marginLeft: m.role === 'user' ? 'auto' : undefined,
                      background: m.role === 'user'
                        ? 'rgba(99,102,241,0.15)'
                        : 'rgba(255,255,255,0.04)',
                      border: m.role === 'user'
                        ? '1px solid rgba(99,102,241,0.2)'
                        : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: m.role === 'user'
                        ? '18px 18px 4px 18px'
                        : '18px 18px 18px 4px',
                      padding: '10px 16px',
                      fontSize: 14,
                      color: 'var(--text-primary)',
                      lineHeight: 1.65,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.role === 'model'
                        ? <MessageText
                            text={m.text}
                            docs={localDocuments}
                            onOpenViewer={(doc, quote) => setViewer({ doc, quote })}
                          />
                        : m.text}
                    </div>
                    {/* Param proposal card */}
                    {m.role === 'model' && pendingProposals[i] && (
                      <ParamPermissionCard
                        proposal={pendingProposals[i]}
                        current={params}
                        onAccept={() => {
                          onApplyParams(pendingProposals[i]);
                          setPendingProposals(pp => { const n = { ...pp }; delete n[i]; return n; });
                        }}
                        onDecline={() => {
                          setPendingProposals(pp => { const n = { ...pp }; delete n[i]; return n; });
                        }}
                      />
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {loading && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                  }}>
                    <div style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      fontFamily: 'Geist Mono, monospace',
                    }}>MIDAS</div>
                    <div style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '18px 18px 18px 4px',
                      padding: '10px 16px',
                    }}>
                      <ThinkingDots />
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div style={{
                    padding: '8px 12px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#f87171',
                  }}>
                    {error}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          {/* Input area — fixed at bottom */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '16px',
            flexShrink: 0,
            background: 'var(--bg-base)',
          }}>
            <div style={{
              display: 'flex',
              gap: 10,
              maxWidth: 760,
              margin: '0 auto',
              alignItems: 'flex-end',
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={apiKey ? 'Ask anything… (Enter to send, Shift+Enter for newline)' : 'Set your Gemini API key in Settings first'}
                disabled={!apiKey}
                rows={1}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 14,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  resize: 'none',
                  minHeight: 44,
                  outline: 'none',
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                  overflowY: 'hidden',
                  transition: 'border-color 0.15s',
                  opacity: apiKey ? 1 : 0.5,
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
              <button
                onClick={() => void sendMessage(input)}
                disabled={!input.trim() || loading || !apiKey}
                style={{
                  borderRadius: 10,
                  width: 40,
                  height: 40,
                  background: '#6366f1',
                  color: '#fff',
                  fontSize: 18,
                  border: 'none',
                  cursor: !input.trim() || loading || !apiKey ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !input.trim() || loading || !apiKey ? 0.45 : 1,
                  flexShrink: 0,
                  transition: 'opacity 0.15s, background 0.15s',
                }}
                onMouseEnter={e => {
                  if (input.trim() && !loading && apiKey) {
                    (e.currentTarget as HTMLButtonElement).style.background = '#5558e0';
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#6366f1';
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </>
      )}

      {/* Document viewer modal */}
      {viewer && (
        <DocViewer
          doc={viewer.doc}
          quote={viewer.quote}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
