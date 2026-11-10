# Gateway Database and Observability

The gateway and the microservices continue to use the same MongoDB database configured by
`MONGODB_URI`. Phase 7 adds two gateway-owned collections; it does not introduce another database.

## Gateway Collections

| Collection | Model | Contents |
|---|---|---|
| `routes` | `Route` | Persisted route, backend pool, method, and balancing configuration. |
| `gatewayrequestlogs` | `GatewayRequestLog` | Completed public/proxy request metadata; no request headers or bodies. |
| `gatewayconfigurations` | `GatewayConfiguration` | Singleton document (`_id: "gateway"`) with supported gateway timeout and health-check settings. |

`GatewayRequestLog` has indexes on unique request ID and on timestamp, status code plus timestamp,
route ID plus timestamp, and route name plus timestamp. Records contain HTTP method, path, sanitized
query key/value pairs, matched route, selected backend ID, timestamp, status, duration, outcome, and
a bounded error category. Authorization headers, cookies, and request/response bodies are not saved.
Sensitive query parameter values (including tokens and passwords) are replaced with `[REDACTED]`.
Proxy console request URLs apply the same query redaction.

Request records are written asynchronously after the response completes. This avoids making response
latency wait for MongoDB. A write failure is warned to stderr and does not crash the gateway or alter
the response. When MongoDB is disconnected, request persistence is skipped; log queries return 503.
Request logs cover public/proxied traffic only: `/health` and `/api/gateway/*` management calls are
excluded to avoid self-logging and dashboard polling noise. Unmatched public requests are logged too.

## Request-log API

`GET /api/gateway/logs` supports:

| Query | Meaning |
|---|---|
| `method` | HTTP method |
| `statusCode` | Exact HTTP status from 100 through 599 |
| `route` | Route ID or exact route name |
| `success` | `true` or `false` |
| `from`, `to` | Inclusive ISO date-time range |
| `requestId` | Exact request ID |
| `page`, `limit` | One-based page and page size; defaults 1 and 50; maximum limit 100 |

Example:

```text
GET /api/gateway/logs?method=GET&statusCode=502&success=false&page=1&limit=25
```

```json
{
  "success": true,
  "message": "Gateway request logs retrieved successfully",
  "data": [],
  "pagination": { "page": 1, "limit": 25, "total": 0, "totalPages": 0 }
}
```

Invalid filters return `400`; unavailable MongoDB returns `503`. The endpoint uses bounded MongoDB
count/find queries and sorts newest first.

## Process metrics

`GET /api/gateway/metrics` returns counters accumulated in the current gateway process for public
traffic: total, successful/failed, active requests, status-code counts, per-route counts, and average
response duration. Each request is counted once at start and completed once at response finish or
client disconnect. Management and health polling are excluded. Values reset on gateway restart and
are not historical or derived from the request-log collection. They continue to describe only the
current process while MongoDB is unavailable.

## Persistent runtime configuration

`GET /api/gateway/config` returns the current supported settings, their source
(`database`, `database_cache`, or `environment_defaults`), and whether persistence is currently
available. `PUT /api/gateway/config` accepts a partial JSON object containing one or more of:

| Setting | Range | Environment fallback |
|---|---:|---|
| `proxyTimeoutMs` | 100–120000 | `GATEWAY_PROXY_TIMEOUT_MS` (10000) |
| `healthCheckIntervalMs` | 250–300000 | `BACKEND_HEALTH_CHECK_INTERVAL_MS` (5000) |
| `healthCheckTimeoutMs` | 100–60000 | `BACKEND_HEALTH_CHECK_TIMEOUT_MS` (1500) |
| `healthCheckFailureThreshold` | 1–20 | `BACKEND_HEALTH_CHECK_FAILURE_THRESHOLD` (2) |
| `healthCheckRecoveryThreshold` | 1–20 | `BACKEND_HEALTH_CHECK_RECOVERY_THRESHOLD` (1) |

Values must be integers within the listed ranges; unknown keys are rejected. A valid update is saved
to MongoDB and immediately applied to the live proxy timeout and health monitor. On initial database
failure, environment defaults remain active. Reads after recovery reload persisted settings; updates
are rejected with 503 until MongoDB is connected. The dashboard exposes only these supported values,
not arbitrary environment variables.

## Testing

Run gateway unit tests without MongoDB:

```bash
npm run test:unit
```

Run database integration tests only against a dedicated MongoDB test server. The suite uses a unique
database name and drops that database during cleanup:

```powershell
$env:GATEWAY_TEST_MONGODB_URI = "mongodb://127.0.0.1:27017"
npm run test:integration
```

Do not set the integration URI to a database containing project or user data.
