import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, Boxes, ChevronLeft, ChevronRight, CircleDot, Gauge,
  LayoutDashboard, Menu, Network, ScrollText, Waypoints, X,
} from 'lucide-react';
import { useDashboard } from '../contexts/DashboardContext.jsx';
import { RefreshButton, StatusBadge } from '../components/DashboardUI.jsx';
import { getGatewayConnectionState } from '../utils/gatewayConnection.js';

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/routes', label: 'Routes', icon: Waypoints },
  { to: '/backends', label: 'Backend instances', icon: Boxes },
  { to: '/load-balancing', label: 'Load balancing', icon: Network },
  { to: '/health', label: 'Health monitoring', icon: Activity },
];

function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { health, refreshing, refresh, lastUpdated, error, gatewayUnavailable } = useDashboard();
  const title = location.pathname.startsWith('/routes/')
    ? 'Route details'
    : navigation.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ||
      navigation.find((item) => item.to === location.pathname)?.label ||
      'Overview';
  const gatewayConnection = getGatewayConnectionState({ health, error, gatewayUnavailable });
  const gatewayStatus = gatewayConnection.status;
  const mongoStatus = health?.database?.status || 'unknown';

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen ? <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Network size={20} /></div>
          {!collapsed ? <div className="brand-text"><strong>Gateway</strong><span>Control plane</span></div> : null}
          <button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <div className="sidebar-section-label">{collapsed ? 'MENU' : 'Workspace'}</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} />
              {!collapsed ? <span>{label}</span> : null}
            </NavLink>
          ))}
          <div className="nav-link nav-disabled" title="Request logs are currently available in gateway terminal output only">
            <ScrollText size={18} />
            {!collapsed ? <><span>Activity logs</span><span className="nav-tag">CLI</span></> : null}
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-connection"><CircleDot size={15} /><span>{collapsed ? 'API' : gatewayConnection.sidebarLabel}</span></div>
          <button className="collapse-button" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /><span>Collapse sidebar</span></>}
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="topbar-title"><span>Dynamic API Gateway</span><strong>{title}</strong></div>
          <div className="topbar-status">
            <div className="top-status-item"><span className="top-status-label">Gateway</span><StatusBadge status={gatewayStatus} label={gatewayStatus === 'checking' ? 'Checking' : gatewayStatus} /></div>
            <div className="top-status-item db-status"><span className="top-status-label">MongoDB</span><StatusBadge status={mongoStatus} /></div>
            <RefreshButton onClick={() => void refresh()} loading={refreshing} />
          </div>
        </header>
        <main className="content-area">
          <Outlet />
          <footer className="app-footer">
            <span><Gauge size={14} /> Gateway control plane</span>
            <span>{lastUpdated ? `Last refreshed ${lastUpdated.toLocaleTimeString()}` : 'Waiting for gateway data'}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
