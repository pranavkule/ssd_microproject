import { useEffect, useState } from 'react';
import { requestLogsApi, getErrorMessage } from '../services/api.js';
import { EmptyState, ErrorBanner, PageHeader, Panel, RefreshButton } from '../components/DashboardUI.jsx';

const initialFilters = {
  method: '',
  statusCode: '',
  route: '',
  success: '',
  from: '',
  to: '',
  requestId: '',
};

function ActivityLogsPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [draft, setDraft] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = { ...filters, page, limit: 25 };
    for (const key of ['from', 'to']) {
      if (params[key]) params[key] = new Date(params[key]).toISOString();
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === '') delete params[key];
    }
    requestLogsApi.list(params)
      .then((response) => {
        if (active) {
          setResult(response);
          setError('');
        }
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filters, page, reloadKey]);

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  }

  const pagination = result?.pagination;
  const logs = result?.data || [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Persisted gateway traffic"
        title="Activity logs"
        description="Completed proxied requests, persisted in MongoDB with sensitive query values redacted."
        actions={<RefreshButton onClick={() => setReloadKey((value) => value + 1)} loading={loading} />}
      />
      <ErrorBanner message={error} />
      <Panel title="Filters" description="Filters are applied by the gateway database query.">
        <form className="route-form" onSubmit={applyFilters}>
          <div className="form-grid">
            <label className="form-field"><span>Method</span><select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}><option value="">All methods</option>{['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((method) => <option key={method}>{method}</option>)}</select></label>
            <label className="form-field"><span>Status code</span><input inputMode="numeric" value={draft.statusCode} onChange={(event) => setDraft({ ...draft, statusCode: event.target.value })} placeholder="e.g. 502" /></label>
            <label className="form-field"><span>Route ID or name</span><input value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value })} /></label>
            <label className="form-field"><span>Outcome</span><select value={draft.success} onChange={(event) => setDraft({ ...draft, success: event.target.value })}><option value="">All outcomes</option><option value="true">Success</option><option value="false">Failure</option></select></label>
            <label className="form-field"><span>From</span><input type="datetime-local" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
            <label className="form-field"><span>To</span><input type="datetime-local" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
            <label className="form-field"><span>Request ID</span><input value={draft.requestId} onChange={(event) => setDraft({ ...draft, requestId: event.target.value })} /></label>
          </div>
          <div className="form-actions"><button className="button button-primary" type="submit">Apply filters</button><button className="button button-secondary" type="button" onClick={() => { setDraft(initialFilters); setFilters(initialFilters); setPage(1); }}>Clear</button></div>
        </form>
      </Panel>
      <Panel title="Request records" description={pagination ? `${pagination.total} matching request(s)` : 'MongoDB-backed completed request records'}>
        {loading && !result ? <div className="loading-state">Loading request logs…</div> : logs.length === 0 ? (
          <EmptyState title={loading ? 'Loading request logs' : 'No request logs found'} description={error ? 'Check the gateway connection and retry.' : 'Completed proxy requests will appear here when available.'} />
        ) : (
          <>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>Time / request ID</th><th>Request</th><th>Route / backend</th><th>Status</th><th>Duration</th><th>Error category</th></tr></thead>
              <tbody>{logs.map((log) => <tr key={log.requestId}>
                <td><strong>{new Date(log.timestamp).toLocaleString()}</strong><small className="cell-subtitle mono-cell">{log.requestId}</small></td>
                <td><strong>{log.method}</strong> <code>{log.path}</code>{log.query?.length ? <small className="cell-subtitle">{log.query.map(({ key, value }) => `${key}=${value}`).join('&')}</small> : null}</td>
                <td>{log.routeName || 'Unmatched'}<small className="cell-subtitle">{log.backendInstanceId || 'No backend selected'}</small></td>
                <td><span className={`status-badge ${log.success ? 'status-good' : 'status-bad'}`}>{log.statusCode} · {log.success ? 'success' : 'failure'}</span></td>
                <td>{log.durationMs} ms</td><td>{log.errorCategory || '—'}</td>
              </tr>)}</tbody>
            </table></div>
            <div className="form-actions">
              <button className="button button-secondary" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <span className="muted-cell">Page {pagination?.page || page} of {pagination?.totalPages || 1}</span>
              <button className="button button-secondary" disabled={loading || !pagination || page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

export default ActivityLogsPage;
