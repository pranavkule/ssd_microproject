# Backend Microservices

## Overview

Phase 2 adds four independent Express microservices on top of the Phase 1 gateway and dashboard.
Each service owns its routes, controllers, service logic, Mongoose model, database connection, and
error handler. The services share the `dynamic_api_gateway` MongoDB database but use separate
collections. They do not depend on the API Gateway to run and they do not call each other in this
phase.

Phase 3 also exposes these APIs through the gateway on port `8000`: `/api/users`, `/api/products`,
`/api/orders`, and `/api/payments` proxy to the corresponding service while preserving paths, query
strings, bodies, and response payloads. See [gateway.md](gateway.md) for the proxy behavior. Direct
service URLs remain available for development and verification.

## Services and Ports

| Service | Package name | Default port | MongoDB collection | Responsibility |
| --- | --- | ---: | --- | --- |
| User Service | `dynamic-api-gateway-user-service` | 5001 | `users` | User management |
| User Service instance 2 | same package | 5002 | `users` | Same code, second instance |
| Product Service | `dynamic-api-gateway-product-service` | 5003 | `products` | Product management |
| Order Service | `dynamic-api-gateway-order-service` | 5005 | `orders` | Order management |
| Payment Service | `dynamic-api-gateway-payment-service` | 5007 | `payments` | Payment simulation |

Ports are read from `PORT`; nothing in application logic hardcodes a port.

## Database

All services use this default connection string:

```text
mongodb://127.0.0.1:27017/dynamic_api_gateway
```

Override it with `MONGODB_URI` in the service environment or `.env` file. Each service loads its own
`.env` from its package directory. No credentials are hardcoded.

If MongoDB is unavailable, the HTTP server stays online and `/health` reports
`database.status: "disconnected"`.

## Common API Conventions

Successful collection response:

```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

Successful single-record response:

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "message": "A user with this email already exists",
  "timestamp": "2026-11-10T05:15:00.000Z"
}
```

Pagination uses `?page=1&limit=10`. `page` must be a positive integer. `limit` must be an integer
from 1 to 100. Invalid MongoDB ObjectIds are rejected before any database query.

## Health Checks

Every service exposes `GET /health`.

```bash
curl http://localhost:5001/health
curl http://localhost:5002/health
curl http://localhost:5003/health
curl http://localhost:5005/health
curl http://localhost:5007/health
```

Sample response:

```json
{
  "service": "user-service",
  "status": "running",
  "port": 5001,
  "database": {
    "status": "connected",
    "readyState": 1,
    "name": "dynamic_api_gateway"
  },
  "timestamp": "2026-11-10T05:15:00.000Z"
}
```

## User Service (Port 5001)

### Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Health and database status |
| GET | `/api/users?page=1&limit=10` | List users with pagination |
| GET | `/api/users/:id` | Get one user |
| POST | `/api/users` | Create a user |
| PUT | `/api/users/:id` | Update a user |
| DELETE | `/api/users/:id` | Delete a user |

### Model

`name`, `email` (unique, lowercase), `role` (`user` or `admin`), `createdAt`, `updatedAt`.
Passwords are intentionally omitted in this phase; no real password is stored.

### Create User

```bash
curl -X POST http://localhost:5001/api/users \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Asha Patel\",\"email\":\"asha@example.com\",\"role\":\"user\"}"
```

Response `201 Created`:

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "_id": "665f1c2a9a1b2c3d4e5f6789",
    "name": "Asha Patel",
    "email": "asha@example.com",
    "role": "user",
    "createdAt": "2026-11-10T05:15:00.000Z",
    "updatedAt": "2026-11-10T05:15:00.000Z"
  }
}
```

Duplicate email returns `409 Conflict`. Missing name or email returns `400 Bad Request`.

### Update User

```json
{
  "name": "Asha P. Patel",
  "role": "admin"
}
```

## Product Service (Port 5003)

### Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Health and database status |
| GET | `/api/products?page=1&limit=10` | List products with pagination |
| GET | `/api/products/:id` | Get one product |
| POST | `/api/products` | Create a product |
| PUT | `/api/products/:id` | Update a product |
| DELETE | `/api/products/:id` | Delete a product |

### Model

`name`, `description`, `price`, `category`, `stock`, `createdAt`, `updatedAt`.

- `price` must be greater than or equal to zero.
- `stock` must be a non-negative integer.
- `name`, `price`, `category`, and `stock` are required.

### Create Product

```bash
curl -X POST http://localhost:5003/api/products \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Wireless Mouse\",\"description\":\"2.4 GHz wireless mouse\",\"price\":499.99,\"category\":\"Electronics\",\"stock\":25}"
```

Response `201 Created`:

```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "_id": "665f1c2a9a1b2c3d4e5f6790",
    "name": "Wireless Mouse",
    "description": "2.4 GHz wireless mouse",
    "price": 499.99,
    "category": "Electronics",
    "stock": 25,
    "createdAt": "2026-11-10T05:15:00.000Z",
    "updatedAt": "2026-11-10T05:15:00.000Z"
  }
}
```

## Order Service (Port 5005)

### Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Health and database status |
| GET | `/api/orders?page=1&limit=10` | List orders with pagination |
| GET | `/api/orders/:id` | Get one order |
| POST | `/api/orders` | Create an order |
| PATCH | `/api/orders/:id/status` | Update order status |
| DELETE | `/api/orders/:id` | Delete an order |

### Model

`userId`, `items` (`productId`, `quantity`, `price`), `totalAmount`, `status`, `createdAt`,
`updatedAt`.

The server always calculates `totalAmount` from item quantity and price. A client-supplied
`totalAmount` is ignored.

### Create Order

```bash
curl -X POST http://localhost:5005/api/orders \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"665f1c2a9a1b2c3d4e5f6789\",\"items\":[{\"productId\":\"665f1c2a9a1b2c3d4e5f6790\",\"quantity\":2,\"price\":199.5},{\"productId\":\"665f1c2a9a1b2c3d4e5f6790\",\"quantity\":1,\"price\":50}]}"
```

Response `201 Created` includes `"totalAmount": 449` and `"status": "pending"`.

### Status Transitions

| Current status | Allowed next statuses |
| --- | --- |
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `shipped`, `cancelled` |
| `shipped` | `delivered` |
| `delivered` | none |
| `cancelled` | none |

Update status:

```bash
curl -X PATCH http://localhost:5005/api/orders/ORDER_ID/status \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"confirmed\"}"
```

Invalid status values and invalid transitions return `400 Bad Request`.

## Payment Service (Port 5007)

### Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Health and database status |
| GET | `/api/payments?page=1&limit=10` | List payments with pagination |
| GET | `/api/payments/:id` | Get one payment |
| GET | `/api/payments/order/:orderId` | Get the latest payment for an order |
| POST | `/api/payments` | Simulate a payment |

### Model

`orderId`, `amount`, `paymentMethod`, `status`, `transactionId`, `createdAt`, `updatedAt`.

- `paymentMethod` must be `UPI`, `card`, or `netbanking`.
- `amount` must be greater than zero.
- `transactionId` is generated by the service, for example `TXN-02C9791EDB674C62`.

### Simulate Payment

```bash
curl -X POST http://localhost:5007/api/payments \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"665f1c2a9a1b2c3d4e5f6791\",\"amount\":449,\"paymentMethod\":\"UPI\"}"
```

Response `201 Created`:

```json
{
  "success": true,
  "message": "Payment simulation completed with status \"successful\"",
  "data": {
    "_id": "665f1c2a9a1b2c3d4e5f6792",
    "orderId": "665f1c2a9a1b2c3d4e5f6791",
    "amount": 449,
    "paymentMethod": "UPI",
    "status": "successful",
    "transactionId": "TXN-02C9791EDB674C62",
    "createdAt": "2026-11-10T05:15:00.000Z",
    "updatedAt": "2026-11-10T05:15:00.000Z"
  }
}
```

The simulation returns `successful` approximately 90% of the time and `failed` otherwise. No real
payment provider is contacted and no card details are collected.

## Starting Services

### Individual services

```bash
npm run dev:user       # User Service on 5001
npm run dev:user:2     # Second User Service instance on 5002
npm run dev:product    # Product Service on 5003
npm run dev:order      # Order Service on 5005
npm run dev:payment    # Payment Service on 5007
```

### All four services

This starts user, product, order, and payment services:

```bash
npm run dev:services
```

### Both User Service instances

Run these in separate terminals:

```bash
npm run dev:user
npm run dev:user:2
```

Both instances use the same source code, database, and `users` collection. Only `PORT` differs, set
through `cross-env`.

### Frontend, gateway, and all service instances

```bash
npm run dev:all
```

This starts the frontend (`5173`), gateway (`8000`), User Service on `5001` and `5002`, Product
Service (`5003`), Order Service (`5005`), and Payment Service (`5007`).

### Production-style start

Each service package also supports:

```bash
npm run start --workspace services/user-service
```

Set `PORT` in the environment when starting a second instance.

## Postman Collection

Import this file into Postman:

```text
docs/postman/microservices.postman_collection.json
```

The collection contains health checks and requests for creating, reading, updating, and deleting
users and products, creating orders and updating status, and simulating/retrieving payments. Create
User, Create Product, and Create Order requests automatically save returned IDs to collection
variables for the dependent requests.
