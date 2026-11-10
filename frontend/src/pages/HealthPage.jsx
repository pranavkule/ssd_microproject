import { AlertTriangle, CheckCircle2, Database, RefreshCw, Shield, XCircle } from 'lucide-react';
import { useDashboard } from '../contexts/DashboardContext.jsx';
import { EmptyState, ErrorBanner, PageHeader, Panel, StatusBadge } from '../components/DashboardUI.jsx';

function HealthPage() {
  const { health, routes, loading, error, refresh, refreshing, lastUpdated } = useDashboard();
  const healthRoutes = health?.routes;
  const backendRows = (healthRoutes || routes).flatMap((route) =>
    (route.backendInstances || route.backends || []).map((backend) => ({
      ...backend,
      routeName: route.name,
      routeEnabled: route.enabled,
      path: route.path || route.pathPrefix,
    }))
  );
  const healthyCount = backendRows.filter((backend) => backend.health?.healthy).length;
  const eligibleCount = backendRows.filter((backend) => routeCanReceiveTraffic(backend)).length;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Live status" title="Health monitoring" description="Health state is reported by the gateway's backend monitor and refreshes every 5 seconds." actions={<button className="button button-secondary" type="button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />Refresh now</button>} />
      <ErrorBanner message={error} onRetry={() => void refresh()} />
      <div className="health-summary-grid">
        <div className="health-summary"><div className="metric-icon metric-blue"><Shield size={18} /></div><div><span>Gateway</span><strong>{health?.status || (loading ? 'Checking…' : 'Offline')}</strong><StatusBadge status={health?.status || (loading ? 'unknown' : 'offline')} /></div></div>
        <div className="health-summary"><div className="metric-icon metric-violet"><Database size={18} /></div><div><span>MongoDB</span><strong>{health?.database?.status || 'Unknown'}</strong><small>{health?.database?.name || 'Database status unavailable'}</small></div></div>
        <div className="health-summary"><div className="metric-icon metric-cyan"><CheckCircle2 size={18} /></div><div><span>Route registry</span><strong>{health?.routeRegistry?.status || 'Unknown'}</strong><StatusBadge status={health?.routeRegistry?.stale ? 'unhealthy' : health?.routeRegistry?.status || 'unknown'} label={health?.routeRegistry?.stale ? 'stale' : undefined} /></div></div>
        <div className="health-summary"><div className="metric-icon metric-green"><AlertTriangle size={18} /></div><div><span>Backend eligibility</span><strong>{eligibleCount} / {backendRows.length}</strong><small>{healthyCount} currently healthy</small></div></div>
      </div>
      {health?.routeRegistry?.lastError ? <div className="warning-banner"><AlertTriangle size={17} /><span>Registry reports: {health.routeRegistry.lastError}</span></div> : null}
      <Panel title="Backend health" description="A backend must be route-enabled, backend-enabled, and healthy to receive traffic." action={lastUpdated ? <span className="muted-cell">Updated {lastUpdated.toLocaleTimeString()}</span> : null}>
        {backendRows.length === 0 ? <EmptyState title={loading ? 'Checking gateway health' : 'No backend health data'} description={loading ? 'Waiting for the gateway response.' : 'Health details will appear when configured routes are returned by the gateway.'} /> : (
          <div className="health-backend-list">{backendRows.map((backend, index) => {
            const eligible = routeCanReceiveTraffic(backend);
            return <article className="health-backend-row" key={`${backend.routeName}-${backend.id}-${index}`}>
              <div className="health-pulse"><span className={backend.health?.status === 'healthy' ? 'pulse-good' : backend.health?.status === 'unhealthy' ? 'pulse-bad' : ''} /></div>
              <div className="health-backend-primary"><strong>{backend.routeName} <span className="backend-id">/{backend.id}</span></strong><code>{backend.target}</code><small>{backend.path}</small></div>
              <div className="health-status-cell"><span className="meta-label">Health</span><StatusBadge status={backend.health?.status || 'unknown'} /></div>
              <div className="health-status-cell"><span className="meta-label">Traffic</span><StatusBadge status={eligible ? 'healthy' : 'disabled'} label={eligible ? 'Eligible' : 'Not eligible'} /></div>
              <div className="health-status-cell"><span className="meta-label">Last check</span><strong>{backend.health?.lastHealthCheckAt ? new Date(backend.health.lastHealthCheckAt).toLocaleTimeString() : 'Not checked'}</strong></div>
              <div className="health-status-cell"><span className="meta-label">Failures</span><strong>{backend.health?.consecutiveFailures ?? 0}</strong></div>
            </article>;
          })}</div>
        )}
      </Panel>
      <div className="info-card"><div className="info-card-icon"><RefreshCw size={17} /></div><div><strong>Automatic failover and recovery</strong><p>The gateway periodically checks enabled backends. After its configured failure threshold, an unhealthy instance is excluded from selection. Successful checks restore it after the recovery threshold. The dashboard displays the monitor's latest report; it does not set backend health.</p></div></div>
      <p className="page-footnote">Last successful health refresh: {lastUpdated ? lastUpdated.toLocaleString() : 'Not yet available'}{refreshing ? ' · Refreshing…' : ''}</p>
    </div>
  );
}

function routeCanReceiveTraffic(backend) {
  return Boolean(backend.routeEnabled && backend.enabled && backend.health?.healthy);
}

export default HealthPage;
