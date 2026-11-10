# Architecture

## Purpose

The Dynamic L7 API Gateway provides a web-based management dashboard and a Layer 7 reverse proxy
that routes incoming API traffic to independent backend services. Phase 1 establishes the
application skeleton, development tooling, and MongoDB connectivity reporting. Phase 2 adds four
independently runnable backend microservices. Phase 3 introduces reverse proxying. Phase 4 replaces
static proxy configuration with a MongoDB-backed dynamic route registry and management API. Phase 5
adds multiple backend instances per route, load balancing, and backend health monitoring.
Phase 6 provides the administrator dashboard. Phase 7 adds persisted request records, process
metrics, and a supported runtime gateway configuration API.

## High-Level Architecture

```text
+----------------------------+          +----------------------------+
| React Dashboard (Vite)     |          | API Clients                |
| http://localhost:5173      |          | curl / Postman / frontend  |
+-------------+--------------+          +-------------+--------------+
              |                                       |
              | Management / health requests           | API requests
              +-------------------+-------------------+
                                  |
                                  v
+------------------------------------------------------------------+
| Express Gateway Application                                      |
| http://localhost:8000                                            |
|                                                                  |
| - Request IDs, CORS, and asynchronous request telemetry           |
| - Dynamic route management API at /api/gateway/routes            |
| - Log, metrics, and configuration management APIs                |
| - In-memory immutable route registry                             |
| - Longest-prefix dynamic reverse proxy                           |
| - /health management endpoint                                    |
| - Gateway 404, 405, and error handling                           |
+------+------------------+------------------+------------------+---+
       |                  |                  |                  |
       | /api/users       | /api/products    | /api/orders      | /api/payments
       v                  v                  v                  v
+--------------+   +---------------+   +--------------+   +---------------+
| User Service |   | Product       |   | Order        |   | Payment       |
| :5001        |   | Service :5003 |   | Service:5005 |   | Service :5007 |
| (also :5002) |   +---------------+   +--------------+   +---------------+
+------+-------+           |                  |                  |
       |                   |                  |                  |
       +-------------------+------------------+------------------+
                                  |
                                  v
+------------------------------------------------------------------+
| MongoDB                                                          |
| dynamic_api_gateway                                              |
| routes, request logs, gateway config, users, products, orders... |
+------------------------------------------------------------------+
```

The gateway reads route definitions from MongoDB at startup and maintains an in-memory snapshot for
request-time matching. The microservices own their domain collections and do not depend on the
gateway to run.

## Component Responsibilities

### Frontend Dashboard

The React single-page application is the management interface for the gateway. It uses the gateway
as its sole API entry point and polls health and route configuration for current operational state.

Implemented responsibilities:

- Review gateway, MongoDB, route, and backend status.
- Create, edit, inspect, enable, disable, delete, and refresh routes.
- Add, edit, enable, disable, and remove route backend instances.
- Configure per-route load-balancing strategies and view currently eligible backends.
- Inspect health-check status, last check, and failure counts.
- Search and paginate persisted activity logs, inspect live process metrics, and edit supported
  gateway timeout/health-check configuration.

Activity logs are backed by the request-log API; they do not contain headers or bodies and sensitive
query values are redacted. Metrics show current-process values only.

### Gateway Application

The Express application in `gateway/` receives API traffic, resolves an active route, and forwards
matching requests to the configured backend. It also serves the health endpoint and the route
management API.

Implemented responsibilities:

- Persist routes in MongoDB with unique names and paths.
- Seed four default service routes when they are missing.
- Load routes into an immutable in-memory snapshot before accepting traffic.
- Manage routes through `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and refresh endpoints.
- Apply route changes immediately without restarting the gateway.
- Match the longest active path prefix with segment-boundary safety.
- Enforce per-route allowed HTTP methods with structured `405` and `Allow` responses.
- Include `HEAD` on default routes backed by GET handlers. Gateway CORS middleware answers browser
  preflight `OPTIONS`; explicitly configured non-preflight OPTIONS requests can reach upstreams.
- Preserve request bodies, headers, response status codes, headers, and response bodies.
- Support optional `stripPrefix` path rewriting.
- Return structured `404` when no active route matches.
- Return structured `502` when a target is unreachable and `504` on upstream timeout.
- Select healthy backends using per-route Round Robin, Least Connections, or Random strategies.
- Monitor backends with configurable health-check thresholds and fail over from unhealthy instances.
- Return structured `503` when no configured backend is healthy and enabled.
- Keep the previous route snapshot active when MongoDB becomes unavailable.
- Report registry state through `/health` and log management changes.
- Persist completed public proxy request metadata asynchronously; expose bounded log filters and
  pagination.
- Maintain in-memory per-process traffic counters and expose their lifetime/reset scope explicitly.
- Persist supported proxy-timeout and health-check settings; apply valid updates at runtime.
- Continue serving management endpoints while a backend service is unavailable.
- Recover automatically when a backend service restarts.

The authoritative route source is the MongoDB `routes` collection. The in-memory registry is the
request-time source and is updated after successful database writes. Route matching and path
rewriting do not query MongoDB per request.

Middleware order is deliberate:

1. Request-ID and completion telemetry middleware. Health and management paths are excluded from
   public traffic logs and metrics.
2. CORS and gateway-handled browser preflight.
3. Gateway management APIs, including route, log, metrics, and configuration endpoints.
4. `/health`.
5. Dynamic proxy router.
6. Gateway 404 and centralized error handling.

Management and health routes are registered before the proxy so a configurable route cannot shadow
them. JSON body parsing is scoped to gateway management endpoints; proxy request bodies are streamed
to the target service.

Planned responsibilities:

- Retries and circuit breaking.
- Rate limiting, authentication, and access policies.
- Historical/distributed metrics and log retention policies.

### Backend Microservices

The `services/` directory contains four independent packages: user, product, order, and payment.
Each has its own Express app, server entry point, routes, controllers, service layer, Mongoose model,
database connection, and error handler. They run independently of the gateway. The User Service can
run as two simultaneous instances on ports 5001 and 5002 from the same source code.

Implemented responsibilities:

- Own their domain data and business logic.
- Run independently behind the gateway.
- Expose HTTP APIs for the gateway to route traffic to.
- Validate input, paginate list endpoints, and return consistent JSON responses.

Default routing balances User Service traffic across instances 1 and 2, and routes traffic to the
Product, Order, and Payment services. Service-to-service communication remains deferred.

### Database

MongoDB stores gateway route configuration and microservice domain data. All services read their
connection string from `MONGODB_URI` and share the `dynamic_api_gateway` database.

Collections:

- `routes`: dynamic gateway route and backend-instance definitions.
- `gatewayrequestlogs`: sanitized completed public request metadata.
- `gatewayconfigurations`: singleton persisted runtime timeout and health-check settings.
- `users`, `products`, `orders`, `payments`: microservice domain data from Phase 2.

The gateway reports its own connection state and route registry state through `/health`; it does not
aggregate backend database states.

## Dynamic Route Flow

```text
Administrator / Dashboard
  -> POST/PUT/PATCH/DELETE /api/gateway/routes
  -> Validate payload and uniqueness
  -> Persist change in MongoDB routes collection
  -> Atomically replace in-memory route snapshot
  -> Next client request uses the new route immediately
```

At startup:

```text
Gateway process
  -> Connect to MongoDB
  -> Create missing default routes
  -> Load all routes into memory
  -> Start listening on port 8000
```

If MongoDB is unavailable, the gateway starts without an active registry, reports an error through
`/health`, and returns `503` from management endpoints until a refresh succeeds.

## Proxy Request Flow

```text
Client
  -> Gateway CORS
  -> Management / health path check
  -> Longest-prefix registry match
  -> Method check
  -> Dynamic target selection
  -> Optional stripPrefix rewrite
  -> Target microservice
  -> Microservice validation / business logic / MongoDB
  -> Response status, headers, and body
  -> Response completion updates process metrics and asynchronously persists a sanitized log
  -> Client
```

Example:

```text
GET http://localhost:8000/api/users?page=1&limit=5
  -> GET http://localhost:5001/api/users?page=1&limit=5
```

Paths are preserved by default. With `stripPrefix: true`, the matched route path is removed and the
target URL pathname is retained. Prefix matching respects segment boundaries, so `/api/users` and
`/api/users/123` match the User Service route while `/api/users-extra` does not.

A request that does not match any active route returns the gateway's own structured `404` and is
never forwarded to an arbitrary target.

## Failure and Timeout Behavior

If a target service refuses a connection or cannot be resolved, the gateway returns `502 Bad
Gateway` with `error: "SERVICE_UNAVAILABLE"`. If the target accepts the connection but does not
respond within 10 seconds, the gateway returns `504 Gateway Timeout` with `error:
"GATEWAY_TIMEOUT"`.

Failure payloads include the route name but do not expose stack traces, internal addresses, or raw
connection errors. The gateway logs failure details separately. A stopped service does not stop the
gateway, and proxying resumes after the service restarts.

If MongoDB is lost after the registry has loaded, proxy routing continues from the frozen snapshot.
Management requests return `503`, health reports `stale: true` after the failure is observed, and a
successful refresh restores normal management behavior.

## Implemented Versus Planned

| Area | Status |
| --- | --- |
| React + Vite dashboard shell | Implemented |
| Gateway overview and live health dashboards | Implemented |
| Route and backend instance management UI | Implemented |
| Load-balancing strategy configuration UI | Implemented |
| Health monitoring UI | Implemented |
| Activity log retrieval UI backed by MongoDB API | Implemented |
| Current-process traffic metrics | Implemented |
| Persistent, runtime-applied gateway settings | Implemented |
| React Router configuration | Implemented |
| Axios API client | Implemented |
| Tailwind CSS styling | Implemented |
| Express application and server split | Implemented |
| CORS and centralized error handling | Implemented |
| `/health` endpoint | Implemented |
| MongoDB connection module and status reporting | Implemented |
| User, product, order, and payment services | Implemented |
| User Service multi-instance support | Implemented |
| Pagination and CRUD validation | Implemented |
| MongoDB route model and persistence | Implemented |
| Dynamic route management API | Implemented |
| Default route seeding | Implemented |
| Immutable in-memory route registry | Implemented |
| Longest-prefix dynamic routing | Implemented |
| Per-route method enforcement and `405` | Implemented |
| Optional `stripPrefix` rewriting | Implemented |
| Proxy logging and `502`/`504` handling | Implemented |
| Redacted request ID and asynchronous persisted request logging | Implemented |
| Registry health reporting, enabled/disabled counts, and stale recovery | Implemented |
| Round Robin, Least Connections, and Random per-route balancing | Implemented |
| Periodic backend health checks and failover/recovery | Implemented |
| Dynamic route management UI | Implemented |
| Historical/distributed analytics | Planned |
| Retries, circuit breaking, authentication, and rate limiting | Planned |
| Service-to-service communication | Planned |

## Phase Boundaries

Phase 1 added the dashboard, gateway foundation, and database reporting. Phase 2 added independent
microservices with persistence and validation. Phase 3 added reverse proxying, request logging, and
upstream failure handling. Phase 4 added MongoDB-backed route management, dynamic target resolution,
path rewriting, method enforcement, registry health reporting, and database failure recovery.
Phase 5 added multiple backends per route, health-aware load balancing, backend status reporting,
and failover/recovery.
Phase 7 added request IDs, sanitized asynchronous request persistence, log query/pagination APIs,
current-process traffic metrics, and MongoDB-backed runtime timeout/health-check settings. Phase 7
does not add authentication, secrets-provider integration, rate limiting, or distributed metrics.

Phases 5–7 deliberately exclude retries, circuit breaking, authentication, rate limiting, and
WebSocket proxying. Metrics are process-local and reset at restart; log persistence depends on
MongoDB availability.

Gateway tests use Node's built-in test runner. Run `npm run test:unit` without MongoDB. The separate
management and persistence suite requires a reachable MongoDB server and an
`GATEWAY_TEST_MONGODB_URI` value; it creates and drops a unique test database. Run it with
`npm run test:integration`. Do not point the test URI at a database containing user data. See
[load-balancing.md](load-balancing.md) for backend selection and monitoring details, and
[dashboard.md](dashboard.md) for the UI and API integration. See [database.md](database.md) for
request logs, metrics, configuration, and test prerequisites.
