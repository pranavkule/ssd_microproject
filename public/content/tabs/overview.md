# Dynamic L7 API Gateway & Reverse Proxy

A **Layer-7 (application-layer) API gateway** is the single entry point for client
traffic into a distributed backend. Because it understands HTTP, it can inspect the
URL path, method and headers, then make routing, authentication and rate-limiting
decisions per request. A **reverse proxy** is the deployment pattern that puts that
gateway in front of the backend services and hides them from clients.

## Requirements

- **Functional**: route requests to the correct backend by URL path; verify client
  JWTs; enforce a global admission limit; support live routing updates.
- **Non-functional**: scale horizontally to many requests per second; survive the
  failure of a single gateway; keep routing changes possible without a restart.

## Building blocks

| Concern | Component | Why |
| --- | --- | --- |
| Admission control | **Rate Limiter** | Drops excess traffic with `429` before it reaches anything expensive. |
| Distribution | **Load Balancer** | Spreads requests across gateway instances using round robin / least connections. |
| Request routing | **Gateway VMs** | Match path + method, verify JWT, forward to a service. |
| Live configuration | **Config Store (Redis)** | Versioned routing table that gateways watch and reload. |
| Key management | **Secret Manager** | JWT signing / public keys and TLS certificates fetched by gateways. |
| Compute | **Application Services + DBs** | User, Product and Order services each own a database. |

## Request lifecycle

1. The client emits a request at its configured rate.
2. The **Rate Limiter** admits or rejects it (`429` when over budget).
3. The **Load Balancer** picks a healthy gateway instance.
4. The gateway **verifies the JWT** using keys from the Secret Manager.
5. The gateway matches the path against the **active routing table** (from the
   Config Store) and forwards to the target service.
6. The service reads or writes **its own database** and returns a response.

## Key design decisions

- **Rate limiting first** protects every downstream hop.
- **Stateless gateways** make horizontal scaling trivial: configuration lives in the
  Config Store and keys live in the Secret Manager, so instances need no coordination.
- **Watching vs. polling**: gateways watch the Config Store for new versions, so a
  published rule change propagates after a short delay with **no restart**.
- **Failover**: when one gateway VM dies, the Load Balancer health check reroutes all
  traffic to the survivor, keeping the error rate at zero.

## What you will do in this lab

Start from the **starter diagram** (one gateway), then evolve it into the **reference
architecture** by adding a Load Balancer, a second gateway VM, the shared Config Store
and a Secret Manager. Use the **Tasks** tab to check your design against the case
study requirements, then run the simulation and the failure scenarios.
