import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { LOAD_BALANCING_STRATEGIES, SUPPORTED_METHODS, validateRouteDraft } from '../utils/routeDraft.js';
import { Modal } from './DashboardUI.jsx';

function draftFromRoute(route) {
  return {
    name: route?.name || '',
    path: route?.path || '',
    description: route?.description || '',
    methods: route?.methods || ['GET', 'HEAD'],
    stripPrefix: Boolean(route?.stripPrefix),
    enabled: route?.enabled ?? true,
    authRequired: route?.authRequired ?? false,
    requiredRoles: (route?.requiredRoles || []).join(', '),
    loadBalancingStrategy: route?.loadBalancingStrategy || 'round_robin',
    backendInstances: (route?.backendInstances || [{ id: '', target: '', enabled: true }]).map(({ id, target, enabled, weight, healthCheckPath }) => ({
      id: id || '',
      target: target || '',
      enabled: enabled ?? true,
      weight: weight || '',
      healthCheckPath: healthCheckPath || '',
    })),
  };
}

function RouteEditor({ route, onClose, onSave, saving = false }) {
  const [draft, setDraft] = useState(() => draftFromRoute(route));
  const [validationError, setValidationError] = useState('');
  const isEditing = Boolean(route);

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const updateBackend = (index, key, value) => {
    setDraft((current) => ({
      ...current,
      backendInstances: current.backendInstances.map((backend, itemIndex) =>
        itemIndex === index ? { ...backend, [key]: value } : backend
      ),
    }));
  };
  const toggleMethod = (method) => {
    setDraft((current) => ({
      ...current,
      methods: current.methods.includes(method)
        ? current.methods.filter((item) => item !== method)
        : [...current.methods, method],
    }));
  };
  const errors = useMemo(() => validateRouteDraft(draft), [draft]);

  async function submit(event) {
    event.preventDefault();
    const firstError = Object.values(errors)[0];
    if (firstError) {
      setValidationError(firstError);
      return;
    }
    setValidationError('');
    await onSave({
      ...draft,
      backendInstances: draft.backendInstances.map((backend) => ({
        ...backend,
        weight: backend.weight === '' ? undefined : Number(backend.weight),
        healthCheckPath: backend.healthCheckPath || undefined,
      })),
      requiredRoles: draft.requiredRoles
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
    });
  }

  return (
    <Modal title={isEditing ? 'Edit route' : 'Create route'} description="Route changes are saved to the gateway and take effect without restarting it." onClose={onClose} wide>
      <form className="route-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <label className="form-field"><span>Route name <b>*</b></span><input value={draft.name} onChange={(event) => setField('name', event.target.value)} maxLength={100} placeholder="Inventory API" required /><small>Unique, up to 100 characters.</small></label>
          <label className="form-field"><span>Gateway path <b>*</b></span><input value={draft.path} onChange={(event) => setField('path', event.target.value)} placeholder="/api/inventory" required /><small>Must start with / and cannot use reserved gateway paths.</small></label>
        </div>
        <label className="form-field"><span>Description</span><textarea rows={2} maxLength={500} value={draft.description} onChange={(event) => setField('description', event.target.value)} placeholder="Optional description" /></label>

        <div className="form-section">
          <div className="form-section-heading"><div><h3>HTTP methods</h3><p>Choose methods accepted by this route.</p></div></div>
          <div className="method-options">
            {SUPPORTED_METHODS.map((method) => (
              <label className="check-chip" key={method}><input type="checkbox" checked={draft.methods.includes(method)} onChange={() => toggleMethod(method)} /><span>{method}</span></label>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <label className="form-field"><span>Load-balancing strategy</span><select value={draft.loadBalancingStrategy} onChange={(event) => setField('loadBalancingStrategy', event.target.value)}>{LOAD_BALANCING_STRATEGIES.map((strategy) => <option value={strategy.value} key={strategy.value}>{strategy.label}</option>)}</select></label>
          <div className="toggle-field-stack">
            <label className="switch-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => setField('enabled', event.target.checked)} /><span className="switch-control" /><span><strong>Route enabled</strong><small>Disabled routes are not matched by the proxy.</small></span></label>
            <label className="switch-row"><input type="checkbox" checked={draft.stripPrefix} onChange={(event) => setField('stripPrefix', event.target.checked)} /><span className="switch-control" /><span><strong>Strip matched prefix</strong><small>Remove the route prefix before forwarding.</small></span></label>
            <label className="switch-row"><input type="checkbox" checked={draft.authRequired} onChange={(event) => setField('authRequired', event.target.checked)} /><span className="switch-control" /><span><strong>Require JWT authentication</strong><small>Reject requests without a valid gateway-verified bearer token.</small></span></label>
          </div>
        </div>
        <label className="form-field"><span>Required roles <small className="inline-hint">optional, comma-separated</small></span><input value={draft.requiredRoles} onChange={(event) => setField('requiredRoles', event.target.value)} placeholder="e.g. operator, auditor" /><small>When roles are set on an authenticated route, a token must include at least one of them.</small></label>

        <div className="form-section">
          <div className="form-section-heading">
            <div><h3>Backend instances <b>*</b></h3><p>Only enabled, healthy backends receive traffic.</p></div>
            <button type="button" className="button button-secondary button-small" onClick={() => setDraft((current) => ({ ...current, backendInstances: [...current.backendInstances, { id: '', target: '', enabled: true, weight: '', healthCheckPath: '' }] }))}><Plus size={14} />Add backend</button>
          </div>
          <div className="backend-editor-list">
            {draft.backendInstances.map((backend, index) => (
              <div className="backend-editor-card" key={`backend-${index}`}>
                <div className="backend-editor-title"><strong>Backend {index + 1}</strong>{draft.backendInstances.length > 1 ? <button className="icon-button danger-icon" type="button" aria-label={`Remove backend ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, backendInstances: current.backendInstances.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={16} /></button> : null}</div>
                <div className="form-grid backend-grid">
                  <label className="form-field"><span>Backend ID <b>*</b></span><input value={backend.id} onChange={(event) => updateBackend(index, 'id', event.target.value)} maxLength={100} placeholder="inventory-primary" /></label>
                  <label className="form-field"><span>Target URL <b>*</b></span><input value={backend.target} onChange={(event) => updateBackend(index, 'target', event.target.value)} placeholder="http://localhost:5010" /></label>
                  <label className="form-field"><span>Health-check path</span><input value={backend.healthCheckPath} onChange={(event) => updateBackend(index, 'healthCheckPath', event.target.value)} placeholder="/health (default)" /></label>
                  <label className="form-field"><span>Weight <small className="inline-hint">metadata only</small></span><input type="number" min="1" step="1" value={backend.weight} onChange={(event) => updateBackend(index, 'weight', event.target.value)} placeholder="Optional" /></label>
                </div>
                <label className="switch-row backend-enabled"><input type="checkbox" checked={backend.enabled} onChange={(event) => updateBackend(index, 'enabled', event.target.checked)} /><span className="switch-control" /><span><strong>Backend enabled</strong></span></label>
              </div>
            ))}
          </div>
        </div>

        {validationError ? <div className="form-error" role="alert">{validationError}</div> : null}
        <div className="form-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create route'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default RouteEditor;
