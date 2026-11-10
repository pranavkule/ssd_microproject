import { Link } from 'react-router-dom';
import {
  ArrowUpRight, Boxes, CircleCheck, CircleX, Database, Network, Route as RouteIcon,
  Server, ShieldAlert,
} from 'lucide-react';
import { useDashboard } from '../contexts/DashboardContext.jsx';
import { ErrorBanner, LoadingState, PageHeader, Panel, Skeleton, StatusBadge } from '../components/DashboardUI.jsx';
import { displayTarget } from '../utils/display.js';
import { getGatewayConnectionState } from '../utils/gatewayConnection.js';

function MetricCard({ label, value, detail, icon: Icon, tone = 'blue', loading }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon metric-${tone}`}><Icon size={19} /></div>
      <div className="metric-copy"><span>{label}</span>{loading ? <Skeleton className="metric-skeleton" /> : <strong>{value ?? '—'}</strong>}{detail ? <small>{detail}</small> : null}</div>
    </div>
  );
}

function Overview() {
  const { health, routes, metrics, loading, error, refresh, gatewayUnavailable } = useDashboard();
  const gatewayConnection = getGatewayConnectionState({ health, error, gatewayUnavailable });
  const backends = routes.flatMap((route) =>
    (route.backendInstances || []).map((backend) => ({ ...backend, route }))
  );
  const loadBalancing = health?.loadBalancing || {};
  const routeStats = health?.routeRegistry || {};

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Gateway control plane"
        title="Overview"
        description="Live operational status and configuration from the gateway."
        actions={<span className="polling-indicator"><span /> Refreshes every 5 seconds</span>}
      />
      <ErrorBanner message={error} onRetry={() => void refresh()} />

      <div className="metric-grid">
        <MetricCard label="Gateway" value={gatewayConnection.unavailable ? 'Offline' : health?.status || (loading ? null : 'Offline')} detail={health?.environment || 'API status'} icon={Server} tone="blue" loading={loading && !health} />
        <MetricCard label="MongoDB" value={health?.database?.status || 'Unknown'} detail={health?.database?.name || 'Connection state'} icon={Database} tone="violet" loading={loading && !health} />
        <MetricCard label="Configured routes" value={routeStats.totalRoutes ?? routes.length} detail={`${routeStats.enabledRoutes ?? '—'} enabled`} icon={RouteIcon} tone="cyan" loading={loading && routes.length === 0} />
        <MetricCard label="Backend instances" value={loadBalancing.totalBackends ?? backends.length} detail="Configured targets" icon={Boxes} tone="blue" loading={loading && routes.length === 0} />
        <MetricCard label="Healthy backends" value={loadBalancing.healthyBackends ?? '—'} detail="Eligible when enabled" icon={CircleCheck} tone="green" loading={loading && !health} />
        <MetricCard label="Unhealthy backends" value={loadBalancing.unhealthyBackends ?? '—'} detail={`${loadBalancing.disabledBackends ?? 0} disabled`} icon={ShieldAlert} tone="orange" loading={loading && !health} />
      </div>

      <Panel title="Gateway traffic" description="Current-process counts for proxied traffic; reset when the gateway restarts.">
        <div className="metric-grid">
          <MetricCard label="Requests received" value={metrics?.totalRequests ?? '—'} icon={Network} />
          <MetricCard label="Successful requests" value={metrics?.successfulRequests ?? '—'} icon={CircleCheck} tone="green" />
          <MetricCard label="Failed requests" value={metrics?.failedRequests ?? '—'} icon={ShieldAlert} tone="orange" />
          <MetricCard label="Average response time" value={metrics ? `${metrics.averageResponseTimeMs} ms` : '—'} icon={Server} />
        </div>
        <p className="page-footnote">
          HTTP status counts: {metrics ? Object.entries(metrics.byStatusCode).map(([status, count]) => `${status}: ${count}`).join(' · ') || 'No completed requests' : 'Metrics unavailable'}
        </p>
      </Panel>

      <div className="content-grid overview-grid">
        <Panel title="Backend health" description="Health monitor status for configured instances" action={<Link className="panel-link" to="/backends">All backends <ArrowUpRight size={14} /></Link>}>
          {loading && backends.length === 0 ? <LoadingState label="Loading backend health…" /> : backends.length === 0 ? (
            <div className="inline-empty">No backend instances are configured yet.</div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Backend</th><th>Target</th><th>Health</th><th>Enabled</th><th>Last check</th></tr></thead>
                <tbody>
                  {backends.map((backend) => (
                    <tr key={`${backend.route.id}-${backend.id}`}>
                      <td><strong>{backend.route.name}</strong><small className="cell-subtitle">{backend.id}</small></td>
                      <td className="mono-cell">{displayTarget(backend.target)}</td>
                      <td><StatusBadge status={backend.health?.status || 'unknown'} /></td>
                      <td><StatusBadge status={backend.enabled ? 'enabled' : 'disabled'} /></td>
                      <td className="muted-cell">{backend.health?.lastHealthCheckAt ? new Date(backend.health.lastHealthCheckAt).toLocaleTimeString() : 'Not checked yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Route overview" description="Configured prefixes and traffic strategies" action={<Link className="panel-link" to="/routes">Manage routes <ArrowUpRight size={14} /></Link>}>
          {loading && routes.length === 0 ? <LoadingState label="Loading routes…" /> : routes.length === 0 ? (
            <div className="inline-empty">No routes found. Create a route to get started.</div>
          ) : (
            <div className="route-overview-list">
              {routes.map((route) => (
                <Link className="route-overview-item" to={`/routes/${route.id}`} key={route.id}>
                  <div className="route-overview-icon"><Network size={17} /></div>
                  <div className="route-overview-copy"><strong>{route.name}</strong><code>{route.path}</code></div>
                  <div className="route-overview-meta"><span>{route.backendInstances?.length || 0} backends</span><StatusBadge status={route.enabled ? 'enabled' : 'disabled'} /></div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {health?.routeRegistry?.stale ? (
        <div className="warning-banner"><CircleX size={17} /><span>Runtime registry is stale. {health.routeRegistry.lastError || 'Refresh the route registry to reconcile persisted configuration.'}</span></div>
      ) : null}
      {!loading && !health && !error ? <div className="inline-empty">No health response is available.</div> : null}
    </div>
  );
}

export default Overview;
