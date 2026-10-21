# Virtual Lab: Dynamic L7 API Gateway & Reverse Proxy

## About
An interactive Virtual Lab for understanding and experimenting with Layer 7 API Gateways, reverse proxies, dynamic routing, JWT authentication, and load balancing.

The platform allows students to visualize request flows, configure components, run simulations, and analyze performance metrics.

## Key Features
- Interactive architecture visualization.
- HTTP path-based routing to backend services.
- Load balancing across gateway instances.
- JWT authentication and verification.
- Dynamic routing configuration updates.
- Performance monitoring and failure simulation.

## Architecture
```text
Client → Rate Limiter → Load Balancer
                         ↓
                API Gateway 1 & 2
                         ↓
          User | Product | Order Services
                         ↓
                Separate Databases
```

**Supporting components:** Configuration Store and Secret Manager.

## Tech Stack
- React, TypeScript, Vite
- Tailwind CSS
- React Flow
- Recharts
- Node.js and Express (if required)

## Getting Started
```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_PROJECT_FOLDER>
npm install
npm run dev
```

## Objective
To provide a hands-on learning environment for understanding API gateway routing, authentication, scalability, and fault tolerance.

## Project Status
Under Development
