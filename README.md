# 🚌 Loco — Real-Time College Bus Tracking System

> Live GPS tracking system jisme bus drivers apni location background mein stream karte hain, aur students ek web dashboard pe saari buses ko real-time map pe dekh sakte hain — saath hi kisi bus ka route history bhi.

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

Loco 3 tier ka system hai:

| Tier | Kaam | Tech |
|------|------|------|
| **Driver App** | Bus mein driver ke phone pe chalti hai. Background mein GPS location har 30 sec WebSocket se bhejti hai. | Expo / React Native |
| **Backend Server** | Location receive karta hai, live position Redis mein cache karta hai (fast read), history MongoDB mein save karta hai (permanent). | Node.js + Express + Socket.IO |
| **Web Dashboard** | Students login karke live map pe buses dekhte hain + kisi bus ka route history draw karte hain. | Leaflet + Vanilla JS |

**Core idea:** Do data stores — **Redis "hot" data ke liye** (abhi bus kahan hai), **MongoDB "cold" data ke liye** (bus kahan-kahan gayi). Ingestion WebSocket se, viewing HTTP polling se.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│   📱 DRIVER APP (Expo/React Native)          🖥  WEB DASHBOARD (Leaflet)        │
│   ┌────────────────────────────┐            ┌────────────────────────────┐    │
│   │  Background GPS Task        │            │  Login → Map View           │    │
│   │  har 30s location bhejo     │            │  har 20s live buses poll    │    │
│   │  (High accuracy ~10m)       │            │  + route history draw       │    │
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
Driver "START TRACKING" dabata hai
   │
   ├─► POST /verify-bus ──► MongoDB mein busId check (valid bus hai?)
   │
   ├─► Location permission (foreground + background)
   │
   └─► Background GPS task start (har 30s)
          │
          └─► socket.emit('updateLocation', { busId, lat, lng })
                 │
                 ▼
          updateBusLocation()
             │
             ├─ 1. Valid bus? → Redis SET 'valid_bus_ids' check (cache), warna MongoDB
             ├─ 2. Redis: SET bus:<id>:live = {lat,lng,ts}  (EX:80s)
             ├─ 3. Redis: SADD active_bus_ids <busId>
             └─ 4. MongoDB: create({ busId, lat, lng, timestamp })   ← history
          │
          └─◄ ack callback { status: 'success' | 'error' }   (driver ko confirmation)
```

### 2. Live Viewing (Server → Dashboard)

```
Student login → JWT token → localStorage
   │
   └─► har 20s: GET /live-location-all  (Authorization: Bearer <token>)
          │
          ▼
       liveLocationAll()
          ├─ Redis: SMEMBERS active_bus_ids   (non-blocking, KEYS nahi)
          ├─ Redis: MGET bus:<id>:live ...    (ek call mein sabka data)
          └─ expired (TTL) keys skip + SET se saaf (SREM)
          │
          └─► [ {busId, lat, lng, timestamp}, ... ]
                 │
                 ▼
          Dashboard: markers update (smooth interpolation se slide)
```

### 3. Route History (on demand)

```
"Show Path" button → GET /api/bus-history/:busId  (Bearer token)
   │
   ▼
getBusHistory()
   ├─ MongoDB: find({ busId, timestamp >= max(aaj-midnight, 2hr-ago) }).sort(ts)
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
- **@react-native-async-storage/async-storage** — busId persist (background task ke liye)
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
│       │   ├── busModel.js           # purana schema (unused)
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

> **Note:** Codebase mein kuch duplicate/experimental files hain (`AppRetry.js`, `index2.html`, `mapSetupLine.js`, `busModel.js`, etc.) — ye purane iterations hain, active nahi. Active files upar table mein hain.

---

## 💾 Data Stores — Redis + MongoDB

### 🔴 Redis (hot / live data)

| Key | Type | Kya store hota hai | TTL |
|-----|------|--------------------|-----|
| `bus:<id>:live` | String (JSON) | Bus ki latest position `{lat,lng,timestamp}` | **80 sec** |
| `active_bus_ids` | Set | Kaunsi buses abhi active hain (read index — `KEYS` avoid karne ke liye) | — |
| `valid_bus_ids` | Set | Registered bus IDs ka cache (per-location Mongo read bachane ke liye) | — |

**Zombie cleanup:** `bus:<id>:live` pe **80s TTL** — bus band ho toh key khud expire ho jaati hai → dashboard se apne aap gayab. `active_bus_ids` SET mein bacha ID read time pe `SREM` se saaf hota hai.

### 🍃 MongoDB (cold / history data)

**`Bus` collection** (`busModel2.js`) — har location ek flat row:
```js
{ busId: String, lat: Number, lng: Number, timestamp: Date }
```
- **Compound index** `{ busId: 1, timestamp: 1 }` — history query fast
- **TTL index** `{ timestamp: 1 }` — **7 din baad rows auto-delete** (storage full nahi hota)

**`Tester` collection** (`betaUser.js`) — dashboard login users `{ username, password, name }`.

---

## 📡 API Reference

| Method | Endpoint | Auth | Kaam |
|--------|----------|------|------|
| `POST` | `/verify-bus` | ❌ | Bus ID valid hai? (driver start pe) — MongoDB check |
| `POST` | `/api/login` | ❌ | Dashboard user login → JWT token |
| `POST` | `/api/create-beta-user` | ❌ | Naya dashboard user banao |
| `GET` | `/live-location-all` | ✅ JWT | Saari active buses ki live location |
| `GET` | `/api/bus-history/:busId` | ✅ JWT | Ek bus ka route path (aaj / last 2hr) |
| `GET` | `/student` · `/map` | (`/student` JWT) | Dashboard HTML serve |
| `POST` | `/api/bus/dummy-location` | ❌ | Testing ke liye manual location inject |

**Auth:** Protected routes ko `Authorization: Bearer <token>` header chahiye. Token `/api/login` se milta hai, 3 din valid.

---

## 🔌 WebSocket Events

Connection: `io(BASE_URL, { transports: ['websocket'] })`

| Event | Direction | Payload | Kaam |
|-------|-----------|---------|------|
| `updateLocation` | Driver → Server | `{ busId, lat, lng, timestamp }` | Location update. Ack callback deta hai `{ status }` |
| `connect` / `disconnect` | — | — | Connection lifecycle |

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- MongoDB (Atlas ya local)
- Redis (cloud ya local)

### Backend

```bash
cd backend
npm install
# src/.env banao (neeche Environment Variables dekho)
npm start          # cross-env TZ=Asia/Kolkata node src/server.js
```
Server `http://localhost:5000` pe chalega (ya `.env` ka PORT).

### Driver App (Expo)

```bash
cd frontend/loco-frontend
npm install
# Constants.js mein BASE_URL apne backend pe point karo
npm start          # expo start
# QR scan (Expo Go) ya: npm run android
```

### Web Dashboard
Backend ke saath hi serve hota hai — browser mein `http://<backend>/student` (login chahiye) ya `/map` kholo.

### Load Test (optional)
```bash
cd backend
node src/stresstest.js   # 20 buses simulate karta hai
```

---

## 🔑 Environment Variables

`backend/src/.env` file:

```env
PORT=5000
MONGO_URI=<your-mongodb-connection-string>
JWT_SECRET=<strong-random-secret-min-64-chars>
REDIS_PASSWORD=<your-redis-password>
# Redis host/port abhi redis.js mein hai — ise bhi env mein le jaana recommended
```

> ⚠️ **Security:** `.env` ko kabhi git mein commit mat karo. `.gitignore` mein `.env` aur `node_modules/` add karo. (Detail ke liye `CODE_REVIEW_HINGLISH.md` dekho.)

---

## 🧠 Key Design Decisions

**1. Redis (hot) + MongoDB (cold) do stores kyun?**
Live "abhi bus kahan hai" har 20s padhna padta hai (fast chahiye) → Redis. "Bus kahan-kahan gayi" kabhi-kabhi chahiye (permanent) → MongoDB. Dono ka kaam alag, isliye do stores.

**2. Dashboard polling kyun, WebSocket kyun nahi?**
300 viewers ke liye 300 persistent WebSocket connections t2.micro pe khud bojh ban jaate. Simple HTTP polling (har 20s) + Redis SET read (~2 ops/request) sasta aur scale karta hai.

**3. `active_bus_ids` SET kyun (seedhe `KEYS` kyun nahi)?**
`KEYS bus:*:live` blocking + O(N) hai — har poll pe Redis freeze karta. Ek SET index se `SMEMBERS + MGET` = ~2 ops (vs 51). ~25× kam load. Zombie cleanup phir bhi key-level TTL se hota hai.

**4. Location interval 30s + frontend interpolation.**
30s ingestion load/battery kam rakhta hai. Bus "teleport" na dikhe isliye dashboard marker ko do points ke beech smoothly slide (interpolate) karta hai — data 30s pe, dikhna smooth.

**5. Background GPS + AsyncStorage.**
busId ko disk (AsyncStorage) pe save karte hain taaki app minimize/restart hone pe bhi background task busId padh sake — global variable pe depend nahi.

---

## 📊 Scaling & Capacity

Current optimized state (fixes ke baad):

| Load | 200 users, 20 buses | 300 users, 50 buses |
|------|--------------------|--------------------|
| Ingestion | ~0.67 writes/sec | ~1.67 writes/sec |
| Dashboard Redis ops | ~20 ops/sec | ~30 ops/sec |
| **t2.micro** | 🟢 Comfortable | 🟢 OK (t3.micro safer) |
| Redis free tier | 🟢 Easy | 🟢 Easy |
| Mongo M0 storage | 🟢 ~60 MB steady (7d TTL) | 🟢 controlled |

> **Redis connection limit note:** Free tier ka ~25 connection limit **backend instances** se juड़a hai, users se nahi. Ek t2.micro = ek Node process = ~1-2 Redis connections. Limit tabhi hit hoga jab ~25 parallel server instances scale karo.

Detail: `POTENTIAL_FALLBACK_HINGLISH.md` mein full back-of-envelope calculation hai.

---

## 📚 Related Docs

| Doc | Kya hai |
|-----|---------|
| `CODE_REVIEW_HINGLISH.md` | Security + correctness issues (bugs, secrets, auth) — 17 findings |
| `POTENTIAL_FALLBACK_HINGLISH.md` | Capacity/scale/accuracy analysis, load distribution |
| `OPTIMIZATION_DEEPDIVE_HINGLISH.md` | KEYS vs HASH, interpolation, t2 vs t3 deep-dive |
| `CHANGES.md` | Kiye gaye code changes ka log (kya/kyun + before/after) |

---

*Loco — real-time bus tracking, built for college transport.*
