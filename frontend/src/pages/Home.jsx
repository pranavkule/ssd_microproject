import { useEffect, useState } from 'react';
import { Activity, Database, Network, Server } from 'lucide-react';
import api from '../services/api.js';

const INITIAL_HEALTH = {
  loading: true,
  error: null,
  data: null,
};

function HealthPanel() {
  const [health, setHealth] = useState(INITIAL_HEALTH);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const response = await api.get('/health');
        if (!cancelled) {
          setHealth({ loading: false, error: null, data: response.data });
        }
      } catch (error) {
        if (!cancelled) {
          setHealth({
            loading: false,
            data: null,
            error: error.response?.data?.message || error.message,
          });
        }
      }
    }

    fetchHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  const gatewayOnline = Boolean(health.data);
  const databaseStatus = health.data?.database?.status || 'unknown';
  const databaseConnected = databaseStatus === 'connected';

  return (
    <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Environment Status</h2>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            health.loading
              ? 'bg-slate-800 text-slate-300'
              : gatewayOnline
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-rose-500/15 text-rose-300'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          {health.loading ? 'Checking gateway...' : gatewayOnline ? 'Gateway online' : 'Gateway offline'}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <Server className="h-5 w-5 text-sky-400" />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Gateway API</p>
            <p className="text-sm font-medium text-slate-100">
              {health.loading ? 'Checking...' : gatewayOnline ? health.data.status : 'Unreachable'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <Database className={`h-5 w-5 ${databaseConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">MongoDB</p>
            <p className="text-sm font-medium text-slate-100">
              {health.loading ? 'Checking...' : databaseStatus}
            </p>
          </div>
        </div>
      </div>

      {health.error ? (
        <p className="mt-4 text-sm text-rose-300">
          Could not reach the gateway health endpoint: {health.error}
        </p>
      ) : null}

      {health.data ? (
        <p className="mt-4 text-xs text-slate-400">
          Last checked: {new Date(health.data.timestamp).toLocaleString()}
        </p>
      ) : null}
    </section>
  );
}

function Home() {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <header className="flex items-center gap-3 text-sky-400">
        <span className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2">
          <Network className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold uppercase tracking-[0.2em]">Phase 1</p>
      </header>

      <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl">
        Dynamic L7 API Gateway
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-300">
        The API Gateway dashboard is under development. This environment currently provides the
        project foundation: the React dashboard shell, the Express gateway service, and MongoDB
        connectivity reporting.
      </p>

      <HealthPanel />

      <footer className="mt-10 text-xs text-slate-500">
        Reverse proxy, routing engine, load balancing, and microservices will be implemented in later
        phases.
      </footer>
    </div>
  );
}

export default Home;
