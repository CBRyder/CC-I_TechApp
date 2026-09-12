# Road/Shop Tech App

Mobile app for road techs and shop techs: daily clock in/out, job selection with
travel/work/pause/finish states, per-user customization, and timesheet submission.
Modeled loosely on BuildOps.

Full plan and data model: see `docs/architecture-and-plan.md` (mirrors the project doc).

## Stack

- **mobile/** — React Native (Expo)
- **backend/** — Node.js + Express + PostgreSQL

## Getting started

### Backend

```
cd backend
cp .env.example .env      # fill in your Postgres connection string + a JWT secret
npm install
npm run db:migrate         # runs migrations/001_init.sql against your database
npm run dev                 # starts the API on http://localhost:3000
```

### Mobile

```
cd mobile
npm install
npx expo start
```

Point the mobile app at your backend by setting `API_BASE_URL` in `mobile/src/api/client.js`
(defaults to `http://localhost:3000`, which works with `expo start` + an iOS
simulator; for a physical device or Android emulator use your machine's LAN IP).

## Status

Initial scaffold: auth (register/login/refresh/auto sign-in), clock in/out, job
selection with travel/work/pause/finish state transitions, and a first pass at
timesheet generation + submission. Per-user customization and admin/shop-side
review are not built yet — see the open questions in the architecture doc.
