const unavailableStatuses = new Set(['offline', 'error', 'unhealthy']);

export function getGatewayConnectionState({ health, error, gatewayUnavailable }) {
  const status = gatewayUnavailable
    ? 'offline'
    : health?.status || (error ? 'offline' : 'checking');
  const unavailable =
    gatewayUnavailable || unavailableStatuses.has(String(status).toLowerCase());

  return {
    status,
    unavailable,
    sidebarLabel: unavailable
      ? 'Gateway disconnected'
      : status === 'checking'
        ? 'Checking gateway connection'
        : 'Connected to gateway API',
  };
}
