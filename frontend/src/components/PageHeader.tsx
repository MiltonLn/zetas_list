import { Link } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, backTo, subtitle, action }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {backTo && (
          <Link to={backTo} className="page-header-back" aria-label="Volver">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#e8eaf6', margin: 0, lineHeight: 1.3 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ color: '#7c8db5', fontSize: 13, margin: 0, marginTop: 2 }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
