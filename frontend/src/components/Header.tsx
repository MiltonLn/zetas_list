import { Link } from 'react-router-dom';

interface HeaderProps {
  title: string;
  backTo?: string;
  action?: React.ReactNode;
}

export function Header({ title, backTo, action }: HeaderProps) {
  return (
    <header
      style={{
        background: '#161829',
        borderBottom: '1px solid #2a2f5a',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {backTo && (
        <Link
          to={backTo}
          style={{ color: '#7c8db5', textDecoration: 'none', fontSize: 20, lineHeight: 1 }}
          aria-label="Volver"
        >
          ←
        </Link>
      )}
      <h1 style={{ flex: 1, fontSize: 17, fontWeight: 700, color: '#e8eaf6', margin: 0 }}>
        {title}
      </h1>
      {action}
    </header>
  );
}
