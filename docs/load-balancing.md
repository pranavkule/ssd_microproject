# Backend Instances, Load Balancing, and Health

## Configuration

A route may contain multiple backend instances and a per-route strategy. The existing `target`
property remains supported for compatibility and mirrors the first configured backend.

```json
{
  "name": "Catalog API",
  "path": "/catalog",
  "backends": [
    { "id": "catalog-a", "target": "http://localhost:5010", "enabled": true },
    { "id": "catalog-b", "target": "http://localhost:5011", "enabled": true }
  ],
  "loadBalancingStrategy": "round_robin",
  "methods": ["GET", "HEAD"]
}
```

`backendInstances` is also accepted instead of `backends`; `strategy` is an alias for
`loadBalancingStrategy`. Backend IDs should remain stable across updates. A backend can include an
optional `healthCheckPath` to override the global path and a `weight` value for metadata/future
compatibility. Weight does not affect the current strategies.

Routes created with only the legacy `target` field are normalized to a single backend. Default route
initialization migrates existing default routes to backend configuration without overwriting their
customized targets or other route settings.

## Strategies

Only enabled routes and enabled, healthy backend instances are eligible:

- **Round Robin** selects eligible backends in stable ID order, rotating for each request.
- **Least Connections** selects the eligible backend with the fewest active proxied requests.
  Active counts are released when the client response finishes or closes.
- **Random** selects uniformly from the eligible backends.

If a route has no eligible backend, the gateway returns a structured `503 SERVICE_UNAVAILABLE`
response. A failed backend request can still return the existing `502` or `504` response if its
health monitor has not yet reached the unhealthy threshold.

## Health Monitoring

The monitor sends HTTP GET requests to each enabled backend's health endpoint. A check succeeds only
for a `2xx` response. Runtime state includes `unknown`, `healthy`, `unhealthy`, or `disabled`, the
last-check time, failure/recovery counters, and a sanitized error. Runtime health is kept in memory
and exposed in the route-management response and `/health`; it is not written to MongoDB.

Default settings can be overridden in `gateway/.env`:

| Variable | Default | Description |
| --- | --- | --- |
| `BACKEND_HEALTH_CHECK_PATH` | `/health` | Health-check path |
| `BACKEND_HEALTH_CHECK_INTERVAL_MS` | `5000` | Period between checks |
| `BACKEND_HEALTH_CHECK_TIMEOUT_MS` | `1500` | Per-check timeout |
| `BACKEND_HEALTH_CHECK_FAILURE_THRESHOLD` | `2` | Failures before removing a backend from selection |
| `BACKEND_HEALTH_CHECK_RECOVERY_THRESHOLD` | `1` | Successes before restoring an unhealthy backend |

Per-backend `healthCheckPath` overrides the global path. Disabled backends and backends on disabled
routes are not polled. Registry updates synchronize monitor state immediately; newly configured
backends are checked, and removed or disabled backends stop participating.

## Default Multi-Instance Route

The default User Service route has two backend instances:

| Backend ID | Default target |
| --- | --- |
| `user-1` | `USER_SERVICE_URL` (`http://localhost:5001`) |
| `user-2` | `USER_SERVICE_URL_2` (`http://localhost:5002`) |

Other default service routes each have one backend. Their routing behavior and HTTP methods remain
unchanged. See [gateway.md](gateway.md) for all service URLs and [dynamic-routing.md](dynamic-routing.md)
for matching and management API behavior.

## Testing

The unit suite covers deterministic strategy selection, connection accounting, health transitions,
proxy error paths, and route validation:

```bash
npm run test:unit
```

The MongoDB integration suite covers startup migration, API persistence, refresh, process restart,
and database recovery. Set `GATEWAY_TEST_MONGODB_URI` to a reachable MongoDB server and run
`npm run test:integration`. It creates and drops a unique database; never use a URI pointing at data
that must be retained.
