# Esplitter

Offline-first group expense tracker for friends, roommates, and trip groups.

Esplitter is a web app that keeps working even with poor connectivity. Users can add expenses offline, and the app syncs safely when the network returns.

## Highlights

- Offline-first UX with local persistence
- Group creation and invite-code joining
- Expense split modes (equal, custom, percentage)
- Settlement tracking using payment transactions
- Role-based permissions (admin/member)
- Idempotent sync and retry safety
- Atomic server mutations for consistency
- Optimized paginated sync (96% lower bandwidth vs unbounded pull)

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript, IndexedDB (Dexie), Service Worker
- Backend: Node.js, Express, Mongoose
- Database: MongoDB
- Security: Helmet, CORS, rate limiting, JWT auth + refresh cookie
- Testing: Jest, Supertest, mongodb-memory-server
- Deployment: Vercel (serverless API + static frontend)

## Architecture (High Level)

- Client-heavy SPA served from public assets
- Local-first writes to IndexedDB queue
- Sync endpoint performs:
  - Push: upsert pending transactions by clientId (idempotent)
  - Pull: paginated server updates (limit + hasMore)
- Backend follows layered structure:
  - Routes (HTTP layer)
  - Controllers (business logic)
  - Models/Services (data and domain logic)

## Sync Optimization

Current sync design is mobile-friendly and bandwidth-efficient:

- Request supports optional limit (default 100, max 1000)
- Optional groupIds filter for selective sync
- Response includes hasMore for pagination
- Only changed groups are returned on pull

Result:

- Before: ~8.5 MB per week-offline sync
- After: ~300 KB per request (typical)
- Improvement: ~96% bandwidth reduction

## Project Structure

- server: Express app, routes, controllers, models, middleware, services
- public: Frontend assets (HTML, CSS, JS, Service Worker)
- tests: Integration regression suite
- doc: Technical and product documentation

## Prerequisites

- Node.js 18+
- MongoDB connection URI

## Environment Variables

Create a .env file in the project root:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=3000
NODE_ENV=development
```

Notes:

- PORT is optional (defaults to 3000)
- NODE_ENV=test disables auto DB connect in server startup path

## Local Development

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run dev
```

Run in production mode locally:

```bash
npm start
```

## Testing

Run test suite:

```bash
npm test
```

Current regression suite validates:

- Balance derivation correctness
- Expense delete consistency
- Admin authorization protection
- Leave guard when unsettled
- Admin transfer then leave flow
- Group delete guard when unsettled

## API Overview

Base path: /api

Key endpoints:

- Auth: /api/auth/register, /api/auth/login, /api/auth/refresh, /api/auth/logout
- Sync: /api/sync, /api/sync/groups
- Expenses: /api/expenses/*
- Groups: /api/groups/*
- User: /api/user/*
- Health: /api/health

For full request/response contracts, see documentation links below.

## Deployment (Vercel)

The repository includes Vercel routing configuration:

- /api/* routed to server/app.js
- Static assets served from public

Set environment variables in Vercel project settings:

- MONGODB_URI
- JWT_SECRET
- NODE_ENV=production

## Status

Production-ready baseline with regression coverage and optimized sync behavior.

If you want, I can also generate a shorter README variant focused for recruiters (resume project style) and keep this one as full technical documentation.
