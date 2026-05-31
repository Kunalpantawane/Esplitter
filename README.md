# Esplitter

Offline-first group expense tracker with personal expenses, budgets, and client-side sync.

## Overview

Esplitter is a full-stack expense splitter with a vanilla JavaScript frontend, offline storage, and an Express + Mongoose backend.

The live app runs from `public/index.html` and `public/js/`. The `src/` tree is migration scaffolding and is not the current browser entrypoint.

## Features

- Group expense splitting with `EQUAL`, `CUSTOM`, and `PERCENTAGE` splits.
- Invite-code group joins with admin approval, rejection, transfer, removal, archive, and delete-after-settlement flows.
- Expense creation, updates, soft delete, and settlement tracking.
- Personal expense tracking with categories, budgets, and analytics charts.
- Offline-first storage with IndexedDB plus service worker caching.
- Sync with `clientId` idempotency and paginated pull updates.
- JWT auth with refresh-token cookie support.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend runtime | Vanilla JavaScript, Dexie, Chart.js, Service Worker |
| Frontend build | Vite, PostCSS, Tailwind CSS |
| Backend | Node.js, Express, Mongoose |
| Security | Helmet, CORS, express-rate-limit, JWT, bcrypt |
| Testing | Jest, Supertest, mongodb-memory-server |

## Quick Start

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

This starts Vite and the backend together.

### Test

```bash
npm test
```

## Environment

Copy `.env.example` to `.env` and set:

- `MONGODB_URI`
- `JWT_SECRET`
- `PORT` (optional)
- `NODE_ENV`
- `CORS_ORIGINS`

## Project Structure

```text
server/   Backend app, controllers, models, routes, services
public/   Live frontend, CSS, JS, service worker
src/      TypeScript migration scaffold
tests/    Integration tests
doc/      Verified documentation
```

## API Surface

- `GET /api/health`
- `/api/auth`
- `/api/user`
- `/api/sync`
- `/api/groups`
- `/api/expenses`
- `/api/personal-expenses`
- `/api/categories`
- `/api/budgets`

See [doc/api.md](doc/api.md) and [doc/backend.md](doc/backend.md) for details.


## Notes

- The service worker caches the app shell.
- The frontend uses `public/js/` at runtime.
- `src/index.ts` is not the current browser entrypoint.