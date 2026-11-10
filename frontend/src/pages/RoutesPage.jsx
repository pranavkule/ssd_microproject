import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Eye, Pencil, Plus, Search, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { gatewayApi, getErrorMessage } from '../services/api.js';
import { useDashboard, useToast } from '../contexts/DashboardContext.jsx';
import { ConfirmDialog, EmptyState, ErrorBanner, LoadingState, PageHeader, RefreshButton, StatusBadge } from '../components/DashboardUI.jsx';
import RouteEditor from '../components/RouteEditor.jsx';

function RoutesPage() {
  const { routes, loading, error, refresh } = useDashboard();
  const notify = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editorRoute, setEditorRoute] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [busyRoute, setBusyRoute] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [refreshingRegistry, setRefreshingRegistry] = useState(false);

  const filteredRoutes = useMemo(() => routes.filter((route) => {
    const matchesQuery = `${route.name} ${route.path}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = filter === 'all' || (filter === 'enabled' ? route.enabled : !route.enabled);
    return matchesQuery && matchesStatus;
  }), [filter, query, routes]);

  async function saveRoute(payload) {
    setSaving(true);
    try {
      if (editorRoute) await gatewayApi.updateRoute(editorRoute.id, payload);
      else await gatewayApi.createRoute(payload);
      notify(editorRoute ? 'Route updated successfully.' : 'Route created successfully.');
      setEditorRoute(undefined);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRoute(route) {
    setBusyRoute(route.id);
    try {
      await gatewayApi.setRouteEnabled(route.id, !route.enabled);
      notify(`Route ${route.enabled ? 'disabled' : 'enabled'} successfully.`);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setBusyRoute('');
    }
  }

  async function deleteRoute() {
    if (!deleting) return;
    setBusyRoute(deleting.id);
    try {
      await gatewayApi.deleteRoute(deleting.id);
      notify('Route deleted successfully.');
      setDeleting(null);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setBusyRoute('');
    }
  }

  async function refreshRegistry() {
    setRefreshingRegistry(true);
    try {
      const result = await gatewayApi.refreshRegistry();
      notify(`Route registry refreshed (${result.totalRoutes} routes).`);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setRefreshingRegistry(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Configuration" title="Routes" description="Create and manage gateway prefixes, methods, backend pools, and runtime state." actions={<><button className="button button-secondary" type="button" onClick={() => void refreshRegistry()} disabled={refreshingRegistry}><Activity size={15} className={refreshingRegistry ? 'spin' : ''} />Refresh registry</button><button className="button button-primary" type="button" onClick={() => setEditorRoute(null)}><Plus size={16} />Create route</button></>} />
      <ErrorBanner message={error} onRetry={() => void refresh()} />
      <section className="panel">
        <div className="table-toolbar">
          <label className="search-field"><Search size={16} /><input aria-label="Search routes" placeholder="Search name or path…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="toolbar-right">
            <select className="compact-select" aria-label="Filter routes by status" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All routes</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
            <RefreshButton onClick={() => void refresh()} loading={loading} />
          </div>
        </div>
        {loading && routes.length === 0 ? <LoadingState label="Loading routes…" /> : filteredRoutes.length === 0 ? (
          <EmptyState title={routes.length ? 'No routes match your filters' : 'No routes configured'} description={routes.length ? 'Try another search or status filter.' : 'Create a route to begin sending traffic through the gateway.'} action={!routes.length ? <button className="button button-primary" type="button" onClick={() => setEditorRoute(null)}><Plus size={15} />Create route</button> : null} />
        ) : (
          <div className="table-scroll">
            <table className="data-table route-table">
              <thead><tr><th>Route</th><th>Methods</th><th>Backends</th><th>Strategy</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {filteredRoutes.map((route) => (
                  <tr key={route.id}>
                    <td><Link to={`/routes/${route.id}`} className="route-name-link"><strong>{route.name}</strong><code>{route.path}</code></Link></td>
                    <td><div className="method-list">{route.methods.map((method) => <span className="method-pill" key={method}>{method}</span>)}</div></td>
                    <td><span className="count-pill">{route.backendInstances?.length || 0}</span></td>
                    <td><span className="strategy-label">{route.loadBalancingStrategy?.replaceAll('_', ' ') || 'round robin'}</span></td>
                    <td><StatusBadge status={route.enabled ? 'enabled' : 'disabled'} /></td>
                    <td><div className="row-actions">
                      <Link className="icon-button" title="View route details" aria-label={`View ${route.name}`} to={`/routes/${route.id}`}><Eye size={16} /></Link>
                      <button className="icon-button" title="Edit route" aria-label={`Edit ${route.name}`} onClick={() => setEditorRoute(route)}><Pencil size={15} /></button>
                      <button className="icon-button" title={route.enabled ? 'Disable route' : 'Enable route'} aria-label={`${route.enabled ? 'Disable' : 'Enable'} ${route.name}`} disabled={busyRoute === route.id} onClick={() => void toggleRoute(route)}>{route.enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button>
                      <button className="icon-button danger-icon" title="Delete route" aria-label={`Delete ${route.name}`} disabled={busyRoute === route.id} onClick={() => setDeleting(route)}><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editorRoute !== undefined ? <RouteEditor route={editorRoute || undefined} onClose={() => setEditorRoute(undefined)} onSave={saveRoute} saving={saving} /> : null}
      {deleting ? <ConfirmDialog title="Delete route?" message={`“${deleting.name}” and its backend configuration will be permanently removed from the gateway.`} busy={busyRoute === deleting.id} onCancel={() => setDeleting(null)} onConfirm={() => void deleteRoute()} /> : null}
    </div>
  );
}

export default RoutesPage;
