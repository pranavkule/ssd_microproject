import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { backendApi, getErrorMessage } from '../services/api.js';
import { useDashboard, useToast } from '../contexts/DashboardContext.jsx';
import { ConfirmDialog, EmptyState, ErrorBanner, Modal, PageHeader, Panel, RefreshButton, StatusBadge } from '../components/DashboardUI.jsx';
import { displayTarget } from '../utils/display.js';

function BackendEditor({ routes, selected, initialBackend, onClose, onSave, saving }) {
  const [routeId, setRouteId] = useState(selected || initialBackend?.routeId || routes[0]?.id || '');
  const [draft, setDraft] = useState(() => ({
    id: initialBackend?.id || '',
    target: initialBackend?.target || '',
    enabled: initialBackend?.enabled ?? true,
    weight: initialBackend?.weight ?? '',
    healthCheckPath: initialBackend?.healthCheckPath || '',
  }));
  const [error, setError] = useState('');
  const route = routes.find((item) => item.id === routeId);

  async function submit(event) {
    event.preventDefault();
    if (!route) return setError('Select a route for this backend.');
    if (!draft.id.trim()) return setError('Backend ID is required.');
    try {
      const target = new URL(draft.target);
      if (!['http:', 'https:'].includes(target.protocol) || target.search || target.hash) {
        return setError('Target must be a valid HTTP or HTTPS URL without query or fragment.');
      }
    } catch {
      return setError('Enter a valid HTTP or HTTPS target URL.');
    }
    if (draft.weight !== '' && (!Number.isInteger(Number(draft.weight)) || Number(draft.weight) < 1)) {
      return setError('Weight must be a positive integer.');
    }
    if (draft.healthCheckPath && (!draft.healthCheckPath.startsWith('/') || /[?#]/.test(draft.healthCheckPath))) {
      return setError('Health-check path must be an absolute path without query or fragment.');
    }
    setError('');
    await onSave(route, {
      ...draft,
      id: draft.id.trim(),
      weight: draft.weight === '' ? undefined : Number(draft.weight),
      healthCheckPath: draft.healthCheckPath || undefined,
    });
  }

  return (
    <Modal title={initialBackend ? 'Edit backend instance' : 'Add backend instance'} description="Changes are persisted through the selected route configuration." onClose={onClose}>
      <form className="route-form" onSubmit={(event) => void submit(event)}>
        {!initialBackend ? <label className="form-field"><span>Route <b>*</b></span><select value={routeId} onChange={(event) => setRouteId(event.target.value)}>{routes.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.path}</option>)}</select></label> : <div className="form-note">Route: <strong>{route?.name || initialBackend.routeName}</strong></div>}
        <label className="form-field"><span>Backend ID <b>*</b></span><input value={draft.id} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))} placeholder="inventory-primary" /></label>
        <label className="form-field"><span>Target URL <b>*</b></span><input value={draft.target} onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))} placeholder="http://localhost:5010" /></label>
        <div className="form-grid">
          <label className="form-field"><span>Health-check path</span><input value={draft.healthCheckPath} onChange={(event) => setDraft((current) => ({ ...current, healthCheckPath: event.target.value }))} placeholder="/health (default)" /></label>
          <label className="form-field"><span>Weight <small className="inline-hint">metadata only</small></span><input type="number" min="1" step="1" value={draft.weight} onChange={(event) => setDraft((current) => ({ ...current, weight: event.target.value }))} placeholder="Optional" /></label>
        </div>
        <label className="switch-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span className="switch-control" /><span><strong>Backend enabled</strong><small>Health status is controlled by the gateway monitor.</small></span></label>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : initialBackend ? 'Save backend' : 'Add backend'}</button></div>
      </form>
    </Modal>
  );
}

function BackendsPage() {
  const { routes, loading, error, refresh } = useDashboard();
  const notify = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRouteId = searchParams.get('routeId') || '';
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [removing, setRemoving] = useState(null);
  const filteredRoutes = useMemo(() => selectedRouteId ? routes.filter((route) => route.id === selectedRouteId) : routes, [routes, selectedRouteId]);
  const rows = filteredRoutes.flatMap((route) => (route.backendInstances || []).map((backend) => ({ ...backend, route })));

  async function persist(route, nextBackends) {
    setSaving(true);
    try {
      await backendApi.saveInstances(route.id, nextBackends);
      notify('Backend configuration saved.');
      setEditor(null);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveBackend(route, backend) {
    const current = route.backendInstances || [];
    if (current.some((item) => item.id === backend.id && item.id !== editor.initialBackend?.id)) {
      notify(`Backend ID "${backend.id}" already exists on this route.`, 'error');
      return;
    }
    const next = editor.initialBackend
      ? current.map((item) => item.id === editor.initialBackend.id ? backend : item)
      : [...current, backend];
    await persist(route, next);
  }

  async function toggleBackend(route, backend) {
    setBusy(`${route.id}:${backend.id}`);
    try {
      const next = route.backendInstances.map((item) => item.id === backend.id ? { ...item, enabled: !item.enabled } : item);
      await backendApi.saveInstances(route.id, next);
      notify(`Backend ${backend.enabled ? 'disabled' : 'enabled'} successfully.`);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setBusy('');
    }
  }

  async function removeBackend() {
    if (!removing) return;
    setBusy(`${removing.route.id}:${removing.id}`);
    try {
      const next = removing.route.backendInstances.filter((item) => item.id !== removing.id);
      await backendApi.saveInstances(removing.route.id, next);
      notify('Backend instance removed.');
      setRemoving(null);
      await refresh(true);
    } catch (requestError) {
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Upstream configuration" title="Backend instances" description="Manage targets within their gateway routes. Health and eligibility are reported by the gateway monitor." actions={<><RefreshButton onClick={() => void refresh()} loading={loading} /><button className="button button-primary" type="button" onClick={() => setEditor({ initialBackend: null })} disabled={routes.length === 0}><Plus size={16} />Add backend</button></>} />
      {selectedRouteId ? <div className="filter-notice">Showing backends for {filteredRoutes[0]?.name || 'the selected route'}. <button type="button" className="text-button" onClick={() => setSearchParams({})}>Show all routes</button></div> : null}
      <ErrorBanner message={error} onRetry={() => void refresh()} />
      <Panel title="Configured targets" description={`${rows.length} backend instance(s) across ${filteredRoutes.length} route(s)`}>
        {loading && routes.length === 0 ? <div className="loading-state">Loading backend instances…</div> : rows.length === 0 ? <EmptyState title="No backend instances found" description={routes.length ? 'This route has no configured backends.' : 'Create a route before adding backend instances.'} /> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Backend</th><th>Route</th><th>Target</th><th>Health</th><th>Eligibility</th><th>Last check / failures</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((backend) => {
              const eligible = backend.route.enabled && backend.enabled && Boolean(backend.health?.healthy);
              const key = `${backend.route.id}:${backend.id}`;
              return <tr key={key}>
                <td><strong>{backend.id}</strong>{backend.weight ? <small className="cell-subtitle">Weight {backend.weight} · informational</small> : null}</td>
                <td><strong>{backend.route.name}</strong><small className="cell-subtitle">{backend.route.path}</small></td>
                <td className="mono-cell">{displayTarget(backend.target)}{backend.healthCheckPath ? <small className="cell-subtitle">Check: {backend.healthCheckPath}</small> : null}</td>
                <td><StatusBadge status={backend.health?.status || 'unknown'} /></td>
                <td><StatusBadge status={eligible ? 'healthy' : 'disabled'} label={eligible ? 'Eligible' : 'Not eligible'} /></td>
                <td className="muted-cell">{backend.health?.lastHealthCheckAt ? new Date(backend.health.lastHealthCheckAt).toLocaleTimeString() : 'Not checked'}<small className="cell-subtitle">{backend.health?.consecutiveFailures ?? 0} consecutive failures</small></td>
                <td><div className="row-actions">
                  <button className="icon-button" title="Edit backend" aria-label={`Edit ${backend.id}`} onClick={() => setEditor({ routeId: backend.route.id, initialBackend: backend, routeName: backend.route.name })}><Pencil size={15} /></button>
                  <button className="icon-button" title={backend.enabled ? 'Disable backend' : 'Enable backend'} aria-label={`${backend.enabled ? 'Disable' : 'Enable'} ${backend.id}`} disabled={busy === key} onClick={() => void toggleBackend(backend.route, backend)}>{backend.enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button>
                  <button className="icon-button danger-icon" title="Remove backend" aria-label={`Remove ${backend.id}`} disabled={busy === key || backend.route.backendInstances.length <= 1} onClick={() => setRemoving(backend)}><Trash2 size={15} /></button>
                </div></td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </Panel>
      {editor ? <BackendEditor routes={routes} selected={editor.routeId || selectedRouteId} initialBackend={editor.initialBackend || undefined} onClose={() => setEditor(null)} onSave={saveBackend} saving={saving} /> : null}
      {removing ? <ConfirmDialog title="Remove backend instance?" message={`Remove backend “${removing.id}” from route “${removing.route.name}”? This configuration change takes effect immediately.`} onCancel={() => setRemoving(null)} onConfirm={() => void removeBackend()} busy={busy === `${removing.route.id}:${removing.id}`} /> : null}
    </div>
  );
}

export default BackendsPage;
