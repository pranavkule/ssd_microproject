const env = require('../config/env');
const { createHttpError } = require('../utils/routeValidation');
const { jwtSecretProvider } = require('./jwtSecretProvider');

const ALLOWED_ALGORITHMS = Object.freeze(['RS256']);

function authError(statusCode, errorCode, message, challenge = false) {
  const error = createHttpError(statusCode, message);
  error.errorCode = errorCode;
  error.wwwAuthenticate = challenge;
  return error;
}

function createJwtAuthenticator(options = {}) {
  const configuration = options.configuration || env;
  const secretProvider = options.secretProvider || jwtSecretProvider;
  const importJose = options.importJose || (() => import('jose'));
  let jose;
  let resolver;
  let resolverJwks;

  async function initialize() {
    if (jose) return true;
    try {
      jose = await importJose();
      return true;
    } catch (error) {
      console.error(`[AUTH] JWT verification library unavailable: ${error.name || 'Error'}`);
      return false;
    }
  }

  async function authorize(request, route) {
    if (!route.authRequired) return;
    if (
      !ALLOWED_ALGORITHMS.includes(configuration.jwtAlgorithm) ||
      !configuration.jwtIssuer ||
      !configuration.jwtAudience ||
      !(await initialize())
    ) {
      throw authError(
        503,
        'AUTH_VERIFICATION_UNAVAILABLE',
        'Authentication verification is unavailable'
      );
    }

    const jwks = secretProvider.getJwks();
    if (!jwks) {
      throw authError(
        503,
        'AUTH_VERIFICATION_UNAVAILABLE',
        'Authentication verification is unavailable'
      );
    }

    const authorization = request.headers.authorization;
    const match = typeof authorization === 'string'
      ? /^Bearer ([^\s]+)$/i.exec(authorization)
      : null;
    if (!match) {
      throw authError(
        401,
        'AUTHENTICATION_REQUIRED',
        'A valid bearer token is required',
        true
      );
    }

    try {
      if (resolverJwks !== jwks) {
        resolver = jose.createLocalJWKSet(jwks);
        resolverJwks = jwks;
      }
      const { payload } = await jose.jwtVerify(match[1], resolver, {
        algorithms: [configuration.jwtAlgorithm],
        issuer: configuration.jwtIssuer,
        audience: configuration.jwtAudience,
        requiredClaims: ['sub', 'iat', 'exp', 'iss', 'aud'],
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        throw new Error('Required claims are invalid');
      }
      const requiredRoles = route.requiredRoles || [];
      if (requiredRoles.length) {
        const tokenRoles = Array.isArray(payload.roles)
          ? payload.roles.filter((role) => typeof role === 'string')
          : typeof payload.role === 'string'
            ? [payload.role]
            : [];
        if (!requiredRoles.some((role) => tokenRoles.includes(role))) {
          throw authError(403, 'INSUFFICIENT_PERMISSIONS', 'Insufficient permissions');
        }
      }
      request.gatewayIdentity = { subject: payload.sub };
    } catch (error) {
      if (error.statusCode === 403) throw error;
      throw authError(401, 'INVALID_TOKEN', 'The bearer token is invalid', true);
    }
  }

  return { initialize, authorize };
}

const jwtAuthenticator = createJwtAuthenticator();

module.exports = {
  ALLOWED_ALGORITHMS,
  createJwtAuthenticator,
  jwtAuthenticator,
};
