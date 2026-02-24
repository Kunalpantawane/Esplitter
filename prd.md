**Web-based Offline-First Group Expense Tracker** built using **HTML, CSS, JavaScript** (Vanilla or with light frameworks), and a Node.js backend.

This PRD is written at the level expected in industry or for submission to peers/mentors, with clarity on scope, user behavior, technical design boundaries, and measurable goals.

---

# 📘 PRODUCT REQUIREMENTS DOCUMENT (PRD)

## Product: Web-Based Offline-First Group Expense Tracker

**Target Platforms:** Chrome & modern browsers on mobile and desktop
**Frontend Tech:** HTML, CSS, JavaScript (progressive enhancement + service worker)
**Backend Tech:** Node.js + Express, MongoDB Atlas
**Status:** College / Resume Project → industry quality

---

## 🛠 1. Product Vision

Enable small groups (friends, roommates, travelers) to **track shared expenses, settle balances, and manage debts** in a browser environment that works **offline as well as online**, without requiring native installation or Play Store distribution.

The app must be:

* **Reliable offline**, saving local changes until the internet returns.
* **Easy to join groups**, with invite codes and links.
* **Transparent**, showing who owes whom without ambiguity.
* **Secure**, with authenticated users and role-based permissions.
* **Practical**, supporting photo receipts, payment link redirection, and common devices.

---

## 🎯 2. Product Goals

| Goal                   | Metric                                           |
| ---------------------- | ------------------------------------------------ |
| Offline expense entry  | Seamless local operation with data persistence   |
| Sync reliability       | Conflicts kept to zero / predictable rules       |
| Debts clearly computed | Real-time visual balances                        |
| Easy checkout          | One-tap UPI link generation                      |
| Accessible             | Works on Chrome mobile & desktop                 |
| Minimal friction       | No app install required; optional PWA enablement |

---

## 📝 3. Use Cases

### Primary Use Cases

1. **Trip Friends**

   * Many small expenses
   * No consistent network
   * People want split and summary
2. **Roommate Bills**

   * Recurring expenses, shared month-to-month
   * Members may join/leave over time
3. **Event Organizers**

   * One-time budget split among 5–20 users
   * Need summary and clear settlement

---

## 👤 4. User Personas

### Persona: “Students on Trip”

* Tech comfortable, expect simplicity
* Rarely network everywhere
* Use browser on phone

### Persona: “Shared Flat Residents”

* Need history, receipts
* Care about who owes whom monthly

---

## 🚀 5. Feature Requirements

---

### 🔐 5.1 Authentication

**Goal:** Unique users, no duplicates.

**Requirements:**

* Passwordless login with Email or Phone OTP
* JWT session stored securely (HTTP-only cookie recommended)
* Backend validation

**UI Must-Haves:**

* Login form
* OTP verification (if using phone)
* Redirect to dashboard after auth

**Success Criteria:**

* Unique user account
* Secure token management

---

### 👨‍👩‍👧‍👦 5.2 Group Creation & Management

**Features:**

* User creates group
* System generates invite code or link
* Other users join via code

**Rules:**

| Action                 | Allowed    |
| ---------------------- | ---------- |
| Add expense            | Everyone   |
| Edit or delete expense | Admin only |
| Remove member          | Admin only |
| Leave group            | Member     |

**Auto-Archive Rule:**

* If no transactions **and no activity** for 30 days →deleted permanently

---

### 💰 5.3 Expense Entry & Splitting

**Offline Behavior:**

* User enters expense even when offline
* Local UI updates instantly
* Automates split calculation

**Example Split Rules:**

* Equal split
* Unequal custom
* Optional percentage or fixed amount

**Modeling:**

* Use ledger entries stored in IndexedDB
* Sync pushes to server later

**Constraints:**

* No deletion/edits by non-admins
* Transactions immutable once synced (minor metadata allowed)

---

### 🔁 5.4 Offline Synchronization

**Core Requirements:**

* Use **IndexedDB** for local storage
* Flag unsynced transactions
* Service Worker attempts periodic network sync
* UI shows network status and sync queue

**Sync Contract:**

```
Client → /sync
{
  lastSyncAt,
  pendingTransactions
}
```

```
Server → Response
{
  confirmedRecords,
  newRecords
}
```

**Conflict Rules:**

* New unique transactions → merge
* Same UUID unrestorable conflict → local priority
* Social metadata (name change) → last writer wins

---

### 💳 5.5 Payment Integration

**Web Payment Strategy:**

* Generate a UPI URL deep link
* On mobile browsers:
  Redirect to UPI app (if installed)
  Example:

  ```
  upi://pay?pa=...&pn=...&am=...&tn=...
  ```

**Limitations:**

* No reliable post-payment callback
* Payment success must be **manually confirmed** by user

**UI Flow:**

* Scan QR (camera)
* Fill payment details
* User taps “Pay Now”
* Browser attempts to open UPI app
* After payment return → app shows “Mark as Paid”

---

### 📸 5.6 Receipt Images

**User Story:**
“I want to attach a photo of the bill.”

**Requirements:**

* Camera permission (HTTPS)
* User captures image
* Image is compressed and stored locally
* Uploaded to backend/cloud (Cloudinary/AWS)
* URL saved with transaction

**Constraint:**

* Max size ~2MB

---

### 🔍 5.7 UX and UI Behaviors

**Dashboard:**

* Current balances (per group)
* Sorted by who owes most
* Settled versus unsettled

**Group View:**

* List of expenses (newest on top)
* Button to add expense
* Button to settle debts

**Expense Entry Form:**

* Amount
* Participants
* Payer
* Description
* Optional image

**Network Indicator**

* Green = online
* Orange = offline (with pending queue count)

---

## ⚙️ 6. Non-Functional Requirements

| Category            | Requirement                       |
| ------------------- | --------------------------------- |
| Performance         | UI < 150ms response               |
| Offline reliability | 100% clear user feedback          |
| Sync frequency      | every 2 mins or on reconnection   |
| Security            | HTTPS only                        |
| Privacy             | No SMS read                       |
| Storage             | IndexedDB local                   |
| Scalability         | Up to 5000 users (backend)        |
| Browser support     | Modern Chrome (desktop/mobile)    |
| Accessibility       | Keyboard & screen-reader friendly |

---

## 🧠 7. Design & Architecture

### 7.1 Frontend Tech

| Feature      | Implementation                      |
| ------------ | ----------------------------------- |
| UI           | HTML + CSS + Vanilla JS             |
| State        | Custom state container              |
| Local DB     | IndexedDB (Dexie.js wrapper)        |
| Sync         | Service Worker + fallback logic     |
| Camera       | Navigator.mediaDevices.getUserMedia |
| Image resize | Canvas API                          |
| Storage      | IndexedDB + upload queue            |

---

### 7.2 Backend Tech

| Layer      | Technology        |
| ---------- | ----------------- |
| API Server | Node.js + Express |
| Auth       | JWT + bcrypt      |
| DB         | MongoDB Atlas     |
| Images     | Cloudinary        |
| Deployment | Render/Railway    |

---

### 7.3 Data Models (Backend)

**User**

```
{ _id, name, email, phone, createdAt }
```

**Group**

```
{ _id, name, adminId, inviteCode, lastActivityAt }
```

**Transaction**

```
{ _id, groupId, type, amount,
  payer, splits[], imageUrl, syncedAt }
```

---

## 🔄 8. Synchronization Contract

### Request

```
{
  lastSyncAt: timestamp,
  pending: [transaction objects]
}
```

### Response

```
{
  serverAdds: [],
  serverUpdates: [],
  syncTime: timestamp
}
```

---

## ☁️ 9. Infrastructure & Deployment

| Component     | Hosting        |
| ------------- | -------------- |
| Frontend      | Vercel/Netlify |
| Backend       | Render/Railway |
| DB            | MongoDB Atlas  |
| Image Storage | Cloudinary     |

**CI/CD:**

* GitHub Actions
* Lint + test + deploy

---

## 🔒 10. Security Considerations

* JWT expiration + refresh
* Rate limit login
* HTTPS enforced
* Validate every input
* Group access control
* CSRF prevention (use tokens)
* Sanitized user entry

---

## 📊 11. Metrics & Monitoring

| Metric                   | Target |
| ------------------------ | ------ |
| Sync success rate        | > 95%  |
| UPI click-through        | > 90%  |
| Offline entries not lost | 100%   |
| Group join success       | 99%    |

Use:

* Sentry (error tracking)
* LogRocket or plain logs
* Backend logging

---

## 🗺 12. UI Prototype Outline

### Screens

1. Login
2. Join/Create Group
3. Group Dashboard
4. Expense List
5. Add Expense
6. Settle Up (UPI)
7. Profile/Settings

---

## 🗓 13. MVP Roadmap

**Phase 1 (Core)**

* Login
* Create group
* Add expense offline
* IndexedDB + service worker
* Sync
* Basic UI

**Phase 2 (Payments)**

* UPI link generation
* Manual marking
* Receipt upload

**Phase 3 (Polish)**

* Network indicator
* Profile settings
* Group archiving
* PWA install support

---

## 🎯 Success Criteria

| Goal           | Completed |
| -------------- | --------- |
| Offline work   | Yes       |
| Sync           | Yes       |
| Group join     | Yes       |
| Expense split  | Yes       |
| UPI links      | Yes       |
| Receipt upload | Yes       |

---

## Risks & Mitigation

| Risk                    | Mitigation            |
| ----------------------- | --------------------- |
| Sync conflicts          | Versioned UUIDs       |
| Browser storage cleared | Warn users            |
| UPI callback unreliable | Manual confirm        |
| No network              | Local queue indicator |
| Permission blocked      | Progressive fallback  |

---

