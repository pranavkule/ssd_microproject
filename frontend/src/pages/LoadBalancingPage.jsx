import { useState } from 'react';
import { ArrowUpRight, CircleCheck, Info, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { loadBalancingApi, getErrorMessage } from '../services/api.js';
import { useDashboard, useToast } from '../contexts/DashboardContext.jsx';
import { EmptyState, ErrorBanner, PageHeader, Panel, StatusBadge } from '../components/DashboardUI.jsx';
import { displayTarget } from '../utils/display.js';

const strategies = [
  { value: 'round_robin', label: 'Round Robin', description: 'Rotates requests across eligible backends in stable ID order.' },
  { value: 'least_connections', label: 'Least Connections', description: 'Prefers the eligible backend with the fewest active proxied requests.' },
  { value: 'random', label: 'Random', description: 'Selects uniformly from the currently eligible backends.' },
];

function LoadBalancingPage() {
  const { routes, loading, error, refresh } = useDashboard();
  const notify = useToast();
  const [savingRoute, setSavingRoute] = useState('');
  const [pendingStrategy, setPendingStrategy] = useState({});

  async function saveStrategy(route) {
    const strategy = pendingStrategy[route.id] || route.loadBalancingStrategy;
    if (strategy === route.loadBalancingStrategy) return;
    setSavingRoute(route.id);
    try {
      await loadBalancingApi.setStrategy(route.id, strategy);
      notify(`${route.name} strategy changed to ${strategies.find((item) => item.value === strategy)?.label || strategy}.`);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setSavingRoute('');
      setPendingStrategy((current) => { const next = { ...current }; delete next[route.id]; return next; });
    }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Traffic distribution" title="Load balancing" description="Choose how each route distributes requests among healthy, enabled backend instances." />
      <ErrorBanner message={error} onRetry={() => void refresh()} />
      <div className="strategy-grid">
        {strategies.map((strategy) => <article className="strategy-card" key={strategy.value}><div className="strategy-card-icon"><Network size={18} /></div><h2>{strategy.label}</h2><p>{strategy.description}</p></article>)}
      </div>
      <Panel title="Route strategies" description="Strategy updates are applied to the live route registry after they are saved.">
        {loading && routes.length === 0 ? <div className="loading-state">Loading route configuration…</div> : routes.length === 0 ? <EmptyState title="No routes configured" description="Create a route before configuring load balancing." /> : (
          <div className="strategy-route-list">
            {routes.map((route) => {
              const eligible = (route.backendInstances || []).filter((backend) => route.enabled && backend.enabled && backend.health?.healthy);
              const selection = pendingStrategy[route.id] ?? route.loadBalancingStrategy ?? 'round_robin';
              return <article className="strategy-route" key={route.id}>
                <div className="strategy-route-heading"><div><Link to={`/routes/${route.id}`} className="route-name-link"><strong>{route.name}</strong><code>{route.path}</code></Link></div><StatusBadge status={route.enabled ? 'enabled' : 'disabled'} /></div>
                <div className="strategy-route-controls">
                  <label className="form-field"><span>Strategy</span><select value={selection} onChange={(event) => setPendingStrategy((current) => ({ ...current, [route.id]: event.target.value }))}>{strategies.map((strategy) => <option key={strategy.value} value={strategy.value}>{strategy.label}</option>)}</select></label>
                  <button className="button button-primary" type="button" disabled={savingRoute === route.id || selection === route.loadBalancingStrategy} onClick={() => void saveStrategy(route)}>{savingRoute === route.id ? 'Saving…' : 'Save strategy'}</button>
                </div>
                <div className="eligible-heading"><span><CircleCheck size={15} /> Eligible backends</span><strong>{eligible.length} / {route.backendInstances?.length || 0}</strong></div>
                {(route.backendInstances || []).length === 0 ? <p className="muted-copy">No backends configured.</p> : <div className="eligible-backends">{route.backendInstances.map((backend) => {
                  const isEligible = route.enabled && backend.enabled && Boolean(backend.health?.healthy);
                  return <div className="eligible-backend" key={backend.id}><span className={`eligibility-dot ${isEligible ? 'dot-good' : 'dot-muted'}`} /><div><strong>{backend.id}</strong><code>{displayTarget(backend.target)}</code></div><StatusBadge status={backend.health?.status || 'unknown'} /></div>;
                })}</div>}
                <p className="strategy-note"><Info size={14} /> Eligible status is based on the latest gateway health response. The gateway remains authoritative for request selection.</p>
                <Link className="panel-link inline-link" to={`/backends?routeId=${route.id}`}>Manage backend pool <ArrowUpRight size={14} /></Link>
              </article>;
            })}
          </div>
        )}
      </Panel>
      <p className="page-footnote">The backend accepts a weight field as metadata, but the currently supported strategies are not weighted. This dashboard does not display request distribution counts because the gateway does not expose them.</p>
    </div>
  );
}

export default LoadBalancingPage;
