import { Link } from 'react-router-dom'

interface HeaderProps {
  title?: string
  backTo?: string
  backLabel?: string
  action?: React.ReactNode
}

export default function Header({ title = 'Asistencia Zetas', backTo, backLabel, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
      style={{ background: 'var(--color-zetas-surface)', borderBottom: '1px solid var(--color-zetas-border)' }}>
      {backTo ? (
        <Link to={backTo} className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
          style={{ background: 'var(--color-zetas-card)', color: 'var(--color-zetas-accent)' }}
          aria-label={backLabel ?? 'Volver'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </Link>
      ) : (
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Zetas logo" className="w-9 h-9 rounded-full object-cover shrink-0" />
      )}
      <h1 className="flex-1 font-bold text-lg truncate" style={{ color: 'var(--color-zetas-text)' }}>
        {title}
      </h1>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
