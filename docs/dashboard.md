# Administrator Dashboard

## Overview

The React dashboard at `http://localhost:5173` is the administration UI for the gateway at
`http://localhost:8000`. The gateway is the frontend's only backend entry point. The UI reads
operational state from `/health` and MongoDB-backed route configuration from
`/api/gateway/routes`; it does not keep a separate copy of route or backend configuration.

Health and route data are polled every five seconds with concurrent refreshes deduplicated. A manual
refresh control is available in the top bar. The UI shows the last successful refresh time and
retains the last known data with an error message if a later request fails.

## Navigation

| Page | Path | Purpose |
| --- | --- | --- |
| Overview | `/` | Gateway/database status, route/backend totals, and current-process request metrics |
| Routes | `/routes` | Search/filter routes, create/edit/detail, enable/disable, delete, refresh registry |
| Route details | `/routes/:id` | Full route configuration and its backends |
| Backend instances | `/backends` | Add/edit/enable/disable/remove instances configured under routes |
| Load balancing | `/load-balancing` | Configure per-route supported strategy and see gateway-reported eligible backends |
| Health monitoring | `/health` | Gateway, MongoDB, registry, and backend health-check details |
| Activity logs | `/activity-logs` | Search and paginate actual persisted request records |
| Gateway settings | `/settings` | Retrieve and update supported persistent runtime settings |

Metrics show current-process request counts only; no historical traffic distribution is fabricated.

## API Integration

The Axios instance and API functions are in `frontend/src/services/api.js`. Its base URL is
`VITE_GATEWAY_BASE_URL`, falling back to the existing `VITE_API_BASE_URL` alias and then
`http://localhost:8000`.

| Dashboard operation | Gateway API |
| --- | --- |
| Gateway and backend health | `GET /health` |
| List routes | `GET /api/gateway/routes` |
| Route details | `GET /api/gateway/routes/:id` |
| Create route | `POST /api/gateway/routes` |
| Update route or backend pool | `PUT /api/gateway/routes/:id` |
| Enable/disable route | `PATCH /api/gateway/routes/:id/toggle` |
| Delete route | `DELETE /api/gateway/routes/:id` |
| Refresh runtime registry | `POST /api/gateway/routes/refresh` |
| Activity logs and filters | `GET /api/gateway/logs` |
| Current process metrics | `GET /api/gateway/metrics` |
| Read runtime configuration | `GET /api/gateway/config` |
| Persist and apply runtime configuration | `PUT /api/gateway/config` |

Backend instance and load-balancing functions use the route `PUT` API because the gateway has no
separate backend or strategy endpoints. HTTP status/error messages returned by the gateway are
shown in notifications. Gateway validation remains authoritative.

`/health` provides `routeRegistry`, `loadBalancing`, per-route backend health, and the compatibility
`services` summary. Route list/detail responses include `backendInstances`, each with runtime
`health` status, counters, last check, and sanitized error. Eligibility is calculated from route
enabled state, backend enabled state, and the latest backend health monitor result. The UI does not
set health state or invent metrics.

## Route Management Workflow

1. Open **Routes** and optionally search by route name/path or filter enabled state.
2. Select **Create route** or edit an existing route.
3. Configure path, methods, enabled state, strip-prefix behavior, strategy, backend instances, and
   optional JWT authentication/required roles.
4. Save to persist through the gateway API. Successful changes take effect through the runtime
   registry without a gateway restart.
5. Inspect the route detail page or use route enable/disable and confirmed delete actions.
6. Use **Refresh registry** to reload runtime routes from MongoDB if needed.

Client-side checks cover required fields, URL/path shape, duplicate backend IDs, supported
configuration, and role-name syntax. Gateway responses are still authoritative for validation,
reserved paths, duplicate names/paths, MongoDB availability, and conflicts. Route details display
whether authentication is enabled and any required roles.

The dashboard never receives or displays verification keys, signing keys, AWS credentials, or
bearer tokens. Route-management APIs remain existing control-plane endpoints; protect their network
access when deploying outside a trusted development environment.

## Backend Instance Workflow

The **Backend instances** page flattens configured backend pools from the current route list.
Instances can be added, edited, enabled, disabled, or removed using route updates. Since a route must
retain at least one backend, the final configured instance cannot be removed; disable it or edit its
target instead. Changes are saved to MongoDB through the gateway, then the dashboard refreshes its
health and route data.

Targets and health-check paths come from actual API data. Optional `weight` is labelled as
informational: the current gateway strategies do not use weighted selection.

## Load-Balancing Workflow

The **Load balancing** page supports `round_robin`, `least_connections`, and `random`. Choose a
strategy for a route and save it; the UI calls `PUT /api/gateway/routes/:id` and reloads the route
and health data. The page lists backend eligibility from the gateway's latest health response.

No historical distribution charts are shown. The Overview displays actual in-memory process totals,
successful/failed request counts, status-code counts, and average latency from
`/api/gateway/metrics`. The API also returns active-request and per-route counters for API consumers.

## Health Monitoring Workflow

The **Health monitoring** page displays gateway status, MongoDB connection, registry status/stale
state, and each backend's enabled/health/eligibility state, last health check, and consecutive
failures. The gateway is the source of truth. Its health monitor excludes a backend after the
configured failure threshold and restores it after the configured recovery threshold. Refreshing
the page requests current health; it does not alter backend health.

## Activity Logs

The Activity Logs page reads completed public/proxy traffic from
`GET /api/gateway/logs`, with server-side method, status, route, outcome, date, and request-ID
filters plus pagination. `/health` and gateway management requests are excluded. Request headers
and bodies are not stored; sensitive query values are redacted. MongoDB unavailability produces an
explicit API error rather than fabricated log rows.

## Gateway Settings

Gateway Settings uses `GET /api/gateway/config` and partial updates through `PUT
/api/gateway/config`. It exposes only upstream timeout and backend health-check interval, timeout,
failure-threshold, and recovery-threshold controls. Values are range-validated, persisted in
MongoDB, and applied at runtime. Environment defaults remain active when MongoDB is unavailable;
updates are disabled until persistence is available.

## Environment Configuration

Copy `frontend/.env.example` to `frontend/.env` to override the API host:

```dotenv
VITE_GATEWAY_BASE_URL=http://localhost:8000
```

`VITE_API_BASE_URL` remains supported for existing development setups. The UI never calls individual
microservices directly.

## Development, Tests, and Build

From the repository root, start only the dashboard and gateway with `npm run dev`, or start the full
stack, including MongoDB-dependent microservices and both User Service instances, with:

```bash
npm run dev:all
```

Run the frontend validation unit tests and production build:

```bash
npm run test:frontend
npm run build:frontend
```

Gateway tests remain independent:

```bash
npm run test:unit
$env:GATEWAY_TEST_MONGODB_URI = "mongodb://127.0.0.1:27017"
npm run test:integration
```

The MongoDB integration suite creates and drops a unique test database. Set its URI only to a
dedicated test server; do not use a database containing user data.
See [database.md](database.md) for log schema, endpoint filters, metrics lifetime, configuration
ranges, and MongoDB failure behavior.
See [authentication.md](authentication.md) for route-authentication behavior and
[secret-manager.md](secret-manager.md) for AWS/local key-provider configuration.
