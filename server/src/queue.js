// Queue engine: one visit, one token, moving through
// registration -> doctor -> (lab, if ordered) without re-registering.
import { db } from './db.js';
import { hashPin, newPin, verifyPin } from './security.js';

export const DEPARTMENTS = {
  registration: {
    key: 'registration',
    name: 'Registration',
    area: 'Registration Hall',
    counters: ['Desk 1', 'Desk 2'],
    defaultServiceSec: 120,
  },
  doctor: {
    key: 'doctor',
    name: 'Doctor Consultation',
    area: 'OPD Waiting Area',
    counters: ['Room 1', 'Room 2'],
    defaultServiceSec: 480,
  },
  lab: {
    key: 'lab',
    name: 'Laboratory',
    area: 'Lab Waiting Area',
    counters: ['Sample Counter 1', 'Sample Counter 2'],
    defaultServiceSec: 300,
  },
};
export const DEPT_ORDER = ['registration', 'doctor', 'lab'];

export const LAB_TESTS = [
  'Complete Blood Count (CBC)',
  'Fasting Blood Glucose',
  'Lipid Profile',
  'Thyroid Panel (TSH)',
  'Urinalysis',
  'Liver Function Test',
];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const RECENT_SAMPLE = 10;   // completed services used for the estimate
const PRIOR_WEIGHT = 3;     // how strongly the default service time counts when samples are few

// ---------- estimates ----------

// Average service time per department from the most recent completed services,
// blended with a default when there are only a few samples.
async function serviceStats(q = db) {
  const { rows } = await q.query(
    `SELECT department,
            AVG(EXTRACT(EPOCH FROM (completed_at - called_at)))::float8 AS avg_sec,
            COUNT(*)::int AS n
       FROM (SELECT department, called_at, completed_at,
                    ROW_NUMBER() OVER (PARTITION BY department ORDER BY completed_at DESC) AS rn
               FROM queue_entries
              WHERE status = 'done' AND called_at IS NOT NULL
                AND completed_at > now() - interval '12 hours') t
      WHERE rn <= $1
      GROUP BY department`,
    [RECENT_SAMPLE],
  );
  const active = await q.query(
    `SELECT department, COUNT(DISTINCT counter)::int AS counters
       FROM queue_entries
      WHERE counter IS NOT NULL
        AND (status = 'called' OR completed_at > now() - interval '30 minutes')
      GROUP BY department`,
  );
  const stats = {};
  for (const key of DEPT_ORDER) {
    const def = DEPARTMENTS[key].defaultServiceSec;
    const row = rows.find((r) => r.department === key);
    const n = row?.n ?? 0;
    const blended = (n * (row?.avg_sec ?? 0) + PRIOR_WEIGHT * def) / (n + PRIOR_WEIGHT);
    stats[key] = {
      avgServiceSec: Math.min(Math.max(blended, 30), 40 * 60),
      samples: n,
      activeCounters: Math.max(1, active.rows.find((r) => r.department === key)?.counters ?? 1),
    };
  }
  return stats;
}

function estimate(peopleAhead, busy, stat) {
  const sec = ((peopleAhead + busy * 0.5) * stat.avgServiceSec) / stat.activeCounters;
  const minutes = Math.round(sec / 60);
  return {
    minutes,
    low: Math.max(0, Math.floor((sec * 0.7) / 60)),
    high: Math.ceil((sec * 1.3) / 60),
    approximate: true,
    basis: stat.samples
      ? `Approximate. Based on ${peopleAhead} ahead and the last ${stat.samples} service time${stat.samples > 1 ? 's' : ''}.`
      : `Approximate. Based on ${peopleAhead} ahead and a typical service time.`,
  };
}

// ---------- visits ----------

export async function createVisit({ fullName, age, sex, reason, completeRegistration }) {
  return db.tx((q) => insertVisit(q, { fullName, age, sex, reason, completeRegistration }));
}

// Creates patient + visit + token inside the caller's transaction. `sortAt` sets
// the doctor-queue position (slot time for on-time bookings); default is now.
export async function insertVisit(q, { fullName, age, sex, reason, completeRegistration, sortAt = null }) {
  const name = String(fullName ?? '').trim();
  if (!name) throw new HttpError(400, 'Patient name is required.');
  const pin = newPin();

  const visit = await (async () => {
    const patient = await q.query(
      'INSERT INTO patients (full_name, age, sex) VALUES ($1, $2, $3) RETURNING id',
      [name, age ? Number(age) : null, sex || null],
    );
    const { rows: [{ next }] } = await q.query(
      'SELECT (COALESCE(MAX(seq), 0) + 1)::int AS next FROM visits WHERE visit_date = CURRENT_DATE',
    );
    const token = `T-${String(next).padStart(3, '0')}`;
    const { rows: [v] } = await q.query(
      `INSERT INTO visits (patient_id, token, seq, reason, pin_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, token, created_at`,
      [patient.rows[0].id, token, next, reason || null, hashPin(pin)],
    );
    if (completeRegistration) {
      // Registered at the desk on the spot: record the stage as done (no service
      // time, so it does not skew estimates) and go straight to the doctor queue.
      await q.query(
        `INSERT INTO queue_entries (visit_id, department, status, completed_at)
         VALUES ($1, 'registration', 'done', now())`,
        [v.id],
      );
      await q.query(
        `INSERT INTO queue_entries (visit_id, department, sort_at)
         VALUES ($1, 'doctor', COALESCE($2::timestamptz, now()))`,
        [v.id, sortAt],
      );
    } else {
      await q.query(`INSERT INTO queue_entries (visit_id, department) VALUES ($1, 'registration')`, [v.id]);
    }
    return v;
  })();

  return {
    visitId: visit.id,
    token: visit.token,
    pin,
    patientName: name,
    firstStop: completeRegistration ? DEPARTMENTS.doctor.name : DEPARTMENTS.registration.name,
    createdAt: visit.created_at,
  };
}

// ---------- staff actions ----------

function assertDept(dept) {
  if (!DEPARTMENTS[dept]) throw new HttpError(404, `Unknown department "${dept}".`);
}

export async function callNext(dept, counter) {
  assertDept(dept);
  if (!DEPARTMENTS[dept].counters.includes(counter)) throw new HttpError(400, 'Choose a valid counter.');
  return db.tx(async (q) => {
    const busy = await q.query(
      `SELECT v.token FROM queue_entries e JOIN visits v ON v.id = e.visit_id
        WHERE e.department = $1 AND e.counter = $2 AND e.status = 'called'`,
      [dept, counter],
    );
    if (busy.rows.length) {
      throw new HttpError(409, `${counter} is still serving ${busy.rows[0].token}. Complete it or mark it missed first.`);
    }
    const next = await q.query(
      `SELECT id FROM queue_entries WHERE department = $1 AND status = 'waiting'
        ORDER BY sort_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [dept],
    );
    if (!next.rows.length) throw new HttpError(404, 'Nobody is waiting.');
    const { rows: [called] } = await q.query(
      `UPDATE queue_entries e SET status = 'called', counter = $2, called_at = now(), recall_count = 0
         FROM visits v WHERE e.id = $1 AND v.id = e.visit_id
       RETURNING e.id, e.department, e.counter, v.token`,
      [next.rows[0].id, counter],
    );
    return called;
  });
}

async function calledEntry(q, entryId) {
  const { rows } = await q.query(
    `SELECT e.*, v.token FROM queue_entries e JOIN visits v ON v.id = e.visit_id
      WHERE e.id = $1 FOR UPDATE OF e`,
    [entryId],
  );
  const entry = rows[0];
  if (!entry) throw new HttpError(404, 'Queue entry not found.');
  if (entry.status !== 'called') throw new HttpError(409, `${entry.token} is not currently being served.`);
  return entry;
}

export async function recall(entryId) {
  const { rows } = await db.query(
    `UPDATE queue_entries e SET recall_count = recall_count + 1
       FROM visits v WHERE e.id = $1 AND e.status = 'called' AND v.id = e.visit_id
     RETURNING e.id, e.department, e.counter, e.recall_count, v.token`,
    [entryId],
  );
  if (!rows.length) throw new HttpError(409, 'Only a called token can be announced again.');
  return rows[0];
}

export const RESTORE_WINDOW_MIN = 30;

// Called but not present, even after one re-call: take them out of the queue
// (and out of "people ahead" / estimates) until restored or expired.
export async function markMissed(entryId) {
  return db.tx(async (q) => {
    const entry = await calledEntry(q, entryId);
    if (entry.recall_count < 1) throw new HttpError(409, `Announce ${entry.token} again once before marking it missed.`);
    await q.query(
      `UPDATE queue_entries SET status = 'missed', missed_at = now(), counter = NULL WHERE id = $1`,
      [entry.id],
    );
    return { token: entry.token };
  });
}

// Within the restore window, put the token back with two people ahead of it.
export async function restoreMissed(entryId) {
  const result = await db.tx(async (q) => {
    const { rows: [entry] } = await q.query(
      `SELECT e.*, v.token, (e.missed_at > now() - make_interval(mins => $2)) AS in_window
         FROM queue_entries e JOIN visits v ON v.id = e.visit_id
        WHERE e.id = $1 FOR UPDATE OF e`,
      [entryId, RESTORE_WINDOW_MIN],
    );
    if (!entry) throw new HttpError(404, 'Queue entry not found.');
    if (entry.status !== 'missed') throw new HttpError(409, `${entry.token} is not in the missed list.`);
    if (!entry.in_window) {
      // Commit the expiry, then report it (throwing here would roll it back).
      await expireEntries(q, [entry.id]);
      return { expired: true, token: entry.token };
    }
    const { rows: front } = await q.query(
      `SELECT sort_at FROM queue_entries WHERE department = $1 AND status = 'waiting'
        ORDER BY sort_at, id LIMIT 3`,
      [entry.department],
    );
    const ms = (r) => new Date(r.sort_at).getTime();
    let sortAt;
    if (front.length >= 3) sortAt = new Date((ms(front[1]) + ms(front[2])) / 2);
    else if (front.length) sortAt = new Date(ms(front[front.length - 1]) + 1);
    else sortAt = new Date();
    await q.query(
      `UPDATE queue_entries SET status = 'waiting', sort_at = $2, missed_at = NULL, called_at = NULL,
              counter = NULL, recall_count = 0
        WHERE id = $1`,
      [entry.id, sortAt],
    );
    return { token: entry.token, position: Math.min(front.length, 2) + 1 };
  });
  if (result.expired) {
    throw new HttpError(409, `${result.token} expired (missed more than ${RESTORE_WINDOW_MIN} min ago). Please register again.`);
  }
  return result;
}

async function expireEntries(q, ids) {
  if (!ids.length) return;
  const { rows } = await q.query(
    `UPDATE queue_entries SET status = 'expired' WHERE id = ANY($1::int[]) RETURNING visit_id`,
    [ids],
  );
  await q.query(
    `UPDATE visits SET status = 'expired', completed_at = now() WHERE id = ANY($1::int[]) AND status = 'active'`,
    [rows.map((r) => r.visit_id)],
  );
}

// Periodic housekeeping: expire missed tokens past the restore window and mark
// bookings with no check-in by slot + grace as no-shows (freeing the slot).
export async function sweep(graceMin) {
  return db.tx(async (q) => {
    const missed = await q.query(
      `SELECT id FROM queue_entries
        WHERE status = 'missed' AND missed_at <= now() - make_interval(mins => $1)`,
      [RESTORE_WINDOW_MIN],
    );
    await expireEntries(q, missed.rows.map((r) => r.id));
    const noShows = await q.query(
      `UPDATE appointments SET status = 'no_show'
        WHERE status = 'booked' AND slot_start + make_interval(mins => $1) < now()
      RETURNING id`,
      [graceMin],
    );
    return missed.rows.length + noShows.rows.length > 0;
  });
}

// Finish the current stage and route the same visit to its next queue.
export async function completeStage(entryId) {
  return db.tx(async (q) => {
    const entry = await calledEntry(q, entryId);
    await q.query(`UPDATE queue_entries SET status = 'done', completed_at = now() WHERE id = $1`, [entry.id]);

    let next = null;
    if (entry.department === 'registration') {
      next = 'doctor';
    } else if (entry.department === 'doctor') {
      const pending = await q.query(
        `SELECT 1 FROM lab_orders WHERE visit_id = $1 AND status = 'ordered' LIMIT 1`,
        [entry.visit_id],
      );
      if (pending.rows.length) next = 'lab';
    }

    if (next) {
      await q.query(`INSERT INTO queue_entries (visit_id, department) VALUES ($1, $2)`, [entry.visit_id, next]);
    } else {
      await q.query(`UPDATE visits SET status = 'completed', completed_at = now() WHERE id = $1`, [entry.visit_id]);
    }
    return { token: entry.token, from: entry.department, next };
  });
}

export async function addLabOrder(visitId, testName, notes) {
  if (!LAB_TESTS.includes(testName)) throw new HttpError(400, 'Choose a test from the list.');
  return db.tx(async (q) => {
    const { rows: [visit] } = await q.query('SELECT id, token, status FROM visits WHERE id = $1', [visitId]);
    if (!visit) throw new HttpError(404, 'Visit not found.');
    if (visit.status !== 'active') throw new HttpError(409, `${visit.token} has already completed the visit.`);
    const dup = await q.query(
      `SELECT 1 FROM lab_orders WHERE visit_id = $1 AND test_name = $2 AND status = 'ordered'`,
      [visitId, testName],
    );
    if (dup.rows.length) throw new HttpError(409, `${testName} is already ordered for ${visit.token}.`);
    const { rows: [order] } = await q.query(
      `INSERT INTO lab_orders (visit_id, test_name, notes) VALUES ($1, $2, $3) RETURNING id, test_name`,
      [visitId, testName, notes || null],
    );
    // If the doctor already sent the patient on, join the lab queue now.
    const inFlow = await q.query(
      `SELECT 1 FROM queue_entries WHERE visit_id = $1 AND status IN ('waiting', 'called')`,
      [visitId],
    );
    if (!inFlow.rows.length) {
      await q.query(`INSERT INTO queue_entries (visit_id, department) VALUES ($1, 'lab')`, [visitId]);
    }
    return { ...order, token: visit.token };
  });
}

export async function releaseReport(orderId, summary, file) {
  const text = String(summary ?? '').trim();
  if (!text) throw new HttpError(400, 'Report summary is required.');
  return db.tx(async (q) => {
    const { rows: [order] } = await q.query(
      `SELECT o.*, v.token FROM lab_orders o JOIN visits v ON v.id = o.visit_id WHERE o.id = $1 FOR UPDATE OF o`,
      [orderId],
    );
    if (!order) throw new HttpError(404, 'Lab order not found.');
    if (order.status === 'reported') throw new HttpError(409, 'A report was already released for this order.');
    await q.query(
      `INSERT INTO reports (lab_order_id, visit_id, summary, file_name, file_path, file_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.id, order.visit_id, text, file?.originalname ?? null, file?.filename ?? null, file?.mimetype ?? null],
    );
    await q.query(`UPDATE lab_orders SET status = 'reported' WHERE id = $1`, [order.id]);
    return { token: order.token, testName: order.test_name };
  });
}

// ---------- read models ----------

export async function staffOverview() {
  const stats = await serviceStats();
  const { rows: entries } = await db.query(
    `SELECT e.id, e.visit_id, e.department, e.status, e.counter, e.joined_at, e.called_at,
            e.recall_count, e.missed_at, e.sort_at, v.token, v.reason, p.full_name, p.age, p.sex,
            a.slot_start, a.booking_code
       FROM queue_entries e
       JOIN visits v ON v.id = e.visit_id
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN appointments a ON a.visit_id = v.id
      WHERE e.status IN ('waiting', 'called', 'missed')
      ORDER BY e.sort_at, e.id`,
  );
  const { rows: orders } = await db.query(
    `SELECT o.id, o.visit_id, o.test_name, o.notes, o.status, o.ordered_at, v.token, p.full_name,
            EXISTS (SELECT 1 FROM queue_entries e WHERE e.visit_id = o.visit_id
                     AND e.department = 'lab' AND e.status = 'done') AS sample_collected
       FROM lab_orders o
       JOIN visits v ON v.id = o.visit_id
       JOIN patients p ON p.id = v.patient_id
      WHERE o.status = 'ordered' OR o.ordered_at > now() - interval '12 hours'
      ORDER BY o.ordered_at`,
  );
  const { rows: today } = await db.query(
    `SELECT department, COUNT(*)::int AS served FROM queue_entries
      WHERE status = 'done' AND called_at IS NOT NULL AND completed_at::date = CURRENT_DATE
      GROUP BY department`,
  );

  const ordersFor = (visitId) => orders.filter((o) => o.visit_id === visitId).map(orderView);
  const departments = {};
  for (const key of DEPT_ORDER) {
    const mine = entries.filter((e) => e.department === key);
    departments[key] = {
      ...DEPARTMENTS[key],
      serving: mine.filter((e) => e.status === 'called').map((e) => ({ ...entryView(e), labOrders: ordersFor(e.visit_id) })),
      waiting: mine.filter((e) => e.status === 'waiting').map((e) => ({ ...entryView(e), labOrders: ordersFor(e.visit_id) })),
      missed: mine
        .filter((e) => e.status === 'missed')
        .map((e) => ({ ...entryView(e), missedAt: e.missed_at, restoreMinLeft: restoreMinLeft(e.missed_at) })),
      avgServiceMin: Math.round(stats[key].avgServiceSec / 60),
      servedToday: today.find((t) => t.department === key)?.served ?? 0,
    };
  }
  return {
    departments,
    labOrders: orders.map((o) => ({ ...orderView(o), token: o.token, patientName: o.full_name, sampleCollected: o.sample_collected })),
  };
}

const entryView = (e) => ({
  entryId: e.id,
  visitId: e.visit_id,
  token: e.token,
  status: e.status,
  counter: e.counter,
  joinedAt: e.joined_at,
  calledAt: e.called_at,
  patientName: e.full_name,
  age: e.age,
  sex: e.sex,
  reason: e.reason,
  recallCount: e.recall_count,
  // An on-time booking queues by its slot time; a late one queues as a walk-in.
  booking: e.booking_code
    ? {
        code: e.booking_code,
        slotStart: e.slot_start,
        onTime: new Date(e.sort_at).getTime() === new Date(e.slot_start).getTime(),
      }
    : null,
});

const restoreMinLeft = (missedAt) =>
  Math.max(0, Math.ceil(RESTORE_WINDOW_MIN - (Date.now() - new Date(missedAt).getTime()) / 60000));

const orderView = (o) => ({ id: o.id, testName: o.test_name, notes: o.notes, status: o.status, orderedAt: o.ordered_at });

// Public board: tokens only, no patient names.
export async function displayBoard() {
  const stats = await serviceStats();
  const { rows } = await db.query(
    `SELECT e.department, e.status, e.counter, e.called_at, v.token
       FROM queue_entries e JOIN visits v ON v.id = e.visit_id
      WHERE e.status IN ('waiting', 'called')
      ORDER BY e.sort_at, e.id`,
  );
  const departments = DEPT_ORDER.map((key) => {
    const mine = rows.filter((r) => r.department === key);
    const waiting = mine.filter((r) => r.status === 'waiting');
    const serving = mine.filter((r) => r.status === 'called');
    return {
      key,
      name: DEPARTMENTS[key].name,
      serving: serving.map((r) => ({ token: r.token, counter: r.counter, calledAt: r.called_at })),
      nextUp: waiting.slice(0, 5).map((r) => r.token),
      waitingCount: waiting.length,
      estimate: estimate(waiting.length, serving.length, stats[key]),
      status: serving.length ? 'serving' : waiting.length ? 'waiting' : 'idle',
    };
  });
  return { departments, updatedAt: new Date() };
}

// ---------- patient access ----------

export async function findVisitByPin(token, pin) {
  const digits = String(token ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const normalized = `T-${digits.padStart(3, '0')}`;
  const { rows } = await db.query(
    'SELECT id, pin_hash FROM visits WHERE token = $1 ORDER BY created_at DESC LIMIT 30',
    [normalized],
  );
  const match = rows.find((v) => verifyPin(String(pin ?? ''), v.pin_hash));
  return match?.id ?? null;
}

export async function patientStatus(visitId) {
  const { rows: [visit] } = await db.query(
    `SELECT v.id, v.token, v.status, v.reason, v.created_at, v.completed_at, p.full_name
       FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = $1`,
    [visitId],
  );
  if (!visit) throw new HttpError(404, 'Visit not found.');

  const { rows: entries } = await db.query(
    'SELECT * FROM queue_entries WHERE visit_id = $1 ORDER BY joined_at, id',
    [visitId],
  );
  const { rows: orders } = await db.query(
    'SELECT * FROM lab_orders WHERE visit_id = $1 ORDER BY ordered_at',
    [visitId],
  );
  const { rows: reports } = await db.query(
    `SELECT r.id, r.lab_order_id, r.summary, r.file_name, r.file_path, r.released_at, o.test_name
       FROM reports r JOIN lab_orders o ON o.id = r.lab_order_id
      WHERE r.visit_id = $1 ORDER BY r.released_at`,
    [visitId],
  );

  const currentEntry = entries.find((e) => ['waiting', 'called', 'missed'].includes(e.status));
  const pendingOrders = orders.filter((o) => o.status === 'ordered');
  let current = null;

  if (currentEntry) {
    const dept = DEPARTMENTS[currentEntry.department];
    const stats = await serviceStats();
    // Only 'waiting' and 'called' entries count, so missed tokens (and no-show
    // bookings, which never entered the queue) are left out of people ahead and the estimate.
    const { rows: [counts] } = await db.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'waiting' AND (sort_at, id) < ($2::timestamptz, $3::int))::int AS ahead,
              COUNT(*) FILTER (WHERE status = 'called')::int AS busy
         FROM queue_entries WHERE department = $1`,
      [currentEntry.department, currentEntry.sort_at, currentEntry.id],
    );
    const isWaiting = currentEntry.status === 'waiting';
    current = {
      department: dept.key,
      departmentName: dept.name,
      state: currentEntry.status,
      counter: currentEntry.counter,
      peopleAhead: isWaiting ? counts.ahead : 0,
      estimate: isWaiting ? estimate(counts.ahead, counts.busy, stats[dept.key]) : null,
      restoreMinLeft: currentEntry.status === 'missed' ? restoreMinLeft(currentEntry.missed_at) : null,
    };
  }

  // Journey across the three connected queues.
  const lastIn = (key) => [...entries].reverse().find((e) => e.department === key);
  const journey = DEPT_ORDER
    .filter((key) => key !== 'lab' || orders.length || lastIn('lab'))
    .map((key) => {
      const e = lastIn(key);
      const state = !e ? 'upcoming' : e.status === 'done' || e.status === 'expired' ? e.status : 'current';
      return { department: key, name: DEPARTMENTS[key].name, state };
    });

  let nextDestination;
  if (visit.status === 'expired') {
    nextDestination = {
      label: 'Token expired',
      detail: `This token was missed and not restored within ${RESTORE_WINDOW_MIN} minutes. Please go to the registration desk.`,
    };
  } else if (current?.state === 'missed') {
    nextDestination = {
      label: `You missed your call — go to ${current.departmentName} now`,
      detail: `Staff can put you back near the front for ${current.restoreMinLeft} more min. After that this token expires.`,
    };
  } else if (current?.state === 'called') {
    nextDestination = {
      label: `Go to ${current.departmentName} — ${current.counter} now`,
      detail: 'Your token has been called.',
    };
  } else if (current) {
    const after = current.department === 'registration'
      ? DEPARTMENTS.doctor.name
      : current.department === 'doctor' && pendingOrders.length ? DEPARTMENTS.lab.name : null;
    nextDestination = {
      label: `Wait in the ${DEPARTMENTS[current.department].area}`,
      detail: `Watch the display for ${visit.token}.${after ? ` After this: ${after}.` : ''}`,
    };
  } else if (pendingOrders.length) {
    nextDestination = {
      label: 'Visit complete — lab report pending',
      detail: 'Your report will appear on this page as soon as the lab releases it.',
    };
  } else {
    nextDestination = { label: 'Visit complete', detail: 'Thank you. Any released reports are listed below.' };
  }

  return {
    token: visit.token,
    firstName: visit.full_name.split(/\s+/)[0],
    visitStatus: visit.status,
    reason: visit.reason,
    createdAt: visit.created_at,
    current,
    nextDestination,
    journey,
    labOrders: orders.map(orderView),
    reports: reports.map((r) => ({
      id: r.id,
      labOrderId: r.lab_order_id,
      testName: r.test_name,
      summary: r.summary,
      releasedAt: r.released_at,
      fileName: r.file_name,
      hasFile: Boolean(r.file_path),
    })),
  };
}

export async function reportFile(visitId, reportId) {
  const { rows: [r] } = await db.query(
    'SELECT file_name, file_path, file_type FROM reports WHERE id = $1 AND visit_id = $2',
    [reportId, visitId],
  );
  if (!r?.file_path) throw new HttpError(404, 'Report file not found.');
  return r;
}
