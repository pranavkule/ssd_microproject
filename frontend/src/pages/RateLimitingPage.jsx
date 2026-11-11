import { useEffect, useState } from 'react';
import { Gauge, ShieldX, Users, SlidersHorizontal } from 'lucide-react';
import { rateLimitingApi, getErrorMessage } from '../services/api.js';
import { ErrorBanner, PageHeader, Panel } from '../components/DashboardUI.jsx';
import { useToast } from '../contexts/DashboardContext.jsx';

function RateLimitingPage() {
  const notify = useToast();
  const [configuration, setConfiguration] = useState(null);
  const [draft, setDraft] = useState({ enabled: true, capacity: '100', refillRate: '20' });
  const [source, setSource] = useState('');
  const [persistenceAvailable, setPersistenceAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const result = await rateLimitingApi.getConfiguration();
      const settings = result.settings;
      setConfiguration(result.rateLimiting);
      if (showLoading) {
        setDraft({
          enabled: settings.rateLimitEnabled,
          capacity: String(settings.rateLimitCapacity),
          refillRate: String(settings.rateLimitRefillRate),
        });
      }
      setSource(result.source);
      setPersistenceAvailable(result.persistenceAvailable);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(false), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await rateLimitingApi.updateConfiguration({
        rateLimitEnabled: draft.enabled,
        rateLimitCapacity: Number(draft.capacity),
        rateLimitRefillRate: Number(draft.refillRate),
      });
      setConfiguration(result.rateLimiting);
      setSource(result.source);
      setPersistenceAvailable(result.persistenceAvailable);
      notify('Rate-limit settings saved and applied.');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      notify(getErrorMessage(requestError), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Per-process token bucket" title="Rate limiting" description="Each client is identified by the address of its direct network connection. Forwarded IP headers are ignored." />
      <ErrorBanner message={error} onRetry={() => void load()} />
      {!persistenceAvailable && configuration ? <div className="warning-banner">MongoDB is unavailable. Showing {source.replaceAll('_', ' ')}; updates require a database connection.</div> : null}
      <Panel title="Current limiter activity" description="This live state resets when the gateway process restarts.">
        {loading && !configuration ? <div className="loading-state">Loading rate-limit status…</div> : configuration ? (
          <div className="metric-grid">
            <article className="metric-card"><div className="metric-icon metric-blue"><Gauge size={19} /></div><div className="metric-copy"><span>Limiter</span><strong>{configuration.enabled ? 'Enabled' : 'Disabled'}</strong></div></article>
            <article className="metric-card"><div className="metric-icon metric-orange"><ShieldX size={19} /></div><div className="metric-copy"><span>Rejected requests</span><strong>{configuration.rejectedRequests}</strong></div></article>
            <article className="metric-card"><div className="metric-icon metric-cyan"><Users size={19} /></div><div className="metric-copy"><span>Active client buckets</span><strong>{configuration.activeClients}</strong></div></article>
            <article className="metric-card"><div className="metric-icon metric-violet"><SlidersHorizontal size={19} /></div><div className="metric-copy"><span>Capacity / refill</span><strong>{configuration.capacity} / {configuration.refillRate} per sec</strong></div></article>
          </div>
        ) : null}
      </Panel>
      <Panel title="Token bucket settings" description={source ? `Settings loaded from ${source.replaceAll('_', ' ')}.` : 'Loading configuration…'}>
        {configuration ? (
          <form className="route-form" onSubmit={(event) => void save(event)}>
            <label className="switch-row">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
              <span className="switch-control" />
              <span><strong>Enable rate limiting</strong><small>New gateway requests start with a full bucket.</small></span>
            </label>
            <div className="form-grid">
              <label className="form-field"><span>Bucket capacity</span><input type="number" min="1" max="100000" step="1" required value={draft.capacity} onChange={(event) => setDraft((current) => ({ ...current, capacity: event.target.value }))} /><small>Maximum stored requests (1–100,000).</small></label>
              <label className="form-field"><span>Refill rate (tokens per second)</span><input type="number" min="1" max="10000" step="1" required value={draft.refillRate} onChange={(event) => setDraft((current) => ({ ...current, refillRate: event.target.value }))} /><small>Tokens restored over time (1–10,000).</small></label>
            </div>
            <p className="muted-copy">Buckets are stored in gateway memory and inactive buckets are removed after ten minutes. Settings are persisted in MongoDB.</p>
            <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving || loading || !persistenceAvailable}>{saving ? 'Saving…' : 'Save settings'}</button></div>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}

export default RateLimitingPage;
