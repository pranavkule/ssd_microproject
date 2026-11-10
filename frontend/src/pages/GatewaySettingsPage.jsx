import { useEffect, useState } from 'react';
import { configurationApi, getErrorMessage } from '../services/api.js';
import { ErrorBanner, PageHeader, Panel } from '../components/DashboardUI.jsx';
import { useToast } from '../contexts/DashboardContext.jsx';

const fields = [
  { key: 'proxyTimeoutMs', label: 'Upstream request timeout (ms)', min: 100, max: 120000 },
  { key: 'healthCheckIntervalMs', label: 'Health-check interval (ms)', min: 250, max: 300000 },
  { key: 'healthCheckTimeoutMs', label: 'Health-check timeout (ms)', min: 100, max: 60000 },
  { key: 'healthCheckFailureThreshold', label: 'Failure threshold', min: 1, max: 20 },
  { key: 'healthCheckRecoveryThreshold', label: 'Recovery threshold', min: 1, max: 20 },
];

function GatewaySettingsPage() {
  const notify = useToast();
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({});
  const [source, setSource] = useState('');
  const [persistenceAvailable, setPersistenceAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await configurationApi.getConfiguration();
      setSettings(result.settings);
      setDraft(Object.fromEntries(fields.map(({ key }) => [key, String(result.settings[key])])));
      setSource(result.source);
      setPersistenceAvailable(result.persistenceAvailable);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(event) {
    event.preventDefault();
    const changed = Object.fromEntries(fields
      .filter(({ key }) => Number(draft[key]) !== settings[key])
      .map(({ key }) => [key, Number(draft[key])]));
    if (!Object.keys(changed).length) return;
    setSaving(true);
    try {
      const result = await configurationApi.updateConfiguration(changed);
      setSettings(result.settings);
      setDraft(Object.fromEntries(fields.map(({ key }) => [key, String(result.settings[key])])));
      setSource(result.source);
      setPersistenceAvailable(result.persistenceAvailable);
      notify('Gateway settings saved and applied.');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Persisted gateway configuration" title="Gateway settings" description="Only supported timeout and backend health-check controls are exposed." />
      <ErrorBanner message={error} onRetry={() => void load()} />
      {!persistenceAvailable && settings ? <div className="warning-banner">MongoDB is unavailable. Showing {source.replaceAll('_', ' ')}; updates require a database connection.</div> : null}
      <Panel title="Runtime settings" description={source ? `Loaded from ${source.replaceAll('_', ' ')}.` : 'Loading configuration…'}>
        {loading && !settings ? <div className="loading-state">Loading gateway settings…</div> : settings ? (
          <form className="route-form" onSubmit={(event) => void save(event)}>
            <div className="form-grid">
              {fields.map(({ key, label, min, max }) => <label className="form-field" key={key}>
                <span>{label}</span>
                <input type="number" min={min} max={max} step="1" required value={draft[key] || ''} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
                <small>Allowed range: {min}–{max}</small>
              </label>)}
            </div>
            <p className="muted-copy">Updates are persisted in MongoDB and applied to the running proxy and health monitor. Existing route strategy settings are not changed.</p>
            <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving || loading || !persistenceAvailable}>{saving ? 'Saving…' : 'Save settings'}</button></div>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}

export default GatewaySettingsPage;
