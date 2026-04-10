import type { CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  title?: string;
  action?: ReactNode;
}

export function Card({ children, style, className, title, action }: Props) {
  return (
    <div
      className={`card${className ? ` ${className}` : ''}`}
      style={style}
    >
      {(title || action) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          {title && <h3>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
