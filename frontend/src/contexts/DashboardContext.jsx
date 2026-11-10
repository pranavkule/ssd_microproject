import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { gatewayApi, getErrorMessage } from '../services/api.js';

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [registry, setRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [gatewayUnavailable, setGatewayUnavailable] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const inFlight = useRef(null);
  const mounted = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (inFlight.current) {
      return force ? inFlight.current.then(() => refresh(false)) : inFlight.current;
    }
    setRefreshing(true);
    const request = Promise.allSettled([
      gatewayApi.getHealth(),
      gatewayApi.listRoutes(),
      gatewayApi.getMetrics(),
    ])
      .then(([healthResult, routesResult, metricsResult]) => {
        if (!mounted.current) return;
        const messages = [];
        if (healthResult.status === 'fulfilled') {
          setHealth(healthResult.value);
          setGatewayUnavailable(false);
        } else {
          messages.push(getErrorMessage(healthResult.reason));
          setGatewayUnavailable(true);
        }
        if (routesResult.status === 'fulfilled') {
          setRoutes(routesResult.value.data || []);
          setRegistry(routesResult.value.registry || null);
        } else {
          messages.push(getErrorMessage(routesResult.reason));
        }
        if (metricsResult.status === 'fulfilled') {
          setMetrics(metricsResult.value);
        }
        setError(messages.join(' '));
        if (messages.length === 0) setLastUpdated(new Date());
      })
      .finally(() => {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
        inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const value = {
    health,
    metrics,
    routes,
    registry,
    loading,
    refreshing,
    error,
    gatewayUnavailable,
    lastUpdated,
    refresh,
    setRoutes,
    setRegistry,
  };
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('useDashboard must be used within DashboardProvider');
  return context;
}

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      4200
    );
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.type}`} key={toast.id} role="status">
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
