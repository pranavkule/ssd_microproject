import axios from 'axios';

const gatewayBaseUrl =
  import.meta.env.VITE_GATEWAY_BASE_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8000';

const api = axios.create({
  baseURL: gatewayBaseUrl.replace(/\/+$/, ''),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function getErrorMessage(error) {
  const data = error?.response?.data;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error === 'string') return data.error;
  if (error?.code === 'ECONNABORTED') return 'The gateway request timed out.';
  if (!error?.response) return 'Could not connect to the API gateway.';
  return `Gateway request failed (${error.response.status}).`;
}

export const healthApi = {
  async getHealth(config) {
    const response = await api.get('/health', config);
    return response.data;
  },
};

export const routesApi = {
  async listRoutes(config) {
    const response = await api.get('/api/gateway/routes', config);
    return response.data;
  },
  async getRoute(id, config) {
    const response = await api.get(`/api/gateway/routes/${id}`, config);
    return response.data.data;
  },
  async createRoute(payload) {
    const response = await api.post('/api/gateway/routes', payload);
    return response.data.data;
  },
  async updateRoute(id, payload) {
    const response = await api.put(`/api/gateway/routes/${id}`, payload);
    return response.data.data;
  },
  async setRouteEnabled(id, enabled) {
    const response = await api.patch(`/api/gateway/routes/${id}/toggle`, { enabled });
    return response.data.data;
  },
  async deleteRoute(id) {
    const response = await api.delete(`/api/gateway/routes/${id}`);
    return response.data.data;
  },
  async refreshRegistry() {
    const response = await api.post('/api/gateway/routes/refresh');
    return response.data.data;
  },
};

export const backendApi = {
  async saveInstances(routeId, backendInstances) {
    const response = await api.put(`/api/gateway/routes/${routeId}`, { backendInstances });
    return response.data.data;
  },
};

export const loadBalancingApi = {
  async setStrategy(routeId, loadBalancingStrategy) {
    const response = await api.put(`/api/gateway/routes/${routeId}`, { loadBalancingStrategy });
    return response.data.data;
  },
};

export const requestLogsApi = {
  async list(params) {
    const response = await api.get('/api/gateway/logs', { params });
    return response.data;
  },
};

export const metricsApi = {
  async getMetrics(config) {
    const response = await api.get('/api/gateway/metrics', config);
    return response.data.data;
  },
};

export const configurationApi = {
  async getConfiguration(config) {
    const response = await api.get('/api/gateway/config', config);
    return response.data.data;
  },
  async updateConfiguration(settings) {
    const response = await api.put('/api/gateway/config', settings);
    return response.data.data;
  },
};

export const gatewayApi = {
  ...healthApi,
  ...routesApi,
  ...metricsApi,
};

export default api;
