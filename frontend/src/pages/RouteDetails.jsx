import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Pencil, Route as RouteIcon } from 'lucide-react';
import { gatewayApi, getErrorMessage } from '../services/api.js';
import { useDashboard, useToast } from '../contexts/DashboardContext.jsx';
import { ErrorBanner, LoadingState, PageHeader, Panel, StatusBadge } from '../components/DashboardUI.jsx';
import RouteEditor from '../components/RouteEditor.jsx';
import { displayTarget } from '../utils/display.js';

function RouteDetails() {
  const { id } = useParams();
  const { routes, loading: routesLoading, refresh } = useDashboard();
  const notify = useToast();
  const [fallbackRoute, setFallbackRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const route = routes.find((item) => item.id === id) || fallbackRoute;

  const hasListedRoute = routes.some((item) => item.id === id);
  useEffect(() => {
    if (routesLoading) return;
    if (hasListedRoute) return;
    let active = true;
    setFallbackRoute(null);
    setLoading(true);
    gatewayApi.getRoute(id)
      .then((result) => { if (active) setFallbackRoute(result); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [hasListedRoute, id, routesLoading]);

  async function save(payload) {
    setSaving(true);
    try {
      await gatewayApi.updateRoute(id, payload);
      notify('Route updated successfully.');
      setEditing(false);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !route) return <LoadingState />;
  if (!route) return <div className="page-stack"><PageHeader title="Route details" /><ErrorBanner message={error || 'Route not found.'} /><Link className="button button-secondary button-fit" to="/routes"><ArrowLeft size={15} />Back to routes</Link></div>;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Route configuration" title={route.name} description={`${route.path} · ${route.description || 'No description provided'}`} actions={<><Link className="button button-secondary" to={`/backends?routeId=${route.id}`}><ArrowUpRight size={15} />Backend instances</Link><button className="button button-primary" type="button" onClick={() => setEditing(true)}><Pencil size={15} />Edit route</button></>} />
      <div className="content-grid route-details-grid">
        <Panel title="Route settings" description="Configuration currently stored by the gateway">
          <div className="detail-list">
            <div><span>Route ID</span><code>{route.id}</code></div>
            <div><span>Gateway path</span><code>{route.path}</code></div>
            <div><span>Allowed methods</span><div className="method-list">{route.methods.map((method) => <span className="method-pill" key={method}>{method}</span>)}</div></div>
            <div><span>Load balancing</span><strong className="strategy-label">{route.loadBalancingStrategy?.replaceAll('_', ' ')}</strong></div>
            <div><span>Route status</span><StatusBadge status={route.enabled ? 'enabled' : 'disabled'} /></div>
            <div><span>Strip prefix</span><strong>{route.stripPrefix ? 'Enabled' : 'Disabled'}</strong></div>
            <div><span>Created</span><strong>{route.createdAt ? new Date(route.createdAt).toLocaleString() : '—'}</strong></div>
            <div><span>Last updated</span><strong>{route.updatedAt ? new Date(route.updatedAt).toLocaleString() : '—'}</strong></div>
          </div>
        </Panel>
        <Panel title="Backend pool" description={`${route.backendInstances?.length || 0} configured instance(s)`} action={<Link className="panel-link" to={`/backends?routeId=${route.id}`}>Manage instances <ArrowUpRight size={14} /></Link>}>
          <div className="detail-backends">
            {(route.backendInstances || []).map((backend) => (
              <article className="backend-card" key={backend.id}>
                <div className="backend-card-top"><div className="backend-symbol"><RouteIcon size={16} /></div>                <div className="backend-name"><strong>{backend.id}</strong><code>{displayTarget(backend.target)}</code></div><StatusBadge status={backend.health?.status || 'unknown'} /></div>
                <div className="backend-card-meta">
                  <span><span className="meta-label">Configured</span><StatusBadge status={backend.enabled ? 'enabled' : 'disabled'} /></span>
                  <span><span className="meta-label">Eligible</span><StatusBadge status={route.enabled && backend.enabled && backend.health?.healthy ? 'healthy' : 'disabled'} label={route.enabled && backend.enabled && backend.health?.healthy ? 'Yes' : 'No'} /></span>
                  <span><span className="meta-label">Last health check</span><strong>{backend.health?.lastHealthCheckAt ? new Date(backend.health.lastHealthCheckAt).toLocaleString() : 'Not checked yet'}</strong></span>
                  <span><span className="meta-label">Consecutive failures</span><strong>{backend.health?.consecutiveFailures ?? 0}</strong></span>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>
      {editing ? <RouteEditor route={route} onClose={() => setEditing(false)} onSave={save} saving={saving} /> : null}
    </div>
  );
}

export default RouteDetails;
