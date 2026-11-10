const http = require('node:http');
const https = require('node:https');
const env = require('../config/env');
const { redactTarget } = require('../utils/routeValidation');

function statusKey(routeId, backendId) {
  return `${routeId}:${backendId}`;
}

function createHealthMonitor(options = {}) {
  let config = {
    checkPath: options.checkPath || env.healthCheckPath,
    intervalMs: options.intervalMs || env.healthCheckIntervalMs,
    timeoutMs: options.timeoutMs || env.healthCheckTimeoutMs,
    failureThreshold:
      options.failureThreshold || env.healthCheckFailureThreshold,
    recoveryThreshold:
      options.recoveryThreshold || env.healthCheckRecoveryThreshold,
  };
  const states = new Map();
  const configuredBackends = new Map();
  const inFlightChecks = new Map();
  let timer = null;

  function logStateChange(route, backend, previousStatus, nextStatus) {
    if (previousStatus === nextStatus) {
      return;
    }

    const change =
      nextStatus === 'healthy'
        ? 'recovered'
        : nextStatus === 'unhealthy'
          ? 'unhealthy'
          : nextStatus;
    console.log(
      `[HEALTH] ${route.name} backend ${backend.id} (${redactTarget(backend.target)}) is ${change}`
    );
  }

  function checkTarget(target, healthCheckPath) {
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = new URL(healthCheckPath, target);
      } catch (error) {
        reject(error);
        return;
      }

      const request = (url.protocol === 'https:' ? https : http).get(
        url,
        { timeout: config.timeoutMs },
        (response) => {
          response.resume();
          response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve();
              return;
            }
            reject(new Error(`Health endpoint returned ${response.statusCode}`));
          });
        }
      );

      request.on('timeout', () => {
        request.destroy(new Error('Backend health check timed out'));
      });
      request.on('error', reject);
    });
  }

  function getStatus(route, backend) {
    if (!route.enabled || !backend.enabled) {
      return {
        status: 'disabled',
        healthy: false,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastHealthCheckAt: null,
        lastError: null,
      };
    }

    const state = states.get(statusKey(route._id, backend.id));
    if (!state || state.target !== backend.target) {
      return {
        status: 'unknown',
        healthy: false,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastHealthCheckAt: null,
        lastError: null,
      };
    }

    return {
      status: state.healthy ? 'healthy' : state.status,
      healthy: state.healthy,
      consecutiveFailures: state.consecutiveFailures,
      consecutiveSuccesses: state.consecutiveSuccesses,
      lastHealthCheckAt: state.lastHealthCheckAt,
      lastError: state.lastError,
    };
  }

  async function checkBackend(route, backend) {
    if (!route.enabled || !backend.enabled) {
      return getStatus(route, backend);
    }

    const key = statusKey(route._id, backend.id);
    let state = states.get(key);
    if (!state || state.target !== backend.target) {
      state = {
        target: backend.target,
        status: 'unknown',
        healthy: false,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastHealthCheckAt: null,
        lastError: null,
        checking: null,
      };
      states.set(key, state);
    }

    if (inFlightChecks.has(key)) {
      return inFlightChecks.get(key);
    }

    const previousStatus = state.healthy ? 'healthy' : state.status;
    const check = (async () => {
      try {
        const path = backend.healthCheckPath || config.checkPath;
        await checkTarget(backend.target, path);
        state.consecutiveSuccesses += 1;
        state.consecutiveFailures = 0;
        state.lastError = null;

        if (state.consecutiveSuccesses >= config.recoveryThreshold) {
          state.healthy = true;
          state.status = 'healthy';
        }
      } catch (error) {
        state.consecutiveFailures += 1;
        state.consecutiveSuccesses = 0;
        state.lastError = error.message.startsWith('Health endpoint returned')
          ? error.message
          : error.message === 'Backend health check timed out'
            ? error.message
            : 'Backend health check failed';

        if (state.consecutiveFailures >= config.failureThreshold) {
          state.healthy = false;
          state.status = 'unhealthy';
        }
      } finally {
        state.lastHealthCheckAt = new Date().toISOString();
        state.checking = null;
        inFlightChecks.delete(key);
        if (states.get(key) === state) {
          logStateChange(
            route,
            backend,
            previousStatus,
            state.healthy ? 'healthy' : state.status
          );
        } else {
          const current = configuredBackends.get(key);
          if (current) {
            void checkBackend(current.route, current.backend);
          }
        }
      }

      return getStatus(route, backend);
    })();

    state.checking = check;
    inFlightChecks.set(key, check);
    return check;
  }

  function syncRoutes(routes) {
    const configured = new Map();

    for (const route of routes) {
      for (const backend of route.backendInstances || []) {
        const key = statusKey(route._id, backend.id);
        if (!route.enabled || !backend.enabled) {
          const previous = states.get(key);
          if (previous) {
            logStateChange(
              route,
              backend,
              previous.healthy ? 'healthy' : previous.status,
              'disabled'
            );
          }
          configuredBackends.delete(key);
          states.delete(key);
          continue;
        }

        configured.set(key, { route, backend });
        configuredBackends.set(key, { route, backend });
        const existing = states.get(key);
        if (!existing || existing.target !== backend.target) {
          states.set(key, {
            target: backend.target,
            status: 'unknown',
            healthy: false,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            lastHealthCheckAt: null,
            lastError: null,
            checking: null,
          });
          void checkBackend(route, backend);
        }
      }
    }

    for (const key of states.keys()) {
      if (!configured.has(key)) {
        states.delete(key);
      }
    }
    for (const key of configuredBackends.keys()) {
      if (!configured.has(key)) {
        configuredBackends.delete(key);
      }
    }
  }

  async function checkAll() {
    const checks = [];
    for (const { route, backend } of configuredBackends.values()) {
      checks.push(checkBackend(route, backend));
    }
    await Promise.all(checks);
  }

  function start(routes) {
    syncRoutes(routes);
    if (!timer) {
      timer = setInterval(() => {
        void checkAll();
      }, config.intervalMs);
      timer.unref();
    }
    return checkAll();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function updateConfiguration(updates) {
    config = { ...config, ...updates };
    if (timer) {
      clearInterval(timer);
      timer = setInterval(() => {
        void checkAll();
      }, config.intervalMs);
      timer.unref();
    }
    return { ...config };
  }

  function getConfiguration() {
    return { ...config };
  }

  function getBackendHealth(route, backend) {
    return getStatus(route, backend);
  }

  function getStatuses(routes) {
    return routes.flatMap((route) =>
      (route.backendInstances || []).map((backend) => ({
        routeId: route._id,
        backendId: backend.id,
        ...getStatus(route, backend),
      }))
    );
  }

  return {
    checkAll,
    checkBackend,
    getBackendHealth,
    getStatuses,
    start,
    stop,
    syncRoutes,
    updateConfiguration,
    getConfiguration,
  };
}

module.exports = createHealthMonitor();
module.exports.createHealthMonitor = createHealthMonitor;
