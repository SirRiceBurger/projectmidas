import { useState, useEffect, useRef, useCallback } from 'react';
import {
  storeDocument,
  getAllDocuments,
  deleteDocument,
  getTotalStorageEstimate,
  type StoredDocument,
} from '../data/documentStore';

interface Props {
  onDocumentsChange?: (docs: StoredDocument[]) => void;
}

const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  pdf: { bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
  docx: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  txt: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
  md: { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
  csv: { bg: 'rgba(234,179,8,0.15)', color: '#facc15' },
  json: { bg: 'rgba(20,184,166,0.15)', color: '#2dd4bf' },
};

function getFileExt(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'file';
}

function getBadgeStyle(filename: string) {
  const ext = getFileExt(filename);
  return BADGE_COLORS[ext] ?? { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc' };
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentLibrary({ onDocumentsChange }: Props) {
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [extracting, setExtracting] = useState<string[]>([]); // filenames currently extracting
  const [errors, setErrors] = useState<Record<string, string>>({}); // filename → error
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllDocuments().then((all) => {
      const sorted = all.sort((a, b) => b.uploadedAt - a.uploadedAt);
      setDocs(sorted);
      onDocumentsChange?.(sorted);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const names = fileArray.map((f) => f.name);
      setExtracting((prev) => [...prev, ...names]);

      const newDocs: StoredDocument[] = [];
      const newErrors: Record<string, string> = {};

      for (const file of fileArray) {
        try {
          const doc = await storeDocument(file);
          newDocs.push(doc);
        } catch (err) {
          newErrors[file.name] =
            err instanceof Error ? err.message : 'Extraction failed';
        }
      }

      setExtracting((prev) => prev.filter((n) => !names.includes(n)));
      setErrors((prev) => ({ ...prev, ...newErrors }));

      if (newDocs.length > 0) {
        setDocs((prev) => {
          const updated = [...newDocs, ...prev];
          onDocumentsChange?.(updated);
          return updated;
        });
      }
    },
    [onDocumentsChange],
  );

  async function handleDelete(id: string) {
    await deleteDocument(id);
    setDocs((prev) => {
      const updated = prev.filter((d) => d.id !== id);
      onDocumentsChange?.(updated);
      return updated;
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files);
      e.target.value = '';
    }
  }

  function dismissError(name: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  const totalStorage = getTotalStorageEstimate(docs);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragOver ? 'var(--accent)' : '#2a2a2a'}`,
          borderRadius: '8px',
          padding: '20px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
          transition: 'border-color 0.15s, background 0.15s',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: '22px', marginBottom: '6px', opacity: 0.5 }}>
          +
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Drop files here or <span style={{ color: 'var(--accent)' }}>click to browse</span>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
          PDF, DOCX, TXT, MD, CSV, JSON and more
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="*"
          multiple
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Extracting indicators */}
      {extracting.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          {extracting.map((name) => (
            <div
              key={name}
              style={{
                padding: '7px 10px',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: '6px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: '2px solid var(--accent)',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
              }} />
              Extracting {name}…
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {Object.entries(errors).map(([name, msg]) => (
        <div
          key={name}
          style={{
            padding: '7px 10px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#f87171',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexShrink: 0,
          }}
        >
          <span><strong>{name}</strong>: {msg}</span>
          <button
            onClick={() => dismissError(name)}
            style={{
              background: 'none', border: 'none', color: '#f87171',
              cursor: 'pointer', fontSize: '12px', lineHeight: 1, flexShrink: 0, marginLeft: '8px',
            }}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Document list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {docs.length === 0 && extracting.length === 0 && (
          <div style={{
            color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center',
            marginTop: '24px', lineHeight: 1.6,
          }}>
            No documents uploaded yet.<br />
            Documents you upload are extracted and made available to the MIDAS Assistant.
          </div>
        )}
        {docs.map((doc) => {
          const badge = getBadgeStyle(doc.filename);
          const ext = getFileExt(doc.filename);
          return (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 4px',
                borderBottom: '1px solid #1f1f1f',
                fontSize: '11px',
                color: 'var(--text-primary)',
              }}
            >
              {/* Badge */}
              <span style={{
                padding: '2px 6px',
                borderRadius: '4px',
                background: badge.bg,
                color: badge.color,
                fontWeight: 700,
                fontSize: '10px',
                flexShrink: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {ext}
              </span>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600, fontSize: '11px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                  title={doc.filename}
                >
                  {doc.filename}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '1px' }}>
                  {formatSize(doc.sizeBytes)} &middot;{' '}
                  {doc.wordCount.toLocaleString()} words
                  {doc.pageCount != null ? ` · ${doc.pageCount}p` : ''}{' '}
                  &middot; {formatDate(doc.uploadedAt)}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => void handleDelete(doc.id)}
                title="Remove document"
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: '13px', lineHeight: 1, padding: '2px 4px',
                  flexShrink: 0,
                  borderRadius: '4px',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer — storage used */}
      {docs.length > 0 && (
        <div style={{
          borderTop: '1px solid #1f1f1f',
          paddingTop: '8px',
          fontSize: '10px',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}>
          {docs.length} document{docs.length !== 1 ? 's' : ''} &middot; {totalStorage} stored
        </div>
      )}

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
