# Dynamic L7 API Gateway

A web-based Dynamic Layer 7 API Gateway and Reverse Proxy. The project combines a React management
dashboard with an Express gateway application and MongoDB persistence.

## Project Objective

Build a management platform for configuring and operating a dynamic Layer 7 API gateway. The final
system will support dynamic routing, reverse proxying, load balancing, and monitoring for
independent backend microservices. Phases 1 through 3 are currently implemented: the gateway
foundation, dashboard shell, four backend microservices, and static reverse proxy routing.

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
├── docs/
│   ├── architecture.md
│   ├── gateway.md
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

### Gateway variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8000` | Gateway HTTP port |
| `NODE_ENV` | `development` | Runtime environment |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/dynamic_api_gateway` | MongoDB connection string |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `USER_SERVICE_URL` | `http://localhost:5001` | Primary User Service target |
| `USER_SERVICE_URL_2` | `http://localhost:5002` | Second User Service target, not routed yet |
| `PRODUCT_SERVICE_URL` | `http://localhost:5003` | Product Service target |
| `ORDER_SERVICE_URL` | `http://localhost:5005` | Order Service target |
| `PAYMENT_SERVICE_URL` | `http://localhost:5007` | Payment Service target |

### Frontend variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Gateway base URL used by Axios |

The gateway falls back to the local defaults above when no `.env` file is present. Never commit
actual `.env` files or credentials. Only `.env.example` files belong in version control.

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

The `dynamic_api_gateway` database is created automatically when data is first written. Phase 2
services store records in the `users`, `products`, `orders`, and `payments` collections.

If MongoDB is unavailable, the gateway still starts and `/health` reports
`database.status: "disconnected"`. The gateway logs the connection error and does not crash.

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
| GET | `/health` | Gateway status, timestamp, uptime, MongoDB state, and configured services |

### Gateway Proxy Routes

| Gateway prefix | Upstream target |
| --- | --- |
| `/api/users` | `http://localhost:5001` |
| `/api/products` | `http://localhost:5003` |
| `/api/orders` | `http://localhost:5005` |
| `/api/payments` | `http://localhost:5007` |

The gateway forwards `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`, preserving paths, query strings,
request bodies, response status codes, and response payloads. For example:

```bash
curl http://localhost:8000/api/users?page=1&limit=5
```

Backend validation responses such as `400`, `404`, and `409` are returned unchanged. Unreachable
services return `502`, and upstream timeouts return `504`, with structured JSON gateway errors.

See [docs/gateway.md](docs/gateway.md) for routing details, failure responses, logging, and curl
examples.

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

Example response:

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

Unknown gateway paths return HTTP 404 with a JSON error payload.

The second User Service instance is configured and reported by `/health`, but it does not receive
traffic in Phase 3.

## Current Implementation Status

Phase 1 is implemented:

- Vite React application with Tailwind CSS and React Router.
- Placeholder dashboard home page and 404 page.
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

- Static reverse proxy routing from the gateway to all four microservices.
- Path-prefix matching that preserves full request paths and query strings.
- Forwarding for `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`, including request and response bodies.
- Centralized expression of service targets through environment variables.
- User Service instance 2 configured in the service registry but not routed yet.
- Structured `502` responses for unavailable services and `504` responses for upstream timeouts.
- Proxy request completion and failure logs with service name, status, and duration.
- Extended `/health` reporting for the configured service registry without active backend polling.
- Gateway documentation in [docs/gateway.md](docs/gateway.md).

Not implemented yet:

- Dynamic route creation and management through the dashboard or management API.
- Load balancing across service instances.
- Gateway route and request-metric persistence.
- Dashboard analytics and configuration screens.
- Retries, circuit breaking, authentication, rate limiting, and service-to-service communication.
