export const SUPPORTED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
export const LOAD_BALANCING_STRATEGIES = [
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'least_connections', label: 'Least Connections' },
  { value: 'random', label: 'Random' },
];

export function validateRouteDraft(draft) {
  const errors = {};
  if (!draft.name.trim()) errors.name = 'Route name is required.';
  if (draft.name.trim().length > 100) errors.name = 'Route name cannot exceed 100 characters.';
  if (draft.description.length > 500) errors.description = 'Description cannot exceed 500 characters.';

  const path = draft.path.trim();
  if (!path) errors.path = 'Route path is required.';
  else if (!path.startsWith('/')) errors.path = 'Route path must begin with /.';
  else if (/[?#\s\\]/.test(path)) errors.path = 'Route path cannot contain query, fragment, whitespace, or backslash characters.';
  else if (['/health', '/api/gateway'].some((reserved) => path === reserved || path.startsWith(`${reserved}/`))) {
    errors.path = 'Route path conflicts with a reserved gateway endpoint.';
  }
  if (!draft.methods.length) errors.methods = 'Select at least one HTTP method.';
  if (!draft.backendInstances.length) errors.backendInstances = 'At least one backend instance is required.';

  const backendIds = new Set();
  draft.backendInstances.forEach((backend, index) => {
    const key = `backend-${index}`;
    const id = backend.id.trim();
    if (!id && !errors[key]) errors[key] = `Backend ${index + 1} ID is required.`;
    else if (id.length > 100 && !errors[key]) errors[key] = `Backend ${index + 1} ID cannot exceed 100 characters.`;
    else if (backendIds.has(id) && !errors[key]) errors[key] = `Backend ID "${id}" is duplicated.`;
    backendIds.add(id);

    try {
      const target = new URL(backend.target);
      if (!['http:', 'https:'].includes(target.protocol) || !target.hostname || target.search || target.hash) {
        if (!errors[key]) errors[key] = `Backend ${index + 1} target must be an HTTP or HTTPS URL without query or fragment.`;
      }
    } catch {
      if (!errors[key]) errors[key] = `Backend ${index + 1} target must be a valid HTTP or HTTPS URL.`;
    }

    if (backend.weight !== undefined && backend.weight !== null && backend.weight !== '' && (!Number.isInteger(Number(backend.weight)) || Number(backend.weight) < 1) && !errors[key]) {
      errors[key] = `Backend ${index + 1} weight must be a positive integer.`;
    }
    if (backend.healthCheckPath && (!backend.healthCheckPath.startsWith('/') || /[?#]/.test(backend.healthCheckPath)) && !errors[key]) {
      errors[key] = `Backend ${index + 1} health-check path must be an absolute path without query or fragment.`;
    }
  });
  return errors;
}
