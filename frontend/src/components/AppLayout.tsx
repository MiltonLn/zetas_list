import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="app-layout">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="app-main">
        <div className="app-topbar">
          <button
            className="topbar-hamburger"
            onClick={openSidebar}
            aria-label="Abrir menú"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <img src="/logo.png" alt="Zetas" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          <span className="topbar-title">Volley Zetas Ingenio</span>
        </div>
        <div className="app-content">
          {children}
        </div>
      </div>
    </div>
  );
}
