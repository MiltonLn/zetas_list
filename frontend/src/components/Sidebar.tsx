import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function NavItem({
  to,
  icon,
  label,
  onClose,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClose: () => void;
}) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClose}
      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
    >
      <span className="sidebar-link-icon">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, isAdmin, logout } = useAuth();

  return (
    <>
      <div
        className={`sidebar-overlay${open ? ' visible' : ''}`}
        onClick={onClose}
      />

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-header">
          <NavLink to="/" onClick={onClose} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/logo.png" alt="Zetas" className="sidebar-logo-img" />
              <div>
                <div style={{ color: '#e8eaf6', fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>
                  Zetas
                </div>
                <div style={{ color: '#6e8efb', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>
                  VOLLEYBALL CLUB
                </div>
              </div>
            </div>
          </NavLink>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Principal</div>
          <NavItem to="/" icon={<IconGames />} label="Partidos" onClose={onClose} />
          <NavItem to="/finances" icon={<IconFinances />} label="Finanzas" onClose={onClose} />
          <NavItem to="/reglas" icon={<IconRules />} label="Reglas" onClose={onClose} />
          <NavItem to="/profile" icon={<IconUser />} label="Mi Perfil" onClose={onClose} />

          {isAdmin && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 16 }}>
                Administración
              </div>
              <NavItem
                to="/admin/games/new"
                icon={<IconPlus />}
                label="Nuevo Partido"
                onClose={onClose}
              />
              <NavItem
                to="/admin/users"
                icon={<IconUsers />}
                label="Usuarios"
                onClose={onClose}
              />
              <NavItem
                to="/admin/legacy-parser"
                icon={<IconClipboard />}
                label="Parser (Legacy)"
                onClose={onClose}
              />
              <NavItem
                to="/admin/finances"
                icon={<IconFinances />}
                label="Gestionar Finanzas"
                onClose={onClose}
              />
              <NavItem
                to="/admin/camisetas"
                icon={<IconShirt />}
                label="Pedidos Camisetas"
                onClose={onClose}
              />
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#e8eaf6', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name}
              </div>
              <div style={{ color: '#7c8db5', fontSize: 11 }}>
                @{user?.username}
                {isAdmin && (
                  <span style={{ color: '#6e8efb', marginLeft: 6, fontWeight: 600 }}>Admin</span>
                )}
              </div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={logout}>
            <IconLogout />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function IconGames() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <circle cx="19" cy="7" r="3" />
      <path d="M21 21v-2a3 3 0 0 0-2-2.83" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function IconFinances() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconShirt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4-3 4 2 4-2 4 3-3 3-1-1v11H8V8L7 9z" />
    </svg>
  );
}

function IconRules() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
