# API Gateway and Reverse Proxy

## Overview

Phase 3 turns the Express application on port `8000` into a working Layer 7 reverse proxy. Client
requests sent to the gateway under a registered API prefix are forwarded to the corresponding
backend microservice. The gateway preserves the request method, path, query string, body, and
headers, and returns the backend response without rewriting successful or validation-error payloads.

The proxy configuration is static for this phase. It is defined in
`gateway/src/config/services.js` from environment variables with local defaults.

## Routing Table

| Gateway path | Upstream service | Upstream URL | Status |
| --- | --- | --- | --- |
| `/api/users` and `/api/users/*` | User Service | `http://localhost:5001` | Routed |
| `/api/products` and `/api/products/*` | Product Service | `http://localhost:5003` | Routed |
| `/api/orders` and `/api/orders/*` | Order Service | `http://localhost:5005` | Routed |
| `/api/payments` and `/api/payments/*` | Payment Service | `http://localhost:5007` | Routed |
| `/api/users` (future instance) | User Service instance 2 | `http://localhost:5002` | Configured, not routed |
| `/health` | Gateway | Local handler | Management endpoint |
| Any other path | Gateway | None | Gateway 404 |

Prefix matching respects path boundaries. `/api/users` and `/api/users/123` are proxied, while
`/api/users-extra` is not. Paths and query strings are not rewritten:

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
| `USER_SERVICE_URL` | `http://localhost:5001` | Primary User Service target |
| `USER_SERVICE_URL_2` | `http://localhost:5002` | Second User Service target, reserved for load balancing |
| `PRODUCT_SERVICE_URL` | `http://localhost:5003` | Product Service target |
| `ORDER_SERVICE_URL` | `http://localhost:5005` | Order Service target |
| `PAYMENT_SERVICE_URL` | `http://localhost:5007` | Payment Service target |

The second User Service instance is present in the registry and visible in `/health`, but it does
not receive traffic in Phase 3.

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

## Proxy Usage

List records through the gateway:

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

Create an order through the gateway:

```bash
curl -X POST http://localhost:8000/api/orders \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"USER_ID\",\"items\":[{\"productId\":\"PRODUCT_ID\",\"quantity\":2,\"price\":109.5}]}"
```

Update an order status:

```bash
curl -X PATCH http://localhost:8000/api/orders/ORDER_ID/status \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"confirmed\"}"
```

Delete a product:

```bash
curl -X DELETE http://localhost:8000/api/products/PRODUCT_ID
```

The gateway forwards `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` requests. It does not transform
request or response bodies.

## Request Flow

1. CORS middleware applies the configured frontend origin.
2. The request logger identifies the target service and records the start time.
3. The proxy router matches the path prefix and forwards the request to the service.
4. Unmatched requests fall through to gateway JSON parsing, `/health`, and the gateway 404 handler.
5. When the backend responds, the status, headers, and body are sent back through the gateway.
6. A completion log records the method, path, service, status, and duration.

Proxy routing is registered before `express.json()` so request bodies are streamed to the backend
instead of being consumed by the gateway. This is required for `POST`, `PUT`, and `PATCH` forwarding.

## Successful Response Handling

The gateway does not wrap or rewrite backend responses. A backend `201 Created`, `200 OK`, or
validation error such as `400`, `404`, or `409` reaches the client with the same status and JSON
payload as a direct service call.

Example proxy request log:

```text
[GATEWAY] 2026-11-10T05:38:45.355Z GET /api/users -> user-service | 200 | 16ms
```

## Failure Handling

If a service cannot be reached, the gateway returns a structured gateway error instead of crashing.

Connection failure example:

```json
{
  "success": false,
  "error": "SERVICE_UNAVAILABLE",
  "message": "User service is currently unavailable",
  "service": "user-service",
  "timestamp": "2026-11-10T05:38:45.355Z"
}
```

Status codes:

| Condition | Gateway status | Error code |
| --- | --- | --- |
| Connection refused, DNS failure, or early connection reset | `502 Bad Gateway` | `SERVICE_UNAVAILABLE` |
| Upstream request exceeds the 10 second proxy timeout | `504 Gateway Timeout` | `GATEWAY_TIMEOUT` |

A timeout example:

```json
{
  "success": false,
  "error": "GATEWAY_TIMEOUT",
  "message": "Product service timed out while processing the request",
  "service": "product-service",
  "timestamp": "2026-11-10T05:38:36.617Z"
}
```

Failure responses do not include stack traces, internal addresses, or raw connection errors. Proxy
failure details are written to the gateway stderr log.

A stopped backend does not stop the gateway. `/health` remains available, and requests succeed again
after the backend restarts. If a backend response has already started, the gateway ends the response
rather than attempting to send a second JSON payload.

## Health Reporting

`GET /health` reports the gateway, database, and configured service registry. It does not poll the
backend services.

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
  "services": [
    {
      "name": "user-service",
      "url": "http://localhost:5001",
      "pathPrefix": "/api/users",
      "routingEnabled": true
    },
    {
      "name": "user-service-2",
      "url": "http://localhost:5002",
      "pathPrefix": "/api/users",
      "routingEnabled": false
    },
    {
      "name": "product-service",
      "url": "http://localhost:5003",
      "pathPrefix": "/api/products",
      "routingEnabled": true
    },
    {
      "name": "order-service",
      "url": "http://localhost:5005",
      "pathPrefix": "/api/orders",
      "routingEnabled": true
    },
    {
      "name": "payment-service",
      "url": "http://localhost:5007",
      "pathPrefix": "/api/payments",
      "routingEnabled": true
    }
  ]
}
```

## Logging

Successful and completed proxy requests are logged to stdout:

```text
[GATEWAY] <timestamp> <METHOD> <originalUrl> -> <service-name> | <status> | <duration>ms
```

Proxy failures are logged to stderr with the failure cause:

```text
[GATEWAY] 2026-11-10T05:38:45.355Z Proxy failure: GET /api/users -> user-service | 502 | 2ms | ECONNREFUSED
```

Query strings are included in the logged request URL. Request headers and bodies are not logged.

## Phase 3 Limitations

The following are intentionally not implemented yet:

- Dynamic route creation or editing through the management API or dashboard.
- Load balancing across User Service instances.
- Retries, circuit breaking, or health-aware target selection.
- Authentication, API keys, rate limiting, and access policies.
- Gateway route and request-metric persistence.
- WebSocket proxying and streaming-specific configuration.

## Verification

Phase 3 was tested through port `8000` with live services:

- `57` proxy checks passed for health metadata, method forwarding, body forwarding, query
  preservation, backend success and error forwarding, prefix boundaries, 502 handling, recovery after
  restart, deletes, and request logging.
- A hanging upstream returned `504 GATEWAY_TIMEOUT` after the configured timeout.
- Test records were removed after the run.
