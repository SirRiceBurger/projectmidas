import { useState, useRef, useEffect } from 'react';

interface Props {
  onNavigateMidasAI: (msg?: string) => void;
}

export function GeminiAssistant({ onNavigateMidasAI }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [fabHover, setFabHover] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dialog on outside click
  useEffect(() => {
    if (!dialogOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setDialogOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [dialogOpen]);

  // Focus input when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [dialogOpen]);

  function handleSubmit() {
    const msg = inputValue.trim();
    onNavigateMidasAI(msg || undefined);
    setDialogOpen(false);
    setInputValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setDialogOpen(false);
    }
  }

  return (
    <>
      {/* Compact dialog */}
      {dialogOpen && (
        <div
          ref={dialogRef}
          style={{
            position: 'fixed',
            bottom: 82,
            right: 24,
            zIndex: 1001,
            width: 300,
            background: '#0f0f0f',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: '16px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.05em',
            color: '#f5f5f3',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            Talk to MIDAS
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            marginBottom: 12,
          }}>
            Ask about your project, interventions, or upload documents for context
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 13,
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          />
          <div style={{ marginTop: 10 }}>
            <button
              onClick={handleSubmit}
              style={{
                width: '100%',
                borderRadius: 10,
                padding: '7px 14px',
                fontSize: 12,
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
                letterSpacing: '0.02em',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#5558e0'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#6366f1'; }}
            >
              Open MIDAS AI →
            </button>
          </div>
        </div>
      )}

      {/* Floating action button */}
      <button
        onClick={() => setDialogOpen(v => !v)}
        onMouseEnter={() => setFabHover(true)}
        onMouseLeave={() => setFabHover(false)}
        title="MIDAS AI"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          width: 48,
          height: 48,
          borderRadius: 24,
          background: fabHover ? '#5558e0' : '#6366f1',
          boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          border: 'none',
          color: '#fff',
          fontSize: 20,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s, box-shadow 0.15s',
          lineHeight: 1,
        }}
      >
        ✦
      </button>
    </>
  );
}
