# OneToken — Hospital Queue Coordination

> **One visit. One token. Every hospital queue connected.**

A prototype that links three hospital queues — **Registration → Doctor → Lab** — with one token per visit,
plus secure access to lab reports. When a doctor orders a test, the visit moves into the lab queue
automatically. Nobody registers twice.

**Use fictional patient data only.** This is a student prototype, not a medical system.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + React Router |
| Backend | Node.js + Express 5 |
| Live updates | Socket.IO (WebSockets), with 15-second polling as a fallback |
| Database | PostgreSQL. Uses embedded Postgres ([PGlite](https://pglite.dev)) by default, so nothing needs installing; set `DATABASE_URL` to use a real PostgreSQL server |

## Run it

Needs Node.js 20+.

```bash
npm install
```

Development (hot reload, two servers; open http://localhost:5173):

```bash
npm run dev
```

Single server (builds the client, then serves everything on http://localhost:4000):

```bash
npm run build
```

```bash
npm start
```

To use a real PostgreSQL database instead of the embedded one:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/hospital npm start
```

The tables are created automatically on startup. Embedded data and uploaded reports live in `server/data/`.

## Screens

| Screen | URL | What it does |
|---|---|---|
| Online booking | `/book` | Mobile-first: department → date → free slot → name, age, phone. Gives a booking code and a `/checkin/:code` link. Reserves a slot only |
| Phone check-in | `/checkin/:code` | "I've arrived" + the hall code from the display. Creates the visit and token, then opens the patient view |
| Patient view | `/patient` | Sign in with token + PIN. Shows the token, current stage, people ahead, estimated wait (approximate), next destination, journey, lab tests, and reports |
| Registration desk | `/registration` | Creates a visit and issues the token + 6-digit PIN slip (printable). Also has the registration queue, and **booked patient check-in** by booking code or phone (no hall code) |
| Doctor / lab dashboard | `/staff/doctor`, `/staff/lab` | Pick a counter, call the next patient, complete the stage, announce again, mark missed / restore. Doctors order lab tests; the lab releases fictional reports (text summary + optional PDF/PNG/JPG/TXT up to 5 MB) |
| Queue display | `/display` | Big-screen board: tokens being called now, next tokens, department status, approximate wait, and the rotating **hall code**. Flashes each call; optional spoken announcements |

## Demo script (about 3 minutes)

1. **Registration desk**: register "Asha Verma (fictional)". Note the token (`T-001`) and the PIN.
2. Open **Patient view** in another tab or on a phone. Sign in with that token and PIN.
3. Open **Queue display** on a third screen.
4. **Doctor dashboard**: *Call next*. The display flashes `T-001 → Room 1`, and the patient view turns orange.
5. Order **Lipid Profile**, then click *Complete consultation → Lab*.
6. The patient view now shows **Laboratory**, with the journey *Registration ✓ → Doctor ✓ → Lab (now)*. The token stays the same and nobody registered again.
7. **Lab dashboard**: *Call next* → *Fill sample* → *Release report* → *Sample collected — complete*.
8. **Patient view**: the report is there. Download the attached file.

### Booking demo (about 2 minutes)

1. **Book** (`/book`, ideally on a phone): Doctor Consultation → Today → the next free slot → a fictional name, age and phone. Note the booking code.
2. **Queue display** (`/display`): read the 4-digit hall code at the top. It changes every 3 minutes, with a countdown.
3. Open the **check-in link** from step 1 → *I've arrived* → enter the hall code.
4. The patient view opens with the new token and a one-time PIN banner. The booking had no token until now.
5. **Doctor dashboard**: the token is in the waiting list tagged *Booked HH:MM*. A desk-registered walk-in who arrives after that slot time goes behind it.
6. **Registration desk** → *Booked patient check-in*: search `DEMO02` or `9000000002` → *Check in*. That's the no-smartphone path. Try `DEMO03`, which has already been marked no-show: it checks in as a walk-in.
7. Missed flow: *Call next* → *Announce again* → *Mark missed* → *Restore*. The token returns with 2 people ahead.

Use *Reset demo data* on the home page between rehearsals. It clears everything and re-adds the sample bookings.

### Sample bookings (fictional)

Added on first start (empty database) and on every reset, timed relative to "now" so the demo works any time:

| Code | Patient | Slot | Purpose |
|---|---|---|---|
| `DEMO01` | Kabir Sen | next slot today | phone or desk check-in |
| `DEMO02` | Lina Thomas | next slot today | desk check-in by phone `9000000002` |
| `DEMO03` | Arjun Rao | an hour ago | already `no_show`; checks in as a walk-in |
| `DEMO04`, `DEMO05` | Priya Nair, Samir Khan | tomorrow 10:00 / 10:30 | shows "check in on the day" |

## How it works

**One visit, many queue entries.** A `visits` row holds the token. Each time the visit waits somewhere,
a `queue_entries` row is added (`waiting → called → done`). When a stage is completed, the server decides
the next stop in the same transaction:

- registration → doctor
- doctor → lab, if there are unreported lab orders; otherwise the visit is complete
- lab → visit complete (reports can still be released later, from *Reports to release*)

**Wait estimate (approximate, and labeled that way everywhere):**

```
estimate = (people ahead + 0.5 × patients being served) × average service time ÷ active counters
```

The average service time comes from the last 10 completed services in that department, blended with a
default (registration 2 min, doctor 8 min, lab 5 min) while there are only a few samples. The patient
sees a range (±30%) and the basis for the estimate. This is a good place to add an ML model later.

**Secure report access.**
- The 6-digit PIN is generated randomly and stored only as a salted scrypt hash. It is shown once, on the slip.
- Token + PIN are exchanged for a signed session that expires after 2 hours. The status and report endpoints require that session.
- A session can only read its own visit's reports. Asking for another visit's report returns 404.
- Repeated wrong PINs are rate-limited (8 attempts per 10 minutes).
- Uploaded files get random names and are never served as static files.
- The public display and the live socket broadcasts carry tokens only, never names.

## Booking and check-in rules

A booking **only reserves a slot**. The visit and token are created at check-in, in one transaction that
also links the booking (`appointments.visit_id`) and queues the patient for the doctor. After that the
existing registration → doctor → lab → report flow takes over unchanged.

- **Slots**: 30 minutes, 08:00–20:00 (server local time; override with `OPEN_HOUR` / `CLOSE_HOUR`), up to 7 days ahead.
  Each slot holds 10 patients, but only 7 can be booked online (30% kept for walk-ins). Bookings for the same slot are
  serialized with an advisory lock so it can't be overbooked. One active booking per phone per day.
- **Hall code**: 4 digits, derived from the server secret and the current 3-minute window (nothing stored).
  It is pushed over Socket.IO only to sockets in the `display` room, not to patient pages. The previous code is
  still accepted for 30 s after it changes. Wrong codes are rate-limited: 5 per booking and 15 per IP per 10 minutes.
- **Check-in window**: from 60 min before the slot, on the slot's day.
- **Queue order**: entries are ordered by `queue_entries.sort_at`:
  - walk-ins: the time they joined
  - booked and checked in no more than 15 min after the slot starts: the **slot time**, so they go ahead of walk-ins who arrived after the slot started
  - checked in more than 15 min late: the check-in time (treated as a walk-in)
- **No-show**: a sweep every 30 s marks `booked` appointments as `no_show` at slot + 15 min, which frees the slot.
  If the patient turns up later the same day they can still check in, as a walk-in.
- **Missed**: *Mark missed* is enabled once the token has been announced again. Missed tokens drop out of the queue,
  people-ahead and estimates. *Restore* within 30 min puts the token back with 2 people ahead (third in line).
  After 30 min the sweep expires the token and the visit, and the patient view says to go to the desk.

## API summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/meta` | Departments, counters, lab tests |
| GET | `/api/display` | Public board (no names) |
| GET | `/api/staff/overview` | All queues and lab orders for staff screens |
| POST | `/api/visits` | Register a visit and issue a token + PIN |
| POST | `/api/queues/:dept/call-next` | Call the next patient to a counter |
| POST | `/api/entries/:id/complete` | Finish the stage and route the visit onward |
| POST | `/api/entries/:id/missed` | Mark a called token missed (after one re-call) |
| POST | `/api/entries/:id/restore` | Restore a missed token (within 30 min) |
| GET | `/api/booking/options` | Bookable departments and dates |
| GET | `/api/booking/slots?department=&date=` | Slots with seats left |
| POST | `/api/booking` | Book a slot, returns the booking code |
| GET | `/api/booking/:code` | Booking status for the check-in page |
| POST | `/api/booking/:code/cancel` | Cancel a booking |
| POST | `/api/booking/:code/checkin` | Phone check-in with `hallCode` → token, PIN, patient session |
| GET | `/api/staff/appointments?q=` | Desk search by code or phone (blank = today) |
| POST | `/api/staff/appointments/:id/checkin` | Desk check-in, no hall code |
| POST | `/api/entries/:id/recall` | Announce again |
| POST | `/api/visits/:id/lab-orders` | Order a lab test |
| POST | `/api/lab-orders/:id/report` | Release a report (multipart: `summary`, optional `file`) |
| POST | `/api/patient/login` | Exchange token + PIN for a session |
| GET | `/api/patient/status` | Patient view data (requires a session) |
| GET | `/api/patient/reports/:id/file` | Download a report file (requires a session) |

## Known limits / next steps

- **Staff screens and the display have no login.** Add staff accounts and roles before using this anywhere real. Until then anyone who can reach the server could join the display room and read the hall code.
- Only Doctor Consultation takes bookings. Add more departments in `BOOKING` in `server/src/booking.js`.
- One token sequence per day (`T-001`, `T-002`, …), reset at midnight server time.
- Rate limiting and session signing keys are in memory. Set `SESSION_SECRET` to keep sessions valid across restarts.
- Ideas: SMS/WhatsApp alerts when a patient is 2 away, priority queues (elderly/emergency), more departments (pharmacy, radiology), and an AI wait-time model trained on `queue_entries`.

## Project layout

```
server/src/index.js     Express routes, Socket.IO, uploads
server/src/queue.js     Queue engine: routing, ordering, missed/restore, estimates, read models
server/src/booking.js   Slots, bookings, phone/desk check-in, demo seed
server/src/db.js        PostgreSQL / embedded PostgreSQL + schema
server/src/security.js  PIN hashing, signed sessions, hall code, rate limit
client/src/pages/       Home, Book, CheckIn, Patient, Registration, Staff, Display
client/src/components/  DeskPanel (shared counter UI), ReportForm
```
