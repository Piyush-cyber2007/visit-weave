import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { Server } from 'socket.io';
import { DATA_DIR, db, initDb } from './db.js';
import * as booking from './booking.js';
import * as queue from './queue.js';
import { HttpError } from './queue.js';
import {
  checkHallCode,
  clearFailures,
  currentHallCode,
  issueSession,
  readSession,
  recordFailure,
  tooManyAttempts,
} from './security.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CLIENT_DIST = path.resolve(here, '../../client/dist');
mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const server = createServer(app);
const io = new Server(server);
app.use(express.json());

// Every change broadcasts a content-free "changed" signal; screens refetch what
// they are allowed to see. Calls also broadcast a token announcement.
const changed = () => io.emit('changed');
const announce = (e) =>
  io.emit('announce', { token: e.token, department: e.department, departmentName: queue.DEPARTMENTS[e.department].name, counter: e.counter });

// The hall code goes only to sockets that joined the display room, never to
// every client, so a patient at home can't read it off the socket.
io.on('connection', (socket) => {
  socket.on('display:join', () => {
    socket.join('display');
    socket.emit('hallcode', currentHallCode());
  });
});
function scheduleHallCode() {
  const { expiresAt } = currentHallCode();
  setTimeout(() => {
    io.to('display').emit('hallcode', currentHallCode());
    scheduleHallCode();
  }, expiresAt.getTime() - Date.now() + 50);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(415, 'Report file must be a PDF, PNG, JPG or TXT.')),
});

// ---------- shared ----------

app.get('/api/meta', (_req, res) => {
  res.json({ departments: queue.DEPARTMENTS, order: queue.DEPT_ORDER, labTests: queue.LAB_TESTS });
});

app.get('/api/display', async (_req, res) => {
  res.json(await queue.displayBoard());
});

// ---------- staff (prototype: no staff login) ----------

app.get('/api/staff/overview', async (_req, res) => {
  res.json(await queue.staffOverview());
});

app.post('/api/visits', async (req, res) => {
  const visit = await queue.createVisit(req.body ?? {});
  changed();
  res.status(201).json(visit);
});

app.post('/api/queues/:dept/call-next', async (req, res) => {
  const called = await queue.callNext(req.params.dept, req.body?.counter);
  changed();
  announce(called);
  res.json(called);
});

app.post('/api/entries/:id/recall', async (req, res) => {
  const entry = await queue.recall(Number(req.params.id));
  changed();   // recall count unlocks "Mark missed"
  announce(entry);
  res.json(entry);
});

app.post('/api/entries/:id/missed', async (req, res) => {
  const result = await queue.markMissed(Number(req.params.id));
  changed();
  res.json(result);
});

app.post('/api/entries/:id/restore', async (req, res) => {
  try {
    const result = await queue.restoreMissed(Number(req.params.id));
    res.json(result);
  } finally {
    changed();   // an expired token also changes the board
  }
});

app.post('/api/entries/:id/complete', async (req, res) => {
  const result = await queue.completeStage(Number(req.params.id));
  changed();
  res.json(result);
});

app.post('/api/visits/:id/lab-orders', async (req, res) => {
  const order = await queue.addLabOrder(Number(req.params.id), req.body?.testName, req.body?.notes);
  changed();
  res.status(201).json(order);
});

app.post('/api/lab-orders/:id/report', upload.single('file'), async (req, res) => {
  const result = await queue.releaseReport(Number(req.params.id), req.body?.summary, req.file);
  changed();
  res.status(201).json(result);
});

app.get('/api/staff/appointments', async (req, res) => {
  res.json(await booking.searchAppointments(req.query.q ?? ''));
});

// Desk check-in for patients without smartphones: no hall code needed.
app.post('/api/staff/appointments/:id/checkin', async (req, res) => {
  const result = await booking.deskCheckIn(Number(req.params.id));
  changed();
  res.status(201).json(result);
});

app.post('/api/admin/reset', async (_req, res) => {
  await db.reset();
  await booking.seedBookings();
  await queue.sweep(booking.LATE_GRACE_MIN);
  changed();
  res.json({ ok: true });
});

// ---------- public booking ----------

app.get('/api/booking/options', (_req, res) => {
  res.json(booking.bookingOptions());
});

app.get('/api/booking/slots', async (req, res) => {
  res.json(await booking.listSlots(req.query.department, req.query.date));
});

app.post('/api/booking', async (req, res) => {
  const created = await booking.createBooking(req.body ?? {});
  changed();
  res.status(201).json(created);
});

app.get('/api/booking/:code', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await booking.getBooking(req.params.code));
});

app.post('/api/booking/:code/cancel', async (req, res) => {
  const result = await booking.cancelBooking(req.params.code);
  changed();
  res.json(result);
});

// Phone check-in: proves the patient is in the hall via the rotating code.
app.post('/api/booking/:code/checkin', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const keys = [`hall|${req.ip}|${code}`, `hall|${req.ip}`];
  if (tooManyAttempts(keys[0], 5) || tooManyAttempts(keys[1], 15)) {
    throw new HttpError(429, 'Too many wrong hall codes. Please wait 10 minutes or check in at the registration desk.');
  }
  if (!checkHallCode(req.body?.hallCode)) {
    keys.forEach((k) => recordFailure(k));
    throw new HttpError(400, 'That hall code is not right. Check the display screen in the waiting hall.');
  }
  clearFailures(keys[0]);
  const result = await booking.phoneCheckIn(code);
  changed();
  res.status(201).json({ ...result, session: issueSession(result.visitId) });
});

// ---------- patient (token + PIN -> session) ----------

app.post('/api/patient/login', async (req, res) => {
  const key = `${req.ip}|${String(req.body?.token ?? '').toUpperCase()}`;
  if (tooManyAttempts(key)) throw new HttpError(429, 'Too many attempts. Please wait 10 minutes or ask the desk.');
  const visitId = await queue.findVisitByPin(req.body?.token, req.body?.pin);
  if (!visitId) {
    recordFailure(key);
    throw new HttpError(401, 'Token or PIN is incorrect.');
  }
  clearFailures(key);
  res.json({ session: issueSession(visitId) });
});

function patientOnly(req, _res, next) {
  const visitId = readSession(req.get('authorization'));
  if (!visitId) throw new HttpError(401, 'Session expired. Please enter your token and PIN again.');
  req.visitId = visitId;
  next();
}

app.get('/api/patient/status', patientOnly, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await queue.patientStatus(req.visitId));
});

app.get('/api/patient/reports/:id/file', patientOnly, async (req, res) => {
  const file = await queue.reportFile(req.visitId, Number(req.params.id));
  res.set('Cache-Control', 'no-store');
  res.type(file.file_type);
  res.download(path.join(UPLOAD_DIR, path.basename(file.file_path)), file.file_name);
});

// ---------- built client (npm run build) ----------

if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
});

const kind = await initDb();
const seeded = await db.query('SELECT 1 FROM appointments LIMIT 1');
if (!seeded.rows.length) {
  const lines = await booking.seedBookings();
  console.log(`Seeded demo bookings:\n  ${lines.join('\n  ')}`);
}

async function runSweep() {
  try {
    if (await queue.sweep(booking.LATE_GRACE_MIN)) changed();
  } catch (err) {
    console.error('sweep failed', err);
  }
}
await runSweep();
setInterval(runSweep, 30 * 1000);
scheduleHallCode();

server.listen(PORT, () => {
  console.log(`Hospital queue API on http://localhost:${PORT}  (database: ${kind})`);
});
