# Architecture

## Purpose

The Dynamic L7 API Gateway provides a web-based management dashboard and a Layer 7 reverse proxy
that routes incoming API traffic to independent backend services. Phase 1 establishes the
application skeleton, development tooling, and MongoDB connectivity reporting. Phase 2 adds four
independently runnable backend microservices. Phase 3 connects client traffic to those services
through static reverse proxy routes in the Express gateway.

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
| - CORS and request logging                                       |
| - Static reverse proxy routes                                    |
| - /health management endpoint                                    |
| - Gateway 404 and error handling                                 |
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
| users, products, orders, payments                                |
+------------------------------------------------------------------+
```

The gateway proxies API prefixes to microservices. It also connects to MongoDB for its own health
reporting. The microservices own their domain collections and do not depend on the gateway to run.

## Component Responsibilities

### Frontend Dashboard

The React single-page application is the management interface for the gateway. In Phase 1 it
contains the application shell, routing configuration, a placeholder home page, and an Axios client
that calls the gateway health endpoint.

Planned responsibilities:

- View and manage gateway routes and upstream targets.
- Configure load-balancing strategies.
- Inspect request metrics, logs, and health information.
- Manage API keys or access policies where applicable.

The dashboard does not manage proxy routes yet; Phase 3 routing is defined in gateway configuration.

### Gateway Application

The Express application in `gateway/` receives API traffic, applies static routing rules, and
forwards matching requests to backend services. It also serves the management health endpoint and
the future management API.

Implemented responsibilities:

- Support `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` proxy requests.
- Match API path prefixes and forward the full original path and query string.
- Preserve request bodies, headers, response status codes, headers, and response bodies.
- Report configured services through `/health` without polling them.
- Return structured `502` responses for unreachable services.
- Return structured `504` responses when the upstream exceeds the proxy timeout.
- Log completed and failed proxy requests with service name, status, and duration.
- Continue serving management endpoints while a backend service is unavailable.
- Recover automatically when a backend service restarts.

Proxy configuration lives in `gateway/src/config/services.js`. Each service entry contains a name,
target URL, path prefix, and routing flag. The primary User Service is routed; User Service instance
2 is configured with `routingEnabled: false` for a later load-balancing phase.

Middleware order is deliberate:

1. CORS.
2. Proxy request logging.
3. Proxy routes.
4. JSON and URL-encoded body parsing for non-proxied requests.
5. `/health` management routes.
6. Gateway 404 handling.
7. Centralized gateway error handling.

Proxy routes are registered before body parsing so request bodies are streamed to the target
service. Parsing them in the gateway first would consume the request stream.

Planned responsibilities:

- Dynamic route registration and management APIs.
- Load balancing across service instances.
- Retries, circuit breaking, and health-aware routing.
- Rate limiting, authentication, and access policies.
- Gateway route and request-metric persistence.

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

Phase 3 routes traffic to User Service instance 1, Product Service, Order Service, and Payment
Service. Service-to-service communication remains deferred.

### Database

MongoDB stores gateway configuration and microservice domain data. All services read their connection
string from `MONGODB_URI` and share the `dynamic_api_gateway` database. Phase 2 uses the `users`,
`products`, `orders`, and `payments` collections. The gateway reports its own connection state through
`/health`; it does not aggregate backend database states.

## Proxy Request Flow

```text
Client
  -> Gateway CORS
  -> Proxy request logger
  -> Path-prefix match
  -> Target microservice
  -> Microservice validation / business logic / MongoDB
  -> Response status, headers, and body
  -> Gateway completion log
  -> Client
```

Example:

```text
GET http://localhost:8000/api/users?page=1&limit=5
  -> GET http://localhost:5001/api/users?page=1&limit=5
```

Paths are not rewritten. Prefix matching respects segment boundaries, so `/api/users` and
`/api/users/123` match User Service while `/api/users-extra` does not.

A request that does not match any proxy prefix falls through to the gateway management routes. If it
does not match `/health`, the gateway returns its own `404` response.

## Failure and Timeout Behavior

If a target service refuses a connection or cannot be resolved, the gateway returns `502 Bad
Gateway` with `error: "SERVICE_UNAVAILABLE"`. If the target accepts the connection but does not
respond within 10 seconds, the gateway returns `504 Gateway Timeout` with `error:
"GATEWAY_TIMEOUT"`.

Failure payloads include the failed service name but do not expose stack traces, internal addresses,
or raw connection errors. The gateway logs failure details separately. A stopped service does not
stop the gateway, and proxying resumes after the service restarts.

## Implemented Versus Planned

| Area | Status |
| --- | --- |
| React + Vite dashboard shell | Implemented |
| React Router configuration | Implemented |
| Axios API client | Implemented |
| Tailwind CSS styling | Implemented |
| Express application and server split | Implemented |
| JSON parsing and CORS | Implemented |
| `/health` endpoint | Implemented |
| 404 and centralized error handling | Implemented |
| MongoDB connection module and status reporting | Implemented |
| User, product, order, and payment services | Implemented |
| User Service multi-instance support | Implemented |
| Pagination and CRUD validation | Implemented |
| Static reverse proxy routing | Implemented |
| All primary HTTP method forwarding | Implemented |
| Query string and body preservation | Implemented |
| Proxy logging and 502/504 handling | Implemented |
| Service registry health reporting | Implemented |
| Dynamic route management | Planned |
| Load balancing | Planned |
| Gateway persistence models | Planned |
| Dashboard analytics and route management UI | Planned |
| Retries, circuit breaking, authentication, and rate limiting | Planned |
| Service-to-service communication | Planned |

## Phase Boundaries

Phase 1 added the dashboard, gateway foundation, and database reporting. Phase 2 added independent
microservices with persistence and validation. Phase 3 added the static reverse proxy, service
registry, request logging, and upstream failure handling.

Phase 3 deliberately excludes dynamic route management, load balancing, target health polling,
retries, circuit breaking, authentication, rate limiting, and WebSocket proxying.
