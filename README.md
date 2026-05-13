# 💰 Esplitter 

> **Offline-first group expense tracker & personal finance manager for friends, roommates, and trip groups.**

Esplitter is a Progressive Web App (PWA) that keeps working even with poor connectivity. Users can add expenses offline, and the app seamlessly synchronizes data safely when the network returns.

---

## ✨ Features

### 🏢 Group Expense Splitting
- **Invite-Only Groups**: Create groups and invite members via 6-character secure codes (with admin approvals).
- **Flexible Split Modes**: Split expenses Equally, Custom amounts, or by Percentages.
- **Live Previews**: See exactly who owes what during input.
- **Smart Settlement**: Toggle between "Smart Mode" (greedy minimization to reduce transactions) and "Normal Mode" (direct pairwise debt tracking).
- **Settlement Workflow**: Built-in "Mark as Paid", "Request Payment", and "Confirm Receipt" flows.

### 📊 Personal Expense Tracker
- **Quick Logging**: Add personal expenses instantly with an intuitive category grid.
- **Category Management**: Comes with 7 built-in categories (Food, Travel, etc.) + create your own custom categories.
- **Visual Analytics**: Beautiful Chart.js integration featuring Doughnut charts for category breakdowns and Line charts for spending trends over time.
- **Budget Tracking**: Set monthly limits per category or overall, with color-coded progress bars alerting you as you approach limits.
- **Smart Insights**: Get auto-generated insights like week-over-week comparisons, top spending categories, and anomaly detection.

### 🌐 Offline-First Architecture
- **Zero Interruption**: All data is stored locally in IndexedDB (Dexie) first. 
- **Background Sync**: Automatic background synchronization with a pending queue and exponential retry logic.
- **Service Worker Caching**: The app shell is cached locally so the app loads instantly, even entirely offline.
- **Network Awareness**: Beautiful UI banners notify you of online/offline status and auto-sync progress upon reconnection.

### ✅ Implemented (Current)
- Shared frontend API request wrapper (`public/js/api.js`) now powers auth, sync, tracker, and app network calls.
- Personal tracker includes local forecast cards and local sync conflict panel with retry.
- Group detail includes local forecast summary and group sync issue panel with retry.
- Expense route cleanup and backend helper extraction refactors are completed and validated.
- Regression suite remains green (`7/7` suites, `49/49` tests).

### ⏭️ Deferred (Future)
- Notification system (due settlements, pending approvals, budget alerts).
- Expanded Razorpay service-layer and reconciliation hardening.
- Receipt storage + OCR pipeline.
- OTP-based auth migration.
- Multi-currency workflow toggle with conversion snapshots.
- Backend precomputed analytics pipeline.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Vanilla, Glassmorphism UI), Vanilla JavaScript, IndexedDB (Dexie.js), Chart.js, Service Worker API
- **Backend**: Node.js, Express.js, Mongoose
- **Database**: MongoDB (with retry logic and idempotency constraints)
- **Security**: Helmet, CORS, Express Rate Limiting, JWT (JSON Web Tokens) in HttpOnly cookies
- **Testing**: Jest, Supertest, mongodb-memory-server
- **Deployment**: Vercel (serverless API + static frontend assets)

---

## 🧠 Architecture (High Level)

Esplitter follows a highly robust client-heavy SPA structure:
- **Local-First Writes**: Transactions are pushed to an IndexedDB queue immediately, reflecting instantly in the UI.
- **Idempotent Sync Engine**: The sync endpoint pushes pending transactions (upsert by `clientId`) and pulls paginated server updates (`limit` + `hasMore`). 
- **Bandwidth Optimized**: Sync pulls only fetch changed groups and paginate results. This reduces sync bandwidth by ~96% (from ~8.5 MB down to ~300 KB for typical workloads).
- **Layered Backend Model**: 
  - *Routes* (HTTP routing & rate-limiting)
  - *Controllers* (Business logic orchestration)
  - *Services* (Domain logic: Sync, Balance/Settlement, Idempotency tracking)
  - *Models* (Data schemas with performance indexing)

---

## 📂 Project Structure

```text
├── server/
│   ├── config/         # Database connection logic
│   ├── controllers/    # Business logic (auth, group, expense, sync, personal, budget, category)
│   ├── middleware/     # Auth verifiers, error handlers
│   ├── models/         # Mongoose schemas
│   ├── routes/         # Express routers
│   ├── services/       # Domain logic (syncService, balanceService, idempotencyCache)
│   └── lib/            # Utilities (runAtomic, shared components)
├── public/
│   ├── css/style.css   # Comprehensive Design system
│   ├── js/             # Frontend modules (app, auth, sync, ui, tracker, tracker-ui, db)
│   ├── sw.js           # Service Worker (cache-first assets, network-first API)
│   └── index.html      # SPA shell
└── tests/
    ├── setup.js        # Shared test bootstrap (mongodb-memory-server)
    └── integration/    # Regression suites (auth, groups, expenses, settlement)
```

---

## 🚀 Quick Start & Setup

### Prerequisites
- Node.js (v18 or higher)
- MongoDB Connection URI (for local dev)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd esplitter
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory (you can copy from `.env.example`):
   ```env
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   PORT=3000
   NODE_ENV=development
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```

5. **Open the App**:
   Navigate to `http://localhost:3000` in your web browser.

---

## 🧪 Testing

Esplitter includes a robust integration testing suite. It uses `mongodb-memory-server`, meaning **you don't need an external database to run tests**.

To execute the test suite:
```bash
npm test
```

### Coverage Highlights:
- **Auth**: Registration, login, JWT refresh, logout, duplicate/weak credentials, protected route guards.
- **Groups**: Creation, join (with admin approval), member removal, group archiving, admin transfer, delete guards (unsettled vs settled).
- **Expenses**: CRUD, balance derivation, split validation, soft deletion consistency, offline sync idempotency.
- **Settlement**: Validation of Smart (Greedy) vs Normal (Pairwise) algorithms, circular debt simplification, total debt equivalence.
- **User**: Profile fetch/update and UPI ID validation/update.
- **Personal Tracker**: Personal expense sync/list/delete coverage with offline-first flow.
- **Categories & Budgets**: Custom category CRUD and monthly budget set/list/delete coverage.

---

## 🌐 API Overview

Base path: `/api`

| Module | Endpoints |
|--------|-----------|
| **Auth** | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| **Sync** | `/sync`, `/sync/groups` |
| **Groups** | `/groups/*` |
| **Expenses** | `/expenses/*` |
| **Personal** | `/personal-expenses/*`, `/categories/*`, `/budgets/*` |
| **User** | `/user/*` |
| **System** | `/health` |

---

## ☁️ Deployment (Vercel)

The repository includes a `vercel.json` configuration out-of-the-box:
- `/api/*` is automatically routed to `server/app.js` (Serverless Functions)
- All other static assets are served directly from the `public/` directory via Vercel's CDN.

**To Deploy**:
Simply connect the repository to Vercel and set the following Environment Variables in the Vercel Dashboard:
- `MONGODB_URI`
- `JWT_SECRET`
- `NODE_ENV=production`

---

> **Status:** Production-ready with full regression coverage, highly optimized sync protocols, and a resilient offline-first architecture.

See [doc/frontend.md](doc/frontend.md) and [doc/backend.md](doc/backend.md) for implementation details, and [plan.md](plan.md) for deferred future roadmap.
