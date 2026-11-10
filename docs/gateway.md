# API Gateway and Reverse Proxy

## Overview

The Express gateway on port `8000` is a Layer 7 reverse proxy with a MongoDB-backed dynamic route
registry. Routes are persisted in the `routes` collection and can be managed at runtime through
`/api/gateway/routes`. The gateway keeps an immutable in-memory snapshot of the active routes, so
proxied requests do not query MongoDB for routing decisions.

Phase 4 replaces the static prefix table used in Phase 3. The four default service routes are seeded
on first startup, but administrators can create new routes, change targets, disable routes, and
delete routes without restarting the gateway. Phase 5 extends routes to multiple backend instances
and adds health-aware load balancing.

See [dynamic-routing.md](dynamic-routing.md) for the route model, management API reference, matching
rules, and detailed verification results.

## Middleware Order

The order is important for both body streaming and path isolation:

1. Request ID and completion telemetry (health and `/api/gateway/*` excluded from public metrics/logs).
2. CORS and gateway-handled browser preflight.
3. Gateway management APIs, including routes, logs, metrics, and configuration.
4. `/health`.
5. Dynamic proxy router.
6. Gateway 404 handler and centralized error handler.

Management and health endpoints are registered before the dynamic proxy, so a route path cannot
intercept them. The proxy is registered before any global body parser; request bodies are streamed
to the selected backend instead of being consumed by the gateway.

## Default Routing Table

| Gateway path | Upstream service | Upstream URL | Methods |
| --- | --- | --- | --- |
| `/api/users` and `/api/users/*` | User Service | `http://localhost:5001`, `http://localhost:5002` | `GET, HEAD, POST, PUT, DELETE` |
| `/api/products` and `/api/products/*` | Product Service | `http://localhost:5003` | `GET, HEAD, POST, PUT, DELETE` |
| `/api/orders` and `/api/orders/*` | Order Service | `http://localhost:5005` | `GET, POST, PATCH, DELETE` |
| `/api/payments` and `/api/payments/*` | Payment Service | `http://localhost:5007` | `GET, POST` |
| `/health` | Gateway | Local handler | Management endpoint |
| `/api/gateway/routes` | Gateway route management API | Local handler | Management endpoints |
| Any other path | None | None | Structured gateway `404` |

Prefix matching respects path boundaries. `/api/users` and `/api/users/123` match the User Service
route, while `/api/users-extra` does not. When multiple routes match, the longest path wins.

Default routes preserve paths and query strings because `stripPrefix` is `false`:

```text
GET http://localhost:8000/api/users?page=1&limit=5
  -> GET http://localhost:5001/api/users?page=1&limit=5
```

## Environment Variables

Copy `gateway/.env.example` to `gateway/.env` and adjust values if needed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | Gateway HTTP port |
| `NODE_ENV` | `development` | Runtime environment |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/dynamic_api_gateway` | Gateway database connection |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `USER_SERVICE_URL` | `http://localhost:5001` | Default User Service route target |
| `USER_SERVICE_URL_2` | `http://localhost:5002` | Second backend instance for the default User Service route |
| `PRODUCT_SERVICE_URL` | `http://localhost:5003` | Default Product Service route target |
| `ORDER_SERVICE_URL` | `http://localhost:5005` | Default Order Service route target |
| `PAYMENT_SERVICE_URL` | `http://localhost:5007` | Default Payment Service route target |
| `BACKEND_HEALTH_CHECK_PATH` | `/health` | Default health-check path requested on each backend |
| `BACKEND_HEALTH_CHECK_INTERVAL_MS` | `5000` | Delay between periodic backend health checks |
| `BACKEND_HEALTH_CHECK_TIMEOUT_MS` | `1500` | Timeout for one backend health check |
| `BACKEND_HEALTH_CHECK_FAILURE_THRESHOLD` | `2` | Consecutive failures before a backend becomes unhealthy |
| `BACKEND_HEALTH_CHECK_RECOVERY_THRESHOLD` | `1` | Consecutive successes before an unhealthy backend recovers |
| `GATEWAY_PROXY_TIMEOUT_MS` | `10000` | Default timeout for one upstream request; can be changed through config API |

Service URL variables are used only when seeding missing default routes. Once a route exists, its
persisted target is authoritative and is changed through the management API.

## Running

Start the microservices and gateway from the project root. The frontend is optional for proxy
testing.

```bash
npm run dev:services   # user 5001, product 5003, order 5005, payment 5007
npm run dev:gateway    # gateway 8000
```

Or start the full stack:

```bash
npm run dev:all        # frontend, gateway, services, and both User Service instances
```

`npm run dev` starts only the frontend and gateway. The proxy routes require the backend services
to be running separately.

On startup the gateway connects to MongoDB, creates missing default routes, loads the registry, and
then begins listening. If MongoDB is unavailable, the gateway still starts and reports a registry
error instead of crashing.

## Management API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/gateway/routes` | List routes and registry statistics |
| `GET` | `/api/gateway/routes/:id` | Get a route |
| `POST` | `/api/gateway/routes` | Create a route |
| `PUT` | `/api/gateway/routes/:id` | Update route fields |
| `PATCH` | `/api/gateway/routes/:id/toggle` | Toggle or explicitly set enabled state |
| `DELETE` | `/api/gateway/routes/:id` | Delete a route |
| `POST` | `/api/gateway/routes/refresh` | Reload routes from MongoDB |
| `GET` | `/api/gateway/logs` | Query persisted completed proxy request records |
| `GET` | `/api/gateway/metrics` | Read current-process public proxy traffic metrics |
| `GET` | `/api/gateway/config` | Read effective runtime settings and their source |
| `PUT` | `/api/gateway/config` | Persist and apply supported timeout/health-check settings |

Create a route:

```bash
curl -X POST http://localhost:8000/api/gateway/routes \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Catalog API\",\"path\":\"/catalog\",\"target\":\"http://localhost:5010\",\"methods\":[\"GET\",\"POST\"],\"stripPrefix\":false}"
```

Change its target:

```bash
curl -X PUT http://localhost:8000/api/gateway/routes/ROUTE_ID \
  -H "Content-Type: application/json" \
  -d "{\"target\":\"http://localhost:5011\"}"
```

Disable it:

```bash
curl -X PATCH http://localhost:8000/api/gateway/routes/ROUTE_ID/toggle \
  -H "Content-Type: application/json" \
  -d "{\"enabled\":false}"
```

## Proxy Usage

List records through the default routes:

```bash
curl http://localhost:8000/api/users?page=1&limit=5
curl http://localhost:8000/api/products?page=1&limit=5
curl http://localhost:8000/api/orders?page=1&limit=5
curl http://localhost:8000/api/payments?page=1&limit=5
```

Create a user through the gateway:

```bash
curl -X POST http://localhost:8000/api/users \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Asha Patel\",\"email\":\"asha@example.com\",\"role\":\"user\"}"
```

Update an order status:

```bash
curl -X PATCH http://localhost:8000/api/orders/ORDER_ID/status \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"confirmed\"}"
```

The gateway forwards configured `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`
requests. Default routes include `HEAD` wherever their backend supports `GET`; the response has no
body, as required for HEAD. It does not transform request or response bodies.

Browser CORS preflight requests (an `OPTIONS` request containing `Origin` and
`Access-Control-Request-Method`) are handled by the gateway's CORS middleware and are not forwarded
upstream. An explicit upstream `OPTIONS` request is forwarded when the route allows `OPTIONS` and
the request is not a browser preflight.

## Request Flow

1. CORS middleware handles browser preflight before proxy matching and applies the configured
   frontend origin.
2. Management and health paths are handled before the proxy.
3. The dynamic proxy router finds the longest active route prefix.
4. A method mismatch returns `405` with an `Allow` header.
5. A matching request records the route name and start time, then streams to the route target.
6. The target's status, headers, and body are returned through the gateway.
7. A request ID is returned in `X-Request-Id`; completed public requests update process metrics and
   are persisted asynchronously when MongoDB is available.

Paths and query strings are preserved unless the route has `stripPrefix: true`. With
`stripPrefix: true`, the matched route path is removed and the target pathname is retained:

```text
Route path:    /public/users
Target:        http://localhost:5001/api/users
Request:       /public/users/123?active=true
Forwarded URL: http://localhost:5001/api/users/123?active=true
```

## Successful Response Handling

The gateway does not wrap or rewrite backend responses. A backend `201 Created`, `200 OK`, or
validation error such as `400`, `404`, or `409` reaches the client with the same status and JSON
payload as a direct service call.

Example proxy request log:

```text
[GATEWAY] 2026-11-10T05:38:45.355Z GET /api/users -> User Service | 200 | 16ms
```

## Failure Handling

If a service cannot be reached, the gateway returns a structured error instead of crashing.

Connection failure example:

```json
{
  "success": false,
  "error": "SERVICE_UNAVAILABLE",
  "message": "Catalog API is currently unavailable",
  "route": "Catalog API",
  "service": "Catalog API",
  "timestamp": "2026-11-10T05:38:45.355Z"
}
```

Status codes:

| Condition | Gateway status | Error code |
| --- | --- | --- |
| No active route matches | `404 Not Found` | `ROUTE_NOT_FOUND` |
| Path matches but the method is not allowed | `405 Method Not Allowed` | `METHOD_NOT_ALLOWED` |
| Connection refused, DNS failure, or early connection reset | `502 Bad Gateway` | `SERVICE_UNAVAILABLE` |
| Upstream request exceeds the 10 second proxy timeout | `504 Gateway Timeout` | `GATEWAY_TIMEOUT` |

A timeout example:

```json
{
  "success": false,
  "error": "GATEWAY_TIMEOUT",
  "message": "Product Service timed out while processing the request",
  "route": "Product Service",
  "service": "Product Service",
  "timestamp": "2026-11-10T05:38:36.617Z"
}
```

Failure responses do not include stack traces, internal addresses, or raw connection errors. Proxy
failure details are written to the gateway stderr log.

A stopped backend does not stop the gateway. `/health` remains available, and requests succeed again
after the backend restarts. If a backend response has already started, the gateway ends the response
rather than attempting to send a second JSON payload.

## Database Failure Behavior

The registry has three failure cases:

- **MongoDB unavailable at startup:** the gateway starts, `routeRegistry.status` is `error`, the
  registry is empty, management endpoints return `503 SERVICE_UNAVAILABLE`, and unmatched proxy
  requests return `404`.
- **MongoDB lost after a successful load:** the previous route snapshot stays active, so proxied
  requests continue to work. Management endpoints return `503`, and health reports
  `stale: true` after the failure is observed.
- **MongoDB recovers:** call `POST /api/gateway/routes/refresh` to reload the registry and clear the
  stale state. If the registry was never loaded, refresh also seeds missing defaults.

If a management write succeeds in MongoDB but the in-memory snapshot cannot be updated, the gateway
attempts a full reload and returns a recovery message when it cannot recover.

## Health Reporting

`GET /health` reports the gateway, database, dynamic route registry, and current route/backend
health. Its service list and per-route backend list are derived from the current route snapshot
(including disabled routes), so deletion and updates cannot leave stale service entries. The
`loadBalancing` section includes configured, disabled, healthy, and unhealthy backend counts.
Backend credentials are redacted. Health checks run in the background and do not block
proxy request handling.

```json
{
  "application": "Dynamic L7 API Gateway",
  "status": "running",
  "environment": "development",
  "timestamp": "2026-11-10T05:38:40.000Z",
  "uptimeSeconds": 12,
  "database": {
    "status": "connected",
    "readyState": 1,
    "name": "dynamic_api_gateway"
  },
  "routeRegistry": {
    "status": "loaded",
    "totalRoutes": 4,
    "enabledRoutes": 4,
    "disabledRoutes": 0,
    "lastLoadedAt": "2026-11-10T05:38:40.000Z",
    "lastError": null,
    "stale": false
  },
  "loadBalancing": {
    "totalBackends": 5,
    "disabledBackends": 0,
    "healthyBackends": 5,
    "unhealthyBackends": 0
  },
  "services": [
    {
      "name": "user-service",
      "url": "http://localhost:5001",
      "pathPrefix": "/api/users",
      "routingEnabled": true
    }
  ]
}
```

The response also includes `routes`, with each configured backend's health state and the route's
load-balancing strategy.

## Request Logs, Metrics, and Runtime Configuration

Completed proxied and unmatched public requests are stored in the shared MongoDB database through
`GatewayRequestLog`. Query values for sensitive key names (tokens, passwords, credentials, etc.) are
redacted. Request headers and bodies are not recorded. MongoDB write failures are logged and do not
block or fail the proxy response. The `/health` endpoint and gateway-management API calls are
excluded from request logs and traffic metrics.

`GET /api/gateway/logs` supports `method`, `statusCode`, `route`, `success`, inclusive `from`/`to`
dates, `requestId`, and bounded `page`/`limit` filters. It returns `data` and total/page metadata;
invalid filters return 400 and a disconnected database returns 503. See [database.md](database.md)
for the complete filter table and response example.

`GET /api/gateway/metrics` reports total, successful, failed, active, status-code, per-route, and
average-duration counters for the current process only. Metrics are in memory, exclude management
and health polling, and reset on restart; they are not historical log aggregates.

`GET` and `PUT /api/gateway/config` read and update only supported timeout and backend health-check
settings. Configuration is stored in the `gatewayconfigurations` collection and applied to the
running proxy and health monitor immediately. When MongoDB is unavailable, the gateway uses
environment defaults or its in-memory database cache, and rejects configuration writes with 503.

## Console Logging

Registry changes are logged to stdout:

```text
[ROUTES] Initialized default route: User Service
[ROUTES] Default route initialization complete: 4 created, 0 existing
[ROUTES] Registry loaded: 4 routes (4 enabled)
[ROUTES] Created route: Catalog API
[ROUTES] Updated route: Catalog API
[ROUTES] Disabled route: Catalog API
[ROUTES] Deleted route: Catalog API
[ROUTES] Registry refreshed successfully
```

Successful and completed proxy requests are also logged to stdout:

```text
[GATEWAY] <timestamp> <METHOD> <originalUrl> -> <route-name> | <status> | <duration>ms
```

Proxy failures are logged to stderr with the failure cause:

```text
[GATEWAY] 2026-11-10T05:38:45.355Z Proxy failure: GET /api/users -> User Service | 502 | 2ms | ECONNREFUSED
```

Safe query strings may be included in the console URL, with sensitive query values redacted.
Request headers and bodies are not logged.

## Phase 5 Limitations

The following are intentionally not implemented yet:

- Retries and circuit breaking.
- Authentication, API keys, rate limiting, and access policies.
- Historical request metrics and long-term retention policies.
- WebSocket proxying and streaming-specific configuration.
- The optional backend `weight` value is configuration metadata; Round Robin, Least Connections,
  and Random do not use weighted selection.

## Tests

Run unit, validation, registry, and live local proxy tests without MongoDB using
`npm run test:unit` from the repository root. Run the separate MongoDB-backed management,
persistence, seeding, and recovery test with `GATEWAY_TEST_MONGODB_URI` set to a reachable MongoDB
server (`npm run test:integration`). The integration suite creates and drops a unique test database;
without the variable the integration test is skipped.

The test suite uses Node's built-in test runner. Check its output for the actual pass, failure, and
skip counts for the current run.

The integration suite requires a reachable MongoDB server and creates/drops a unique database; do
not point `GATEWAY_TEST_MONGODB_URI` at a database containing user data.
