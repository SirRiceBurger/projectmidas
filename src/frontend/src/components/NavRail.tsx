import viteLogo from '/vite.png';

export type { View };

type View =
  | 'dashboard' | 'ingestion' | 'zones' | 'interventions'
  | 'scenarios' | 'sensitivity' | 'optimisation' | 'scoring' | 'portfolio'
  | 'explainability' | 'midas-ai' | 'settings';

const navItems = [
  { id: 'dashboard' as View, label: 'Dashboard', icon: '⊞' },
  { id: 'ingestion' as View, label: 'Site', icon: '◎' },
  { id: 'zones' as View, label: 'Zones', icon: '▦' },
  { id: 'interventions' as View, label: 'Interventions', icon: '⊕' },
  { id: 'scenarios' as View, label: 'Scenarios', icon: '◈' },
  { id: 'sensitivity' as View, label: 'Sensitivity', icon: '◬' },
  { id: 'optimisation' as View, label: 'Optimisation', icon: '◐' },
  { id: 'scoring' as View, label: 'Portfolio', icon: '◉' },
  { id: 'portfolio' as View, label: 'Capital', icon: '◇' },
  { id: 'explainability' as View, label: 'Explainability', icon: '◫' },
  { id: 'midas-ai' as View, label: 'MIDAS AI', icon: '✦' },
  { id: 'settings' as View, label: 'Settings', icon: '⊙' },
];

interface Props {
  active: View;
  onNavigate: (view: View) => void;
  projectName: string;
  pipelineResult: { zones: { area_ha: number }[] } | null;
}

export function NavRail({ active, onNavigate, projectName, pipelineResult }: Props) {
  const totalArea = pipelineResult?.zones.reduce((s, z) => s + z.area_ha, 0);

  return (
    <nav style={{
      width: 'var(--nav-width)',
      height: '100%',
      background: 'var(--bg-nav)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        height: 'var(--topbar-height)',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <img src={viteLogo} alt="MIDAS" style={{ width: 22, height: 22 }} />
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 16,
          fontWeight: 700,
          color: '#f5f5f3',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>MIDAS</span>
      </div>

      {/* Navigation section */}
      <div style={{ flex: 1, padding: '16px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          padding: '4px 10px 8px',
          fontFamily: 'Geist, sans-serif',
        }}>Navigation</div>

        {navItems.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                background: isActive ? '#1a1a1a' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
                color: isActive ? '#f5f5f3' : 'var(--text-secondary)',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                fontSize: 13,
                fontFamily: 'Geist, sans-serif',
                fontWeight: isActive ? 500 : 400,
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = '#141414'; (e.currentTarget as HTMLButtonElement).style.color = '#f5f5f3'; } }}
              onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; } }}
            >
              <span style={{ fontSize: 14, opacity: 0.8, width: 16, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}

        {/* Recent section */}
        {projectName && (
          <>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: '16px 10px 8px',
              fontFamily: 'Geist, sans-serif',
            }}>Recent</div>
            <div style={{
              padding: '7px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              fontFamily: 'Geist, sans-serif',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {projectName}
              {totalArea ? <span style={{ fontFamily: 'Geist Mono, monospace', marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>{totalArea.toFixed(0)} ha</span> : null}
            </div>
          </>
        )}
      </div>

      {/* Account */}
      <div style={{
        padding: '12px 8px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '7px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          width: '100%',
          fontSize: 13,
          fontFamily: 'Geist, sans-serif',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#141414')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#22c55e',
            flexShrink: 0,
          }} />
          Running Locally
        </button>
      </div>
    </nav>
  );
}
