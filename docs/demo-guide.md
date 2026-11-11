# Dynamic L7 API Gateway Demonstration

This guide walks through the working project with the existing gateway, dashboard, MongoDB, and
microservices. No cloud account, Redis, or Kubernetes is needed.

## What the parts do

- **L7 reverse proxy:** The gateway receives HTTP requests and forwards them to a selected service.
  It can inspect paths, methods, headers, and status codes because it works at the HTTP application
  layer.
- **Dynamic routing and hot reload:** Route definitions are stored in MongoDB and copied into the
  gateway's runtime registry. Creating or editing a route updates that registry immediately; the
  gateway does not need a restart.
- **JWT authentication:** A protected route requires an RS256-signed bearer token. The gateway
  checks it against public keys from JWKS. The private development key stays on the server.
- **Role-based authorization:** A valid token can still receive `403` if its `role` or `roles`
  claims do not include one of the route's required roles. Missing or invalid tokens receive `401`.
- **Token Bucket rate limiting:** A new client's bucket starts full. Each matched gateway request
  spends one token; tokens return gradually at the configured refill rate. An empty bucket returns
  `429`. Buckets are held in memory on this gateway process.
- **Load balancing:** Round Robin, Least Connections, or Random chooses among enabled, healthy
  backends. Request counters show how many requests were assigned to each backend since process
  start.
- **Health checks and failover:** The gateway periodically requests each backend's health path.
  Unhealthy backends are excluded; when the health checks succeed again, they rejoin the pool.
- **Performance benchmarking:** The script runs the same number of GET requests at the same
  concurrency for each scenario, then writes the measurements it observed to a JSON file.

```text
Browser / API client
        |
        v
  L7 API Gateway ------ MongoDB (routes and settings)
        |
   +----+----+
   v         v
User #1    User #2        Other services
```

## Start the project

From PowerShell in the repository root:

```powershell
cd "C:\Users\Pranav\Desktop\Third_year\system_design\microproject\ssd_microproject"
npm install
Start-Service MongoDB
```

If MongoDB is not installed as a Windows service, start `mongod.exe` with an appropriate data
directory in a separate terminal. Then start the gateway, dashboard, and all service processes:

```powershell
npm run dev:all
```

Open <http://localhost:5173>. The gateway health check is
<http://localhost:8000/health>. `dev:all` starts User Service instances on ports 5001 and 5002.

For a gateway and dashboard without services, use `npm run dev`. For a demo with proxy requests,
start the services too using `npm run dev:services` and `npm run dev:user:2` in separate terminals.

## Demonstrate routing, HEAD, balancing, and failover

1. In the dashboard open **Load balancing**. Find the **User Service** route and choose **Round
   Robin**. The backends should show `user-1` on port 5001 and `user-2` on port 5002 as healthy.
2. Send several requests:

   ```powershell
   1..6 | ForEach-Object { Invoke-RestMethod "http://localhost:8000/api/users" | Out-Null }
   ```

   Refresh the dashboard. The request counts for the two User Service instances should increase.
   The gateway log also records which backend handled each request.
3. Confirm HEAD routing and its empty body:

   ```powershell
   $head = Invoke-WebRequest "http://localhost:8000/api/users" -Method Head
   $head.StatusCode
   $head.Content
   ```

   A successful HEAD request has the GET response headers and no response body.
4. Stop only the second User Service with Ctrl+C in the terminal running it. Wait for the health
   check to mark it unhealthy; refresh **Load balancing** and send more requests. Only the healthy
   instance should receive selections.
5. Restart it with `npm run dev:user:2`. After successful health checks, it becomes eligible again
   and Round Robin distributes requests to both backends.

## Demonstrate dynamic route changes

In the dashboard open **Routes** and create a route using a unique name and path, an existing
healthy backend target such as `http://localhost:5003`, and `GET` as an allowed method. Request the
new path through port 8000 immediately. Then edit its target or disable it and repeat the request.
The next request uses the new configuration without restarting the gateway. Re-enable the route
when finished.

## Demonstrate JWT authentication and roles

Generate the local demo keys once (the command refuses to overwrite an existing key pair):

```powershell
npm run auth:keys --workspace gateway
```

Restart the gateway after key creation so it loads the new public JWKS, then generate a user token:

```powershell
$token = node gateway\scripts\issue-demo-token.js
```

In **Routes**, edit an enabled GET route and set `authRequired` to true with `requiredRoles` set to
`["user"]`. Open **JWT playground**, select that route, and test:

| Playground input | Expected response |
| --- | --- |
| Empty token | `401` — authentication required |
| Text such as `not-a-token` | `401` — invalid token |
| The generated `$token` | Successful response, if the backend is healthy |
| A token with the wrong role | `403` — valid identity, insufficient role |

The development issuer only creates `user` tokens. To demonstrate `403`, set the route's required
role to `admin` and retry with the user token. Set the required role back to `user` to demonstrate
success. A public route with no token should return its normal backend response. Never copy or
expose the private key from `gateway\.local-jwt`.

## Demonstrate rate limiting

Open **Rate limiting**, leave the limiter enabled, and temporarily set a small bucket such as
capacity `3` and refill rate `1`. Save, wait a few seconds for the initial bucket to refill, then
send a quick burst:

```powershell
1..8 | ForEach-Object {
  curl.exe -s -o NUL -w "%{http_code}`n" "http://localhost:8000/api/users"
}
```

The first few requests should succeed and the over-limit requests return `429`. The rejected count
updates on the page. Restore capacity `100` and refill rate `20` after the demo. This simple limiter
is per gateway process; it is not distributed across multiple gateway instances.

## Compare performance

The JWT comparison is most useful on a route with `authRequired: true`. Keep the same route path,
backend, request count, and concurrency for all three scenarios:

```powershell
$token = node gateway\scripts\issue-demo-token.js
node deployment\scripts\benchmark.mjs "http://localhost:5001/api/users" 50 5 `
  --gateway-url "http://localhost:8000" `
  --token $token `
  --output "benchmark-results.json"
```

The report compares direct backend, gateway without JWT, and gateway with a valid JWT. On a
protected route, the no-JWT scenario should show `401` responses, which are counted as failed
requests; this makes the auth overhead comparison explicit, not an all-success throughput contest.
The script prints totals, success/failure counts, throughput, average latency, and p50/p95/p99, then
writes the same observed results to the JSON file. It does not create or claim sample results.

## Stop services

Use Ctrl+C in each terminal running `npm run dev:all`, individual services, or the gateway. For
focused checks, run:

```powershell
npm run test:unit
npm run test:frontend
npm run test:benchmark
npm run build:frontend
```

MongoDB integration tests need a dedicated test database and are run separately with
`GATEWAY_TEST_MONGODB_URI`; see the README.
