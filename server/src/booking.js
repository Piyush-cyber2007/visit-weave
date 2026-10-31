// Online booking + check-in. A booking only reserves a slot; the visit and token
// are created at check-in (phone + hall code, or at the registration desk) and
// then flow through the existing registration -> doctor -> lab pipeline.
import crypto from 'node:crypto';
import { db } from './db.js';
import { DEPARTMENTS, HttpError, insertVisit } from './queue.js';

// Slot times are in the server's local time zone (the hospital's clock).
export const BOOKING = {
  doctor: {
    name: DEPARTMENTS.doctor.name,
    slotMinutes: 30,
    capacityPerSlot: 10,   // patients the doctors can see in one slot
    walkInShare: 0.3,      // kept free for walk-ins
    openHour: Number(process.env.OPEN_HOUR ?? 8),
    closeHour: Number(process.env.CLOSE_HOUR ?? 20),
  },
};
export const LATE_GRACE_MIN = 15;     // later than this -> walk-in; no check-in by then -> no_show
const EARLY_CHECKIN_MIN = 60;         // check-in opens this long before the slot
const BOOKING_DAYS_AHEAD = 7;
const MIN = 60 * 1000;

const bookableSeats = (cfg) => Math.floor(cfg.capacityPerSlot * (1 - cfg.walkInShare));

function bookingDept(key) {
  const cfg = BOOKING[key];
  if (!cfg) throw new HttpError(400, 'Choose a department that takes bookings.');
  return cfg;
}

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeLabel = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function parseLocalDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!m) throw new HttpError(400, 'Date must be YYYY-MM-DD.');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function bookingOptions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: BOOKING_DAYS_AHEAD }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return { date: localDate(d), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) };
  });
  return {
    departments: Object.entries(BOOKING).map(([key, cfg]) => ({
      key,
      name: cfg.name,
      slotMinutes: cfg.slotMinutes,
      hours: `${pad(cfg.openHour)}:00–${pad(cfg.closeHour)}:00`,
    })),
    dates,
    lateGraceMin: LATE_GRACE_MIN,
  };
}

function slotStartsFor(cfg, day) {
  const starts = [];
  for (let m = cfg.openHour * 60; m < cfg.closeHour * 60; m += cfg.slotMinutes) {
    const d = new Date(day);
    d.setMinutes(m);
    starts.push(d);
  }
  return starts;
}

export async function listSlots(department, date) {
  const cfg = bookingDept(department);
  const day = parseLocalDate(date);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  const { rows } = await db.query(
    `SELECT slot_start, COUNT(*)::int AS taken FROM appointments
      WHERE department = $1 AND slot_start >= $2 AND slot_start < $3 AND status IN ('booked', 'checked_in')
      GROUP BY slot_start`,
    [department, day, next],
  );
  const seats = bookableSeats(cfg);
  const now = Date.now();
  return slotStartsFor(cfg, day).map((start) => {
    const taken = rows.find((r) => new Date(r.slot_start).getTime() === start.getTime())?.taken ?? 0;
    const remaining = Math.max(0, seats - taken);
    return { start, label: timeLabel(start), remaining, available: remaining > 0 && start.getTime() > now };
  });
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newBookingCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const normalizeCode = (code) => String(code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizePhone = (phone) => String(phone ?? '').replace(/\D/g, '');

export async function createBooking({ department, slotStart, fullName, age, phone }) {
  const cfg = bookingDept(department);
  const name = String(fullName ?? '').trim();
  const digits = normalizePhone(phone);
  if (!name) throw new HttpError(400, 'Name is required.');
  if (digits.length < 10 || digits.length > 13) throw new HttpError(400, 'Enter a 10–13 digit phone number.');
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Choose a slot.');
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  if (!slotStartsFor(cfg, day).some((s) => s.getTime() === start.getTime())) throw new HttpError(400, 'That is not a valid slot.');
  if (start.getTime() <= Date.now()) throw new HttpError(409, 'That slot has already started. Pick a later one.');
  if (start.getTime() > Date.now() + BOOKING_DAYS_AHEAD * 24 * 60 * MIN) throw new HttpError(400, 'Bookings open 7 days ahead.');

  return db.tx(async (q) => {
    // Serialize bookings for the same slot so capacity can't be overbooked.
    await q.query('SELECT pg_advisory_xact_lock($1)', [Math.floor(start.getTime() / MIN)]);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dup = await q.query(
      `SELECT 1 FROM appointments WHERE phone = $1 AND department = $2 AND status = 'booked'
          AND slot_start >= $3 AND slot_start < $4`,
      [digits, department, day, dayEnd],
    );
    if (dup.rows.length) throw new HttpError(409, 'This phone number already has a booking that day.');
    const { rows: [{ taken }] } = await q.query(
      `SELECT COUNT(*)::int AS taken FROM appointments
        WHERE department = $1 AND slot_start = $2 AND status IN ('booked', 'checked_in')`,
      [department, start],
    );
    if (taken >= bookableSeats(cfg)) throw new HttpError(409, 'That slot just filled up. Please pick another.');
    const { rows: [appt] } = await q.query(
      `INSERT INTO appointments (full_name, age, phone, department, slot_start, booking_code)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, age ? Number(age) : null, digits, department, start, newBookingCode()],
    );
    return publicView(appt);
  });
}

function publicView(a) {
  const slot = new Date(a.slot_start);
  return {
    bookingCode: a.booking_code,
    firstName: a.full_name.split(/\s+/)[0],
    department: a.department,
    departmentName: BOOKING[a.department]?.name ?? a.department,
    slotStart: slot,
    slotLabel: `${slot.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeLabel(slot)}`,
    status: a.status,
    checkInOpensAt: new Date(slot.getTime() - EARLY_CHECKIN_MIN * MIN),
    lateAfter: new Date(slot.getTime() + LATE_GRACE_MIN * MIN),
  };
}

export async function getBooking(code) {
  const { rows: [a] } = await db.query(
    `SELECT a.*, v.token FROM appointments a LEFT JOIN visits v ON v.id = a.visit_id WHERE a.booking_code = $1`,
    [normalizeCode(code)],
  );
  if (!a) throw new HttpError(404, 'Booking not found. Check the code.');
  return { ...publicView(a), token: a.token ?? null };
}

export async function cancelBooking(code) {
  const { rows } = await db.query(
    `UPDATE appointments SET status = 'cancelled' WHERE booking_code = $1 AND status = 'booked' RETURNING *`,
    [normalizeCode(code)],
  );
  if (!rows.length) throw new HttpError(409, 'Only an active booking can be cancelled.');
  return publicView(rows[0]);
}

// Shared by phone and desk check-in: one transaction creates the visit + token,
// links it to the booking and queues the patient for the doctor.
async function checkIn(q, appt) {
  if (appt.status === 'checked_in') throw new HttpError(409, 'This booking is already checked in.');
  if (appt.status === 'cancelled') throw new HttpError(409, 'This booking was cancelled.');
  const now = Date.now();
  const slot = new Date(appt.slot_start);
  if (localDate(slot) !== localDate(new Date(now))) {
    throw new HttpError(409, `This booking is for ${publicView(appt).slotLabel}. Check in on that day.`);
  }
  if (now < slot.getTime() - EARLY_CHECKIN_MIN * MIN) {
    throw new HttpError(409, `Check-in opens at ${timeLabel(new Date(slot.getTime() - EARLY_CHECKIN_MIN * MIN))}.`);
  }
  // On time: queue by slot time, ahead of walk-ins who came later. More than
  // 15 min late (including bookings already swept to no_show): walk-in order.
  const onTime = now <= slot.getTime() + LATE_GRACE_MIN * MIN;
  const visit = await insertVisit(q, {
    fullName: appt.full_name,
    age: appt.age,
    reason: `Booked ${timeLabel(slot)} (${appt.booking_code})${onTime ? '' : ' — arrived late, joined as walk-in'}`,
    completeRegistration: true,
    sortAt: onTime ? slot : null,
  });
  await q.query(
    `UPDATE appointments SET status = 'checked_in', visit_id = $2, checked_in_at = now() WHERE id = $1`,
    [appt.id, visit.visitId],
  );
  return { ...visit, onTime, bookingCode: appt.booking_code, slotLabel: timeLabel(slot) };
}

export async function phoneCheckIn(code) {
  return db.tx(async (q) => {
    const { rows: [appt] } = await q.query(
      'SELECT * FROM appointments WHERE booking_code = $1 FOR UPDATE',
      [normalizeCode(code)],
    );
    if (!appt) throw new HttpError(404, 'Booking not found.');
    return checkIn(q, appt);
  });
}

export async function deskCheckIn(appointmentId) {
  return db.tx(async (q) => {
    const { rows: [appt] } = await q.query('SELECT * FROM appointments WHERE id = $1 FOR UPDATE', [appointmentId]);
    if (!appt) throw new HttpError(404, 'Booking not found.');
    return checkIn(q, appt);
  });
}

// Desk search by booking code or phone; blank shows today's bookings.
export async function searchAppointments(query) {
  const code = normalizeCode(query);
  const digits = normalizePhone(query);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const { rows } = await db.query(
    `SELECT a.*, v.token FROM appointments a LEFT JOIN visits v ON v.id = a.visit_id
      WHERE ($1 = '' AND a.slot_start >= $3 AND a.slot_start < $4)
         OR ($1 <> '' AND (a.booking_code = $1 OR (length($2) >= 4 AND a.phone LIKE '%' || $2)))
      ORDER BY a.slot_start
      LIMIT 50`,
    [code, digits, today, tomorrow],
  );
  return rows.map((a) => ({
    id: a.id,
    fullName: a.full_name,
    age: a.age,
    phone: a.phone,
    ...publicView(a),
    token: a.token ?? null,
    canCheckIn: ['booked', 'no_show'].includes(a.status) && localDate(new Date(a.slot_start)) === localDate(new Date()),
  }));
}

// Demo bookings relative to "now" so the check-in flow works whenever you demo.
export async function seedBookings() {
  const cfg = BOOKING.doctor;
  const step = cfg.slotMinutes * MIN;
  const nextSlot = new Date();
  const minutes = nextSlot.getHours() * 60 + nextSlot.getMinutes() + 1;
  nextSlot.setHours(0, Math.ceil(minutes / cfg.slotMinutes) * cfg.slotMinutes, 0, 0);
  const previousSlot = new Date(nextSlot.getTime() - 2 * step);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const tomorrowLater = new Date(tomorrow.getTime() + step);

  const seeds = [
    ['DEMO01', 'Kabir Sen (fictional)', 41, '9000000001', nextSlot],
    ['DEMO02', 'Lina Thomas (fictional)', 29, '9000000002', nextSlot],
    ['DEMO03', 'Arjun Rao (fictional)', 63, '9000000003', previousSlot],   // swept to no_show
    ['DEMO04', 'Priya Nair (fictional)', 35, '9000000004', tomorrow],
    ['DEMO05', 'Samir Khan (fictional)', 52, '9000000005', tomorrowLater],
  ];
  for (const [code, fullName, age, phone, slot] of seeds) {
    // Seeds ignore opening hours / past-slot checks so the demo works any time.
    await db.query(
      `INSERT INTO appointments (full_name, age, phone, department, slot_start, booking_code)
       VALUES ($1, $2, $3, 'doctor', $4, $5) ON CONFLICT (booking_code) DO NOTHING`,
      [fullName, age, phone, slot, code],
    );
  }
  return seeds.map(([code, name, , , slot]) => `${code}  ${timeLabel(slot)}  ${name}`);
}
