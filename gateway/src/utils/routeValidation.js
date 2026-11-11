const { randomUUID } = require('node:crypto');

const SUPPORTED_HTTP_METHODS = Object.freeze([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

const LOAD_BALANCING_STRATEGIES = Object.freeze([
  'round_robin',
  'least_connections',
  'random',
]);

const SUPPORTED_HTTP_METHOD_SET = new Set(SUPPORTED_HTTP_METHODS);
const LOAD_BALANCING_STRATEGY_SET = new Set(LOAD_BALANCING_STRATEGIES);
const RESERVED_PATH_PREFIXES = Object.freeze(['/health', '/api/gateway']);
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.exposed = true;
  return error;
}

function pathMatchesPrefix(pathname, prefix) {
  if (prefix === '/') {
    return typeof pathname === 'string' && pathname.startsWith('/');
  }

  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalizeName(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createHttpError(400, 'Route name is required');
  }

  const name = value.trim();

  if (name.length > 100) {
    throw createHttpError(400, 'Route name cannot exceed 100 characters');
  }

  return name;
}

function normalizePath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createHttpError(400, 'Route path is required');
  }

  let path = value.trim();

  if (!path.startsWith('/')) {
    throw createHttpError(400, 'Route path must begin with "/"');
  }

  if (path.includes('?') || path.includes('#')) {
    throw createHttpError(400, 'Route path must not contain query parameters or fragments');
  }

  if (/\s/.test(path) || path.includes('\\')) {
    throw createHttpError(400, 'Route path must not contain whitespace or backslashes');
  }

  path = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');

  if (!path) {
    path = '/';
  }

  if (RESERVED_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix))) {
    throw createHttpError(400, 'Route path conflicts with a reserved gateway endpoint');
  }

  return path;
}

function normalizeTarget(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createHttpError(400, 'Route target is required');
  }

  const target = value.trim();
  let parsed;

  try {
    parsed = new URL(target);
  } catch (error) {
    throw createHttpError(400, 'Route target must be a valid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createHttpError(400, 'Route target must use the http or https protocol');
  }

  if (!parsed.hostname) {
    throw createHttpError(400, 'Route target must include a hostname');
  }

  if (parsed.search || parsed.hash) {
    throw createHttpError(400, 'Route target must not contain query parameters or fragments');
  }

  return target;
}

function redactTarget(value) {
  try {
    const target = new URL(value);
    target.username = '';
    target.password = '';
    return target.toString();
  } catch (error) {
    return '';
  }
}

function normalizeMethods(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createHttpError(400, 'Methods must be a non-empty array');
  }

  const methods = [];

  for (const method of value) {
    if (typeof method !== 'string' || !method.trim()) {
      throw createHttpError(400, 'Each HTTP method must be a non-empty string');
    }

    const normalizedMethod = method.trim().toUpperCase();

    if (!SUPPORTED_HTTP_METHOD_SET.has(normalizedMethod)) {
      throw createHttpError(400, `Unsupported HTTP method: ${method}`);
    }

    if (!methods.includes(normalizedMethod)) {
      methods.push(normalizedMethod);
    }
  }

  return methods;
}

function withImplicitHeadSupport(methods) {
  if (!Array.isArray(methods)) {
    return methods;
  }

  const nextMethods = [...methods];
  if (nextMethods.includes('GET') && !nextMethods.includes('HEAD')) {
    nextMethods.push('HEAD');
  }

  return nextMethods;
}

function routeAllowsMethod(route, method) {
  if (!route || !method) {
    return false;
  }

  const requestMethod = String(method).toUpperCase();
  const supported = withImplicitHeadSupport(route.methods || []);

  if (supported.includes(requestMethod)) {
    return true;
  }

  if (requestMethod === 'HEAD' && supported.includes('GET')) {
    return true;
  }

  return false;
}

function normalizeDescription(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    throw createHttpError(400, 'Description must be a string');
  }

  const description = value.trim();

  if (description.length > 500) {
    throw createHttpError(400, 'Description cannot exceed 500 characters');
  }

  return description;
}

function normalizeBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw createHttpError(400, `${fieldName} must be a boolean`);
  }

  return value;
}

function normalizeRoles(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw createHttpError(400, 'requiredRoles must be an array of at most 20 roles');
  }
  const roles = [];
  for (const role of value) {
    if (typeof role !== 'string' || !/^[A-Za-z0-9:_-]{1,64}$/.test(role.trim())) {
      throw createHttpError(400, 'Each required role must be 1-64 letters, digits, or _:-');
    }
    const normalized = role.trim();
    if (!roles.includes(normalized)) roles.push(normalized);
  }
  return roles;
}

function normalizeStrategy(value) {
  const strategy = value === undefined ? 'round_robin' : value;

  if (!LOAD_BALANCING_STRATEGY_SET.has(strategy)) {
    throw createHttpError(
      400,
      `Unsupported load-balancing strategy: ${strategy}`
    );
  }

  return strategy;
}

function normalizeBackendInstances(value, fallbackTarget) {
  const instances =
    value === undefined
      ? fallbackTarget
        ? [{ id: 'primary', target: fallbackTarget }]
        : null
      : value;

  if (!Array.isArray(instances) || instances.length === 0) {
    throw createHttpError(400, 'At least one backend instance is required');
  }

  const ids = new Set();
  return instances.map((instance) => {
    if (!instance || typeof instance !== 'object' || Array.isArray(instance)) {
      throw createHttpError(400, 'Each backend instance must be a JSON object');
    }

    const id =
      instance.id === undefined || instance.id === null
        ? randomUUID()
        : String(instance.id).trim();

    if (!id || id.length > 100) {
      throw createHttpError(400, 'Backend instance id must be 1-100 characters');
    }

    if (ids.has(id)) {
      throw createHttpError(400, `Duplicate backend instance id: ${id}`);
    }
    ids.add(id);

    const normalized = {
      id,
      target: normalizeTarget(instance.target),
      enabled:
        instance.enabled === undefined
          ? true
          : normalizeBoolean(instance.enabled, 'backend enabled'),
    };

    if (instance.weight !== undefined) {
      if (!Number.isInteger(instance.weight) || instance.weight < 1) {
        throw createHttpError(400, 'Backend weight must be a positive integer');
      }
      normalized.weight = instance.weight;
    }

    if (instance.healthCheckPath !== undefined) {
      if (
        typeof instance.healthCheckPath !== 'string' ||
        !instance.healthCheckPath.startsWith('/') ||
        instance.healthCheckPath.includes('?') ||
        instance.healthCheckPath.includes('#')
      ) {
        throw createHttpError(400, 'Backend healthCheckPath must be an absolute path');
      }
      normalized.healthCheckPath = instance.healthCheckPath;
    }

    return normalized;
  });
}

function assertValidPayloadObject(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createHttpError(400, 'Request body must be a JSON object');
  }
}

function validateCreatePayload(payload) {
  assertValidPayloadObject(payload);

  const backendValue = payload.backends ?? payload.backendInstances;
  const target =
    payload.target === undefined ? undefined : normalizeTarget(payload.target);
  const backendInstances = normalizeBackendInstances(backendValue, target);

  return {
    name: normalizeName(payload.name),
    path: normalizePath(payload.path),
    target: backendInstances[0].target,
    backendInstances,
    loadBalancingStrategy: normalizeStrategy(
      payload.loadBalancingStrategy ?? payload.strategy
    ),
    methods: normalizeMethods(payload.methods),
    description: normalizeDescription(payload.description),
    enabled:
      payload.enabled === undefined ? true : normalizeBoolean(payload.enabled, 'enabled'),
    stripPrefix:
      payload.stripPrefix === undefined
        ? false
        : normalizeBoolean(payload.stripPrefix, 'stripPrefix'),
    authRequired:
      payload.authRequired === undefined
        ? false
        : normalizeBoolean(payload.authRequired, 'authRequired'),
    requiredRoles: normalizeRoles(payload.requiredRoles),
  };
}

function validateUpdatePayload(payload) {
  assertValidPayloadObject(payload);

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    updates.name = normalizeName(payload.name);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'path')) {
    updates.path = normalizePath(payload.path);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'target')) {
    updates.target = normalizeTarget(payload.target);
  }

  const backendValue = payload.backends ?? payload.backendInstances;
  if (backendValue !== undefined) {
    updates.backendInstances = normalizeBackendInstances(backendValue);
    updates.target = updates.backendInstances[0].target;
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, 'loadBalancingStrategy') ||
    Object.prototype.hasOwnProperty.call(payload, 'strategy')
  ) {
    updates.loadBalancingStrategy = normalizeStrategy(
      payload.loadBalancingStrategy ?? payload.strategy
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'methods')) {
    updates.methods = normalizeMethods(payload.methods);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    updates.description = normalizeDescription(payload.description);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'enabled')) {
    updates.enabled = normalizeBoolean(payload.enabled, 'enabled');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'stripPrefix')) {
    updates.stripPrefix = normalizeBoolean(payload.stripPrefix, 'stripPrefix');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'authRequired')) {
    updates.authRequired = normalizeBoolean(payload.authRequired, 'authRequired');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'requiredRoles')) {
    updates.requiredRoles = normalizeRoles(payload.requiredRoles);
  }

  if (Object.keys(updates).length === 0) {
    throw createHttpError(400, 'No valid route fields were provided for update');
  }

  return updates;
}

function assertValidObjectId(value) {
  if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value)) {
    throw createHttpError(400, 'Invalid route id');
  }
}

function normalizeRegistryRoute(route) {
  if (!route || typeof route !== 'object') {
    throw createHttpError(500, 'Route registry received an invalid route');
  }

  const id = route._id || route.id;

  if (!id) {
    throw createHttpError(500, 'Route registry received a route without an id');
  }

  const target = normalizeTarget(
    route.target ||
      (Array.isArray(route.backendInstances) &&
        route.backendInstances[0] &&
        route.backendInstances[0].target)
  );
  const backendInstances = normalizeBackendInstances(
    route.backendInstances,
    target
  );

  return {
    _id: String(id),
    id: String(id),
    name: normalizeName(route.name),
    path: normalizePath(route.path),
    target,
    backendInstances,
    loadBalancingStrategy: normalizeStrategy(route.loadBalancingStrategy),
    methods: normalizeMethods(route.methods),
    description: normalizeDescription(route.description),
    enabled: normalizeBoolean(route.enabled, 'enabled'),
    stripPrefix: normalizeBoolean(route.stripPrefix, 'stripPrefix'),
    authRequired:
      route.authRequired === undefined
        ? false
        : normalizeBoolean(route.authRequired, 'authRequired'),
    requiredRoles: normalizeRoles(route.requiredRoles),
    createdAt: route.createdAt ? new Date(route.createdAt).toISOString() : null,
    updatedAt: route.updatedAt ? new Date(route.updatedAt).toISOString() : null,
  };
}

function serializeRoute(route) {
  const source =
    route && typeof route.toObject === 'function' ? route.toObject() : route;
  return normalizeRegistryRoute(source);
}

module.exports = {
  SUPPORTED_HTTP_METHODS,
  RESERVED_PATH_PREFIXES,
  createHttpError,
  pathMatchesPrefix,
  normalizeName,
  normalizePath,
  normalizeTarget,
  redactTarget,
  normalizeMethods,
  withImplicitHeadSupport,
  routeAllowsMethod,
  normalizeDescription,
  normalizeBoolean,
  normalizeRoles,
  normalizeStrategy,
  normalizeBackendInstances,
  LOAD_BALANCING_STRATEGIES,
  validateCreatePayload,
  validateUpdatePayload,
  assertValidObjectId,
  normalizeRegistryRoute,
  serializeRoute,
};
