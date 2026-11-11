# Dynamic L7 API Gateway

A web-based Dynamic Layer 7 API Gateway and Reverse Proxy. The project combines a React management
dashboard with an Express gateway application and MongoDB persistence.

## Project Objective

Build a management platform for configuring and operating a dynamic Layer 7 API gateway. Phases 1
through 8 cover the gateway foundation, backend microservices, dynamic route management, load
balancing, backend health monitoring, administrator dashboard, database-backed observability, and
optional route-level JWT verification with AWS Secrets Manager public-key retrieval. Phase 9 adds a
manual single-EC2 deployment option for AWS Academy without changing the local development workflow.

## Technology Stack

### Frontend

- React
- Vite
- JavaScript (JSX)
- Tailwind CSS
- React Router DOM
- Axios
- Lucide React
- Recharts

### Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- dotenv
- cors
- http-proxy-middleware
- jose
- AWS SDK for JavaScript v3 (`@aws-sdk/client-secrets-manager`)
- nodemon

### Development Tools

- Git
- npm
- Postman
- VS Code

## Folder Structure

```text
dynamic-api-gateway/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
├── gateway/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── services/
│   ├── user-service/          (port 5001, also runs on 5002)
│   ├── product-service/       (port 5003)
│   ├── order-service/         (port 5005)
│   └── payment-service/       (port 5007)
│       Each service contains src/config, controllers, models, routes,
│       services, middleware, app.js, server.js, .env.example, package.json
├── database/
├── deployment/
│   ├── nginx/
│   ├── scripts/
│   └── systemd/
├── docs/
│   ├── architecture.md
│   ├── aws-deployment.md
│   ├── database.md
│   ├── dynamic-routing.md
│   ├── gateway.md
│   ├── authentication.md
│   ├── secret-manager.md
│   ├── microservices.md
│   └── postman/
│       └── microservices.postman_collection.json
├── .gitignore
├── README.md
└── package.json
```

## Prerequisites

- Node.js 20.19 or newer
- npm 10 or newer
- MongoDB 6 or newer, running locally or reachable through a connection string
- Git

## Installation

Run the following from the project root:

```bash
npm install
```

The root package uses npm workspaces, so this command installs dependencies for the root, the
frontend, and the gateway.

## Environment Configuration

Copy the example environment files before running the project.

Gateway:

```bash
copy gateway\.env.example gateway\.env
```

Frontend:

```bash
copy frontend\.env.example frontend\.env
```

On macOS or Linux use `cp` instead of `copy`.

## Optional AWS Academy single-EC2 deployment

Phase 9 provides a manual AWS Console runbook and an Ubuntu installer for hosting Nginx, the React
dashboard, gateway, all five service processes, and MongoDB on one EC2 instance. **No AWS resources
have been provisioned and no cloud deployment has been verified.** The setup needs only SSH/HTTP
ingress from approved client CIDRs and does not create custom IAM roles or require Secrets Manager.
The deployment uses a local demo JWT key pair by explicit configuration. Read
[docs/aws-deployment.md](docs/aws-deployment.md) for Academy constraints, setup, operations,
backups, and safe cleanup. Review the current lab credits and instance availability; no fixed cost
estimate is claimed. HTTP is for a trusted academic demo only.

### Gateway variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8000` | Gateway HTTP port |
| `GATEWAY_HOST` | `127.0.0.1` | Gateway bind address; deployment keeps it on loopback behind Nginx |
| `NODE_ENV` | `development` | Runtime environment |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/dynamic_api_gateway` | MongoDB connection string |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `USER_SERVICE_URL` | `http://localhost:5001` | Primary User Service target |
| `USER_SERVICE_URL_2` | `http://localhost:5002` | Second User Service backend target |
| `PRODUCT_SERVICE_URL` | `http://localhost:5003` | Product Service target |
| `ORDER_SERVICE_URL` | `http://localhost:5005` | Order Service target |
| `PAYMENT_SERVICE_URL` | `http://localhost:5007` | Payment Service target |
| `GATEWAY_PROXY_TIMEOUT_MS` | `10000` | Default timeout for upstream requests; can be changed through the configuration API |
| `JWT_ISSUER` | `dynamic-api-gateway` | Expected JWT issuer |
| `JWT_AUDIENCE` | `dynamic-api-gateway` | Expected JWT audience |
| `JWT_ALGORITHM` | `RS256` | Only supported JWT signing algorithm |
| `JWT_ALLOW_LOCAL_JWKS` | `false` in production | Explicitly allows the local JWKS provider; set only for the single-host demo when Secrets Manager is not used |
| `AWS_REGION` | unset | AWS region when using Secrets Manager |
| `AWS_SECRET_NAME` | unset | AWS Secrets Manager name or ARN containing public JWKS |
| `JWT_LOCAL_JWKS_PATH` | local public JWKS path | Local verification keys when AWS is not configured |
| `JWT_DEMO_PRIVATE_KEY_PATH` | `gateway/.local-jwt/private.pem` | Local-only private key path for the demo issuer |
| `JWT_SECRET_REFRESH_INTERVAL_MS` | `300000` | Public JWKS refresh interval; last good keys remain active on failures |

### Frontend variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Gateway base URL used by Axios |

The gateway falls back to the local defaults above when no `.env` file is present. AWS credentials
and secret values must not be stored in `.env`; the AWS SDK uses its standard credential provider
chain, including an EC2 IAM role. Local development may use the generated public JWKS provider.
Never commit actual `.env` files or credentials.

## MongoDB Setup

### Windows service

Check the service:

```powershell
Get-Service MongoDB
```

Start it if it is stopped:

```powershell
Start-Service MongoDB
```

Verify the port is listening:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 27017
```

### Run MongoDB manually

If MongoDB is installed but not registered as a service:

```powershell
New-Item -ItemType Directory -Path "C:\data\db" -Force
& "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath "C:\data\db"
```

Adjust the version in the path to match your installation.

The `dynamic_api_gateway` database is created automatically when data is first written. The gateway
stores route definitions in the `routes` collection. Phase 2 services store records in the `users`,
`products`, `orders`, and `payments` collections.

If MongoDB is unavailable, the gateway still starts and `/health` reports
`database.status: "disconnected"` and `routeRegistry.status: "error"`. Management route endpoints
return `503`; the gateway logs the connection error and does not crash.

## Running the Project

### Start frontend and gateway together

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Gateway: http://localhost:8000

`npm run dev` starts the dashboard and gateway only. Start the microservices with
`npm run dev:services` in another terminal before using the proxy routes, or use `npm run dev:all`
for the full stack.

The dashboard defaults to `http://localhost:8000` as its gateway API. Set
`VITE_GATEWAY_BASE_URL` in `frontend/.env` to override it; `VITE_API_BASE_URL` remains supported as
a compatibility alias. See [docs/dashboard.md](docs/dashboard.md) for dashboard workflows and API
behavior.

### Start individually

Gateway:

```bash
npm run dev:gateway
```

Frontend:

```bash
npm run dev:frontend
```

Production-style gateway start:

```bash
npm run start:gateway
```

Frontend production build:

```bash
npm run build:frontend
```

### Start microservices

```bash
npm run dev:services   # user (5001), product (5003), order (5005), payment (5007)
npm run dev:user       # User Service on 5001
npm run dev:user:2     # second User Service instance on 5002
npm run dev:product    # Product Service on 5003
npm run dev:order      # Order Service on 5005
npm run dev:payment    # Payment Service on 5007
npm run dev:all        # frontend, gateway, and all service instances
```

See [docs/microservices.md](docs/microservices.md) for request bodies, response examples, status
transitions, and the Postman collection.

## Available Endpoints

### Gateway Management

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Gateway status, timestamp, uptime, MongoDB state, dynamic route registry, and configured routes |
| GET | `/api/gateway/routes` | List all dynamic routes and registry statistics |
| POST | `/api/gateway/routes` | Create a route |
| GET | `/api/gateway/routes/:id` | Get one route |
| PUT | `/api/gateway/routes/:id` | Update route fields |
| PATCH | `/api/gateway/routes/:id/toggle` | Enable or disable a route |
| DELETE | `/api/gateway/routes/:id` | Delete a route |
| POST | `/api/gateway/routes/refresh` | Reload routes from MongoDB |
| GET | `/api/gateway/logs` | Filter and paginate persisted public proxy request logs |
| GET | `/api/gateway/metrics` | Current-process public traffic metrics (resets on restart) |
| GET | `/api/gateway/config` | Read effective runtime settings and persistence source |
| PUT | `/api/gateway/config` | Persist and immediately apply supported timeout/health-check settings |

### Gateway Proxy Routes

Routes are stored in MongoDB and can be changed at runtime. The gateway seeds these default routes
when they are missing:

| Gateway prefix | Default target | Methods |
| --- | --- | --- |
| `/api/users` | `http://localhost:5001` | `GET, HEAD, POST, PUT, DELETE` |
| `/api/products` | `http://localhost:5003` | `GET, HEAD, POST, PUT, DELETE` |
| `/api/orders` | `http://localhost:5005` | `GET, HEAD, POST, PATCH, DELETE` |
| `/api/payments` | `http://localhost:5007` | `GET, HEAD, POST` |

Routes also accept `authRequired` (default `false`) and `requiredRoles` in the existing create/update
APIs. Default services remain public for backwards compatibility. Configure the route to require a
valid RS256 bearer token before it forwards traffic.

Browser CORS preflight requests are answered by the gateway and are not sent upstream. An explicit
`OPTIONS` request without preflight headers is proxied only when `OPTIONS` is enabled on that route.
Default routes include `HEAD`, and HEAD responses contain no body.

### Local JWT demonstration

```powershell
npm run auth:keys --workspace gateway
npm run auth:token --workspace gateway
```

The local utility creates an ignored RSA private/public key pair and prints a short-lived token with
the fixed `user` role. It is for local demonstration only; the private key is not exposed to the
React app or stored in MongoDB. Configure a route's `requiredRoles` as `["user"]` to accept the
demonstration token. Generate keys before starting the gateway; if it is already running, restart
it or wait for the public-key refresh interval. See [docs/authentication.md](docs/authentication.md) and
[docs/secret-manager.md](docs/secret-manager.md) for role, AWS, IAM, rotation, and testing details.

### Tests

Run the unit and proxy tests without MongoDB:

```bash
npm run test:unit
```

Run the MongoDB-backed management and persistence tests against a dedicated test database by setting
`GATEWAY_TEST_MONGODB_URI` first. The integration suite uses a unique database name and drops it
afterward. Without this variable, the integration test is reported as skipped.

```powershell
$env:GATEWAY_TEST_MONGODB_URI = "mongodb://127.0.0.1:27017"
npm run test:integration
```

Run both suites with `npm test`.
JWT and AWS-provider unit tests run without MongoDB or AWS credentials, using generated keys and a
mock Secrets Manager client. The MongoDB integration suite also verifies route-authentication
changes take effect immediately without restarting the gateway.

Run the frontend tests and production build with:

```bash
npm run test:frontend
npm run build:frontend
```

The deployment smoke test is an end-to-end check for the installed Ubuntu single-EC2 deployment.
It requires MongoDB, Nginx, the gateway, and all five services to be running under systemd; it
creates uniquely marked temporary records and removes them afterward. Run it on the target host
only after reviewing its optional failover mode in
[docs/aws-deployment.md](docs/aws-deployment.md):

```bash
sudo npm run smoke:deployment
```

It does not provision AWS resources. Run it as root because it restarts systemd services to verify
persistence. On Windows or a local development setup without Nginx/systemd, run the gateway
unit/integration suites, frontend tests/build, and service regression checks instead.

The gateway forwards all allowed methods, preserving paths, query strings, request bodies, response
status codes, and response payloads. For example:

```bash
curl http://localhost:8000/api/users?page=1&limit=5
```

Backend validation responses such as `400`, `404`, and `409` are returned unchanged. Unreachable
services return `502`, and upstream timeouts return `504`, with structured JSON gateway errors.
Unmatched paths return `404`; a path match with a disallowed method returns `405` and an `Allow`
header.

Create a route with a runtime target:

```bash
curl -X POST http://localhost:8000/api/gateway/routes \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Catalog API\",\"path\":\"/catalog\",\"target\":\"http://localhost:5010\",\"methods\":[\"GET\",\"POST\"]}"
```

See [docs/gateway.md](docs/gateway.md) for proxy behavior and
[docs/dynamic-routing.md](docs/dynamic-routing.md) for the full route model, management API,
matching rules, and failure recovery.

### Microservices

| Service | Base URL | Main routes |
| --- | --- | --- |
| User Service | `http://localhost:5001` | `/health`, `/api/users` |
| User Service 2 | `http://localhost:5002` | `/health`, `/api/users` |
| Product Service | `http://localhost:5003` | `/health`, `/api/products` |
| Order Service | `http://localhost:5005` | `/health`, `/api/orders` |
| Payment Service | `http://localhost:5007` | `/health`, `/api/payments` |

Gateway health example:

```bash
curl http://localhost:8000/health
```

Example response (timestamps and backend health vary at runtime):

```json
{
  "application": "Dynamic L7 API Gateway",
  "status": "running",
  "environment": "development",
  "timestamp": "2026-11-10T10:00:00.000Z",
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
    "lastLoadedAt": "2026-11-10T10:00:00.000Z",
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
      "name": "User Service",
      "url": "http://localhost:5001",
      "pathPrefix": "/api/users",
      "routingEnabled": true
    },
    {
      "name": "Product Service",
      "url": "http://localhost:5003",
      "pathPrefix": "/api/products",
      "routingEnabled": true
    },
    {
      "name": "Order Service",
      "url": "http://localhost:5005",
      "pathPrefix": "/api/orders",
      "routingEnabled": true
    },
    {
      "name": "Payment Service",
      "url": "http://localhost:5007",
      "pathPrefix": "/api/payments",
      "routingEnabled": true
    }
  ]
}
```

`/health` also includes a `routes` array with each route's strategy and backend health status.
Unknown gateway paths return HTTP 404 with a JSON error payload. The default User Service route
balances across instances on ports `5001` and `5002`.

## Current Implementation Status

Phase 1 is implemented:

- Vite React application with Tailwind CSS and React Router.
- React dashboard application shell, routing, and Axios client foundation.
- Axios client configured through `VITE_API_BASE_URL`.
- Express gateway with JSON parsing, CORS, dotenv, modular `app.js` and `server.js`.
- `GET /health` endpoint with separate MongoDB status.
- Centralized error handling and management endpoint 404 handling.
- MongoDB connection module with error handling and status reporting.
- Root npm workspace scripts using `concurrently`.

Phase 2 is implemented:

- Four independent Express microservices with their own models, routes, controllers, and services.
- User Service supports two simultaneous instances on ports 5001 and 5002.
- MongoDB collections for users, products, orders, and payments.
- Pagination, consistent JSON responses, and centralized error handling.
- User, product, order, and payment validation.
- Server-side order total calculation and status transition rules.
- Payment simulation with generated transaction IDs.
- Root scripts for individual services, all services, both user instances, and the full stack.
- API documentation and Postman collection.

Phase 3 is implemented:

- Static reverse proxy routing to the four microservices.
- Path-prefix matching that preserves full request paths and query strings.
- Forwarding for configured `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` methods,
  including request and response bodies.
- Centralized expression of service targets through environment variables.
- Structured `502` responses for unavailable services and `504` responses for upstream timeouts.
- Proxy request completion and failure logs with service name, status, and duration.
- Gateway documentation in [docs/gateway.md](docs/gateway.md).

Phase 4 is implemented:

- MongoDB `Route` model with unique names and paths, allowed methods, descriptions, enabled state,
  and `stripPrefix` configuration.
- Idempotent startup seeding for the four default service routes without overwriting admin changes.
- Immutable in-memory registry loaded before the gateway starts accepting traffic.
- Route management API for listing, creating, reading, updating, toggling, deleting, and refreshing
  routes.
- Dynamic longest-prefix matching with path-boundary safety.
- Per-route method enforcement with `405` and an `Allow` header.
- Structured `404` for unmatched or disabled routes.
- Runtime target changes and route changes without restarting the gateway.
- Optional `stripPrefix` path rewriting with target pathname retention.
- Registry health reporting through `/health`, including stale state and last error.
- Graceful MongoDB startup failure and runtime loss handling; the previous route snapshot stays
  active and management endpoints return `503` until refresh succeeds.
- Dynamic routing documentation in [docs/dynamic-routing.md](docs/dynamic-routing.md).

Phase 5 is implemented:

- Multiple persisted backend instances per route, while retaining the legacy `target` field.
- Per-route Round Robin, Least Connections, and Random load-balancing strategies.
- Configurable periodic backend health checks and threshold-based recovery/failover.
- Health-aware selection, structured `503` when no configured backend is healthy, and runtime
  backend status/counts through `/health` and the management API.
- Tests for selection, health transitions, persistence, refresh, and MongoDB recovery.
- Load-balancing documentation in [docs/load-balancing.md](docs/load-balancing.md).

Phase 6 is implemented:

- Responsive administrator dashboard overview with live gateway, database, route, and backend
  health data.
- Route list, create/edit/detail, enable/disable, delete confirmation, and registry refresh using the
  existing management API.
- Backend instance add/edit/enable/disable/remove workflows through route updates.
- Per-route load-balancing configuration and latest gateway-reported backend eligibility.
- Health monitoring view with gateway/database/registry status and backend health-check details.
-   - Activity Logs page displays persisted, filtered request records; query values with sensitive key
    names are redacted and headers/bodies are never stored.
  - Overview reports process-local request totals, outcomes, status codes, and average latency.
  - Gateway Settings reads and updates the supported persisted timeout and health-check controls.
  - Dashboard implementation and workflows documented in [docs/dashboard.md](docs/dashboard.md).

  Phase 7 is implemented:

  - MongoDB-backed request logs with bounded filters, pagination, request IDs, and sensitive query
    redaction.
  - In-memory current-process metrics, explicitly separate from historical request records.
  - Persistent gateway timeout and health-check configuration with validated live application.
  - Database and observability details documented in [docs/database.md](docs/database.md).

  Not implemented:

  - Historical/distributed metrics and log retention policies.
  - Retries, circuit breaking, authentication, rate limiting, and service-to-service communication.

Run gateway unit tests without MongoDB using `npm run test:unit` from the repository root. Run the
MongoDB-backed suite with `GATEWAY_TEST_MONGODB_URI` set to a dedicated test server using
`npm run test:integration`. The integration suite creates and drops a unique test database; see
[docs/gateway.md](docs/gateway.md) for details.
Run dashboard validation tests with `npm run test:frontend` and build it with
`npm run build:frontend`.
