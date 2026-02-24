# 🧱 Tech Stack – Offline-First Group Expense Tracker (Web)

---

# 📌 Project Overview

This project is a **Progressive Web Application (PWA)** built using **HTML, CSS, and JavaScript**, designed to function both **online and offline** with reliable background synchronization.

The architecture follows a **client-heavy, offline-first model**, with a Node.js backend and MongoDB database.

---

# 🖥 Frontend (Web Client)

## Core Technologies

| Technology                | Purpose                           |
| ------------------------- | --------------------------------- |
| HTML5                     | Page structure & semantic layout  |
| CSS3                      | Styling & responsive layout       |
| Vanilla JavaScript (ES6+) | Application logic                 |
| IndexedDB                 | Offline data storage              |
| Service Worker            | Offline caching & background sync |
| Fetch API                 | Network requests                  |
| MediaDevices API          | Camera access                     |
| Canvas API                | Image compression                 |
| Web App Manifest          | PWA support                       |

---

## Architecture Pattern

* Modular JavaScript structure
* Component-based UI (manually structured)
* State-driven rendering
* Offline-first repository pattern
* Sync queue system

---

## Offline Storage

### IndexedDB

Used for:

* Groups
* Transactions
* Pending sync queue
* User session metadata

Recommended wrapper:

* **Dexie.js** (optional but highly recommended for maintainability)

---

## PWA Features

* Installable on mobile and desktop
* Works offline
* Service Worker caching
* Background sync (limited browser support)

---

## Browser Support

* Chrome (Desktop & Mobile) – Primary target
* Edge – Compatible
* Firefox – Partial background sync support
* Safari – Limited service worker capabilities

---

# 🌐 Backend

## Core Stack

| Technology       | Purpose             |
| ---------------- | ------------------- |
| Node.js          | Runtime environment |
| Express.js       | REST API framework  |
| MongoDB Atlas    | Cloud database      |
| Mongoose         | ODM for MongoDB     |
| JWT              | Authentication      |
| bcrypt           | Password hashing    |
| Cloudinary       | Image storage       |
| Render / Railway | Backend hosting     |

---

## API Architecture

* RESTful design
* JSON-based communication
* JWT-protected routes
* Sync endpoint for batched updates
* Role-based access control (Admin / Member)

---

# 🔄 Offline-First Sync Strategy

## Client-Side

* All actions write to IndexedDB first
* Each record marked:

  * `PENDING`
  * `SYNCED`
* Service Worker triggers sync
* Manual retry fallback

## Server-Side

* `/sync` endpoint accepts:

  * `lastSyncAt`
  * pending records
* Returns:

  * new server updates
  * sync timestamp

Conflict Strategy:

* Immutable transactions
* Last-write-wins for metadata
* UUID-based deduplication

---

# 💳 Payment Integration

## UPI Deep Linking

```
upi://pay?pa=<UPI_ID>&pn=<Name>&am=<Amount>&tn=<Note>&cu=INR
```

Web Behavior:

* Mobile Chrome redirects to UPI app
* No reliable callback support
* Manual “Mark as Paid” confirmation required

No:

* Bank linking
* SMS reading
* Payment gateway integration

---

# 📸 Media Handling

## Camera

Using:

```
navigator.mediaDevices.getUserMedia()
```

Requirements:

* HTTPS hosting
* User permission

## Image Compression

* Resize via Canvas API
* Limit file size < 2MB
* Upload to Cloudinary
* Store URL in database

---

# 🔐 Security Stack

| Security Layer   | Implementation                     |
| ---------------- | ---------------------------------- |
| Authentication   | JWT (HTTP-only cookie recommended) |
| Password Hashing | bcrypt                             |
| HTTPS            | Mandatory                          |
| CSRF Protection  | SameSite cookies or token          |
| Input Validation | Express-validator                  |
| Rate Limiting    | express-rate-limit                 |
| XSS Prevention   | Sanitized inputs                   |

---

# 🚀 Deployment Stack

## Frontend Hosting

* Vercel (Recommended)
* Netlify (Alternative)

## Backend Hosting

* Render
* Railway
* AWS EC2 (Advanced option)

## Database

* MongoDB Atlas (Free Tier)

---

# 📊 Monitoring & Logging

| Tool         | Purpose         |
| ------------ | --------------- |
| Sentry       | Error tracking  |
| Morgan       | Backend logging |
| Console logs | Dev debugging   |

---

# 📂 Suggested Project Structure

## Frontend

```
/public
  index.html
  manifest.json
  service-worker.js
/src
  /components
  /utils
  /services
  /db
  /sync
  app.js
```

---

## Backend

```
/server
  /controllers
  /routes
  /models
  /middleware
  /services
  app.js
```

---

# ⚡ Performance Considerations

* Lazy load large lists
* Use pagination for transaction history
* Index MongoDB by:

  * groupId
  * createdAt
* Minimize IndexedDB reads
* Debounce frequent sync attempts

---

# 🧠 Why This Stack?

| Requirement           | Solution                       |
| --------------------- | ------------------------------ |
| Offline support       | IndexedDB + Service Worker     |
| No app install        | Web PWA                        |
| Camera access         | MediaDevices API               |
| Mobile compatibility  | Responsive CSS                 |
| Secure login          | JWT                            |
| Image storage         | Cloudinary                     |
| Real-time reliability | Manual sync + periodic polling |

---

# 📌 Final Stack Summary

Frontend:
HTML + CSS + JavaScript
IndexedDB
Service Worker
MediaDevices API

Backend:
Node.js + Express
MongoDB Atlas
JWT Authentication

Deployment:
Vercel + Render

---

