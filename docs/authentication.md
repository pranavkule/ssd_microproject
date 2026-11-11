# Gateway JWT Authentication

## Overview

The gateway optionally verifies signed JWT bearer tokens on a per-route basis. Existing and newly
created routes remain public by default to preserve current behavior; enable authentication on the
route using the route editor or `PUT /api/gateway/routes/:id`. Protected requests fail closed if
the gateway has no valid verification key set.

The gateway accepts RS256 JWTs only. The issuer, audience, required claims, and route-level roles are
validated before a backend is selected. JWT payloads and authorization headers are never added to
gateway logs or persisted request records.

## Route configuration

Routes persist:

```json
{
  "authRequired": true,
  "requiredRoles": ["operator", "auditor"]
}
```

`authRequired` defaults to `false`; `requiredRoles` defaults to an empty array. Role names must be
unique strings (up to 20 values, 1–64 letters, digits, underscores, colons, or hyphens). When roles
are configured, a verified token must contain at least one matching value in `roles` (array) or
`role` (string). Roles are ignored for public routes.

Example runtime update:

```http
PUT /api/gateway/routes/ROUTE_ID
Content-Type: application/json
```

```json
{ "authRequired": true, "requiredRoles": ["operator"] }
```

The existing route-management service persists the change and atomically updates the in-memory
registry. The next request uses the new policy without restarting the gateway. Invalid changes are
rejected before the database or active registry is modified.

## Verification behavior

The proxy matches the route and checks the method before authenticating, then authenticates before
backend selection or proxy forwarding. CORS preflight is answered earlier by the gateway and never
reaches this check.

| Condition | Status | Error |
| --- | ---: | --- |
| Missing or malformed bearer header | 401 | `AUTHENTICATION_REQUIRED` |
| Invalid signature/token, expired token, unsupported algorithm, missing claims, wrong issuer/audience | 401 | `INVALID_TOKEN` |
| Valid token without any configured role | 403 | `INSUFFICIENT_PERMISSIONS` |
| Verification library or key set unavailable | 503 | `AUTH_VERIFICATION_UNAVAILABLE` |
| Route does not require authentication | Normal route behavior | — |

Required claims are non-empty `sub`, numeric `iat`, numeric `exp`, `iss`, and `aud`. Tokens must
match `JWT_ISSUER` and `JWT_AUDIENCE`. The only accepted algorithm is RS256. Failure messages do
not include JWT contents or internal verification details. `401` responses include a
`WWW-Authenticate: Bearer` challenge.

## Local demonstration issuer

The development-only CLI creates a local RSA key pair and issues short-lived, non-admin test tokens.
The private key is written beneath the ignored `gateway/.local-jwt/` directory; it is not exposed
through the gateway or dashboard. The matching public JWKS is used by the local key provider.

```powershell
npm run auth:keys --workspace gateway
npm run auth:token --workspace gateway
```

An optional subject can be supplied as the first argument. The issuer always assigns the fixed
`user` role; it provides no role-selection or administrator-token option. This is a developer
demonstration utility, not an identity provider. Do not use its keys or tokens in production.

To require a role on a route using this demonstration token, set that route's `requiredRoles` to
`["user"]`. A route requiring `admin` will correctly reject the demonstration token.

## Operational cautions

Route-management APIs are existing control-plane endpoints and are not authenticated by this
feature. Keep the gateway management interface on a trusted network or restrict it through the
deployment's network/IAM controls. Do not expose route mutation endpoints directly to untrusted
clients. EC2 deployment and management-plane access controls remain outside this phase.

See [secret-manager.md](secret-manager.md) for key-source setup, AWS IAM guidance, caching, rotation,
and integration-test boundaries.
