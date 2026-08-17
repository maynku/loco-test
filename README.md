# 🚌 Loco — Real-Time College Bus Tracking System

> A live GPS tracking system where bus drivers stream their location in the background, and students can view all buses in real time on a web dashboard map — along with any bus's route history.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Data Flow](#-data-flow)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Data Stores — Redis + MongoDB](#-data-stores--redis--mongodb)
- [API Reference](#-api-reference)
- [WebSocket Events](#-websocket-events)
- [Setup & Installation](#-setup--installation)
- [Environment Variables](#-environment-variables)
- [Key Design Decisions](#-key-design-decisions)
- [Scaling & Capacity](#-scaling--capacity)
- [Related Docs](#-related-docs)

---

## 🎯 Overview

Loco is a 3-tier system:

| Tier | Function | Tech |
|------|------|------|
| **Driver App** | Runs on the driver's phone inside the bus. Sends GPS location every 30 sec over WebSocket in the background. | Expo / React Native |
| **Backend Server** | Receives locations, caches the live position in Redis (fast reads), and saves history in MongoDB (permanent). | Node.js + Express + Socket.IO |
| **Web Dashboard** | Students log in and view live buses on a map + draw a given bus's route history. | Leaflet + Vanilla JS |

**Core idea:** Two data stores — **Redis for "hot" data** (where the bus is right now), **MongoDB for "cold" data** (everywhere the bus has been). Ingestion happens over WebSocket; viewing happens via HTTP polling.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│   📱 DRIVER APP (Expo/React Native)          🖥  WEB DASHBOARD (Leaflet)        │
│   ┌────────────────────────────┐            ┌────────────────────────────┐    │
│   │  Background GPS Task        │            │  Login → Map View           │    │
│   │  send location every 30s    │            │  poll live buses every 20s  │    │
│   │  (High accuracy ~10m)       │            │  + draw route history       │    │
│   └──────────────┬─────────────┘            └──────────────┬─────────────┘    │
│                  │ WebSocket                                 │ HTTP (polling)   │
│                  │ emit('updateLocation')                    │ GET /live-...    │
│                  ▼                                           ▼                  │
│   ┌────────────────────────────────────────────────────────────────────────┐  │
│   │                    🖧  BACKEND SERVER (Node + Express + Socket.IO)        │  │
│   │                          [ AWS t2.micro / t3.micro ]                     │  │
│   │                                                                          │  │
│   │   Socket handler          HTTP routes (JWT protected)                    │  │
│   │   updateBusLocation()     liveLocationAll() · getBusHistory() · login()  │  │
│   └───────────────┬──────────────────────────────────┬───────────────────────┘  │
│                   │                                    │                        │
│         WRITE     │                                    │  READ                  │
│    ┌──────────────▼──────────────┐      ┌──────────────▼───────────────┐       │
│    │   🔴 REDIS (hot / live)      │      │   🍃 MONGODB (cold / history) │       │
│    │                              │      │                               │       │
│    │  bus:<id>:live  (EX:80s TTL) │      │  Bus collection (flat rows)   │       │
│    │  active_bus_ids (SET)        │      │  { busId, lat, lng, ts }      │       │
│    │  valid_bus_ids  (SET cache)  │      │  + index + 7-day TTL          │       │
│    │  Tester (login users)  ──────┼──────┤  Tester collection            │       │
│    └──────────────────────────────┘      └───────────────────────────────┘       │
│                                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### 1. Location Ingestion (Driver → Server)

```
Driver taps "START TRACKING"
   │
   ├─► POST /verify-bus ──► check busId in MongoDB (is it a valid bus?)
   │
   ├─► Location permission (foreground + background)
   │
   └─► Background GPS task starts (every 30s)
          │
          └─► socket.emit('updateLocation', { busId, lat, lng })
                 │
                 ▼
          updateBusLocation()
             │
             ├─ 1. Valid bus? → check Redis SET 'valid_bus_ids' (cache), else MongoDB
             ├─ 2. Redis: SET bus:<id>:live = {lat,lng,ts}  (EX:80s)
             ├─ 3. Redis: SADD active_bus_ids <busId>
             └─ 4. MongoDB: create({ busId, lat, lng, timestamp })   ← history
          │
          └─◄ ack callback { status: 'success' | 'error' }   (confirmation to driver)
```

### 2. Live Viewing (Server → Dashboard)

```
Student logs in → JWT token → localStorage
   │
   └─► every 20s: GET /live-location-all  (Authorization: Bearer <token>)
          │
          ▼
       liveLocationAll()
          ├─ Redis: SMEMBERS active_bus_ids   (non-blocking, no KEYS)
          ├─ Redis: MGET bus:<id>:live ...    (fetch everything in one call)
          └─ skip expired (TTL) keys + clean them from the SET (SREM)
          │
          └─► [ {busId, lat, lng, timestamp}, ... ]
                 │
                 ▼
          Dashboard: markers update (slide smoothly via interpolation)
```

### 3. Route History (on demand)

```
"Show Path" button → GET /api/bus-history/:busId  (Bearer token)
   │
   ▼
getBusHistory()
   ├─ MongoDB: find({ busId, timestamp >= max(today-midnight, 2hr-ago) }).sort(ts)
   └─► path: [[lat,lng], [lat,lng], ...]  → Leaflet polyline
```

---

## 🛠 Tech Stack

**Backend**
- Node.js + **Express 5** — HTTP server + routing
- **Socket.IO** — real-time location ingestion (WebSocket)
- **Mongoose** (MongoDB) — history persistence
- **redis** (v6 client) — live cache + active-bus index
- **jsonwebtoken** — dashboard auth
- **dotenv**, **cross-env**

**Driver App**
- **Expo (SDK 54)** / React Native
- **expo-location** + **expo-task-manager** — background GPS tracking
- **@react-native-async-storage/async-storage** — persists busId (needed for the background task)
- **socket.io-client**, **axios**

**Web Dashboard**
- **Leaflet** + OpenStreetMap tiles — map rendering
- Vanilla JS (no framework) — polling, markers, interpolation

---

## 📁 Project Structure

```
loco-test/
├── backend/
│   └── src/
│       ├── server.js                 # entry point — Express + Socket.IO setup, routes
│       ├── config/
│       │   ├── db.js                 # MongoDB connection
│       │   └── redis.js              # Redis client config
│       ├── controller/
│       │   ├── busController.js      # updateBusLocation, verifyBus, liveLocationAll
│       │   ├── betaUserController.js # login, JWT middleware, create user
│       │   └── locationController.js # getBusHistory (route path)
│       ├── model/
│       │   ├── busModel2.js          # Bus schema (flat rows) — ACTIVE model
│       │   ├── busModel.js           # old schema (unused)
│       │   └── betaUser.js           # Tester (login users) schema
│       ├── public/                   # web dashboard (served static)
│       │   ├── index.html            # login + live map + show-path UI
│       │   └── asset/
│       │       ├── js/mapSetup.js    # dashboard logic (polling, markers, interpolation)
│       │       └── css/style.css
│       └── stresstest.js             # 20-bus concurrency load test
│
└── frontend/
    └── loco-frontend/                # Expo driver app
        ├── App.js                    # driver UI + background GPS tracking task
        ├── Constants.js              # BASE_URL (backend endpoint)
        └── app.json                  # Expo config + Android location permissions
```

> **Note:** The codebase has some duplicate/experimental files (`AppRetry.js`, `index2.html`, `mapSetupLine.js`, `busModel.js`, etc.) — these are old iterations and are not active. Active files are listed in the table above.

---

## 💾 Data Stores — Redis + MongoDB

### 🔴 Redis (hot / live data)

| Key | Type | What it stores | TTL |
|-----|------|--------------------|-----|
| `bus:<id>:live` | String (JSON) | Bus's latest position `{lat,lng,timestamp}` | **80 sec** |
| `active_bus_ids` | Set | Which buses are currently active (read index — to avoid using `KEYS`) | — |
| `valid_bus_ids` | Set | Cache of registered bus IDs (to save a Mongo read on every location update) | — |

**Zombie cleanup:** `bus:<id>:live` has an **80s TTL** — if a bus goes offline, the key simply expires on its own → it disappears from the dashboard automatically. Any leftover ID in the `active_bus_ids` SET gets cleaned up via `SREM` at read time.

### 🍃 MongoDB (cold / history data)

**`Bus` collection** (`busModel2.js`) — each location is a flat row:
```js
{ busId: String, lat: Number, lng: Number, timestamp: Date }
```
- **Compound index** `{ busId: 1, timestamp: 1 }` — makes history queries fast
- **TTL index** `{ timestamp: 1 }` — **rows auto-delete after 7 days** (so storage doesn't fill up)

**`Tester` collection** (`betaUser.js`) — dashboard login users `{ username, password, name }`.

---

## 📡 API Reference

| Method | Endpoint | Auth | Function |
|--------|----------|------|------|
| `POST` | `/verify-bus` | ❌ | Is the Bus ID valid? (checked when driver starts) — MongoDB lookup |
| `POST` | `/api/login` | ❌ | Dashboard user login → JWT token |
| `POST` | `/api/create-beta-user` | ❌ | Create a new dashboard user |
| `GET` | `/live-location-all` | ✅ JWT | Live location of all active buses |
| `GET` | `/api/bus-history/:busId` | ✅ JWT | Route path of one bus (today / last 2hr) |
| `GET` | `/student` · `/map` | (`/student` needs JWT) | Serve dashboard HTML |
| `POST` | `/api/bus/dummy-location` | ❌ | Manually inject a location, for testing |

**Auth:** Protected routes require an `Authorization: Bearer <token>` header. Tokens come from `/api/login` and are valid for 3 days.

---

## 🔌 WebSocket Events

Connection: `io(BASE_URL, { transports: ['websocket'] })`

| Event | Direction | Payload | Function |
|-------|-----------|---------|------|
| `updateLocation` | Driver → Server | `{ busId, lat, lng, timestamp }` | Location update. Returns an ack callback `{ status }` |
| `connect` / `disconnect` | — | — | Connection lifecycle |

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- MongoDB (Atlas or local)
- Redis (cloud or local)

### Backend

```bash
cd backend
npm install
# create src/.env (see Environment Variables below)
npm start          # cross-env TZ=Asia/Kolkata node src/server.js
```
The server will run on `http://localhost:5000` (or whatever `PORT` is set in `.env`).

### Driver App (Expo)

```bash
cd frontend/loco-frontend
npm install
# point BASE_URL in Constants.js to your backend
npm start          # expo start
# scan the QR code (Expo Go) or run: npm run android
```

### Web Dashboard
Served together with the backend — open `http://<backend>/student` (requires login) or `/map` in a browser.

### Load Test (optional)
```bash
cd backend
node src/stresstest.js   # simulates 20 buses
```

---

## 🔑 Environment Variables

`backend/src/.env` file:

```env
PORT=5000
MONGO_URI=<your-mongodb-connection-string>
JWT_SECRET=<strong-random-secret-min-64-chars>
REDIS_PASSWORD=<your-redis-password>
# Redis host/port are currently in redis.js — recommended to move these into env too
```

> ⚠️ **Security:** Never commit `.env` to git. Add `.env` and `node_modules/` to `.gitignore`. (See `CODE_REVIEW_HINGLISH.md` for details.)

---

## 🧠 Key Design Decisions

**1. Why two stores — Redis (hot) + MongoDB (cold)?**
The live "where is the bus right now" data needs to be read every 20s (needs to be fast) → Redis. "Everywhere the bus has been" is needed only occasionally (needs to be permanent) → MongoDB. Since the two jobs are different, two stores are used.

**2. Why dashboard polling instead of WebSocket?**
For 300 viewers, 300 persistent WebSocket connections would themselves become a burden on a t2.micro. Simple HTTP polling (every 20s) + a Redis SET read (~2 ops/request) is cheaper and scales better.

**3. Why an `active_bus_ids` SET instead of just using `KEYS` directly?**
`KEYS bus:*:live` is blocking and O(N) — it would freeze Redis on every poll. With a SET index, `SMEMBERS + MGET` = ~2 ops (vs 51). That's ~25× less load. Zombie cleanup still happens via the key-level TTL.

**4. 30s location interval + frontend interpolation.**
A 30s ingestion interval keeps load/battery usage low. So the bus doesn't appear to "teleport," the dashboard marker smoothly slides (interpolates) between two points — data arrives every 30s, but the display looks smooth.

**5. Background GPS + AsyncStorage.**
The busId is saved to disk (AsyncStorage) so that even if the app is minimized or restarted, the background task can still read the busId — instead of depending on a global variable.

---

## 📊 Scaling & Capacity

Current optimized state (after fixes):

| Load | 200 users, 20 buses | 300 users, 50 buses |
|------|--------------------|--------------------|
| Ingestion | ~0.67 writes/sec | ~1.67 writes/sec |
| Dashboard Redis ops | ~20 ops/sec | ~30 ops/sec |
| **t2.micro** | 🟢 Comfortable | 🟢 OK (t3.micro safer) |
| Redis free tier | 🟢 Easy | 🟢 Easy |
| Mongo M0 storage | 🟢 ~60 MB steady (7d TTL) | 🟢 controlled |

> **Redis connection limit note:** The free tier's ~25 connection limit is tied to **backend instances**, not users. One t2.micro = one Node process = ~1-2 Redis connections. The limit would only be hit if you scaled to ~25 parallel server instances.

Details: full back-of-envelope calculations are in `POTENTIAL_FALLBACK_HINGLISH.md`.

---

## 📚 Related Docs

| Doc | What it contains |
|-----|---------|
| `CODE_REVIEW_HINGLISH.md` | Security + correctness issues (bugs, secrets, auth) — 17 findings |
| `POTENTIAL_FALLBACK_HINGLISH.md` | Capacity/scale/accuracy analysis, load distribution |
| `OPTIMIZATION_DEEPDIVE_HINGLISH.md` | KEYS vs HASH, interpolation, t2 vs t3 deep-dive |
| `CHANGES.md` | Log of code changes made (what/why + before/after) |

---

*Loco — real-time bus tracking, built for college transport.*
