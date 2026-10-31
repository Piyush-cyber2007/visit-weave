// Database access. Uses a real PostgreSQL server when DATABASE_URL is set,
// otherwise an embedded PostgreSQL (PGlite) stored in server/data/pgdata so
// the prototype runs with zero setup. Both speak the same SQL.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.resolve(here, '../data');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS patients (
  id         SERIAL PRIMARY KEY,
  full_name  TEXT NOT NULL,
  age        INT,
  sex        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visits (
  id           SERIAL PRIMARY KEY,
  patient_id   INT NOT NULL REFERENCES patients(id),
  token        TEXT NOT NULL,
  visit_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  seq          INT NOT NULL,
  reason       TEXT,
  pin_hash     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',      -- active | completed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (visit_date, seq)
);
CREATE INDEX IF NOT EXISTS visits_token_idx ON visits (token);

-- One row per time a visit waits in a department queue.
CREATE TABLE IF NOT EXISTS queue_entries (
  id           SERIAL PRIMARY KEY,
  visit_id     INT NOT NULL REFERENCES visits(id),
  department   TEXT NOT NULL,                       -- registration | doctor | lab
  status       TEXT NOT NULL DEFAULT 'waiting',     -- waiting | called | done
  counter      TEXT,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at    TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS queue_entries_dept_idx ON queue_entries (department, status);

CREATE TABLE IF NOT EXISTS lab_orders (
  id         SERIAL PRIMARY KEY,
  visit_id   INT NOT NULL REFERENCES visits(id),
  test_name  TEXT NOT NULL,
  notes      TEXT,
  status     TEXT NOT NULL DEFAULT 'ordered',       -- ordered | reported
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id           SERIAL PRIMARY KEY,
  lab_order_id INT NOT NULL REFERENCES lab_orders(id),
  visit_id     INT NOT NULL REFERENCES visits(id),
  summary      TEXT NOT NULL,
  file_name    TEXT,
  file_path    TEXT,
  file_type    TEXT,
  released_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue order key: joined_at for walk-ins, slot time for on-time bookings,
-- or a spot near the front for a restored missed token.
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS sort_at TIMESTAMPTZ;
UPDATE queue_entries SET sort_at = joined_at WHERE sort_at IS NULL;
ALTER TABLE queue_entries ALTER COLUMN sort_at SET DEFAULT now();
ALTER TABLE queue_entries ALTER COLUMN sort_at SET NOT NULL;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS recall_count INT NOT NULL DEFAULT 0;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS missed_at TIMESTAMPTZ;   -- status missed | expired
CREATE INDEX IF NOT EXISTS queue_entries_order_idx ON queue_entries (department, status, sort_at, id);

-- A booking reserves a slot only; the visit and token are created at check-in.
CREATE TABLE IF NOT EXISTS appointments (
  id            SERIAL PRIMARY KEY,
  full_name     TEXT NOT NULL,
  age           INT,
  phone         TEXT NOT NULL,
  department    TEXT NOT NULL,
  slot_start    TIMESTAMPTZ NOT NULL,
  booking_code  TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'booked',   -- booked | checked_in | no_show | cancelled
  visit_id      INT REFERENCES visits(id),
  checked_in_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_slot_idx ON appointments (department, slot_start);
CREATE INDEX IF NOT EXISTS appointments_phone_idx ON appointments (phone);
`;

let impl;

export async function initDb() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    impl = {
      kind: 'postgres',
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn({ query: (s, p) => client.query(s, p) });
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    mkdirSync(DATA_DIR, { recursive: true });
    const db = new PGlite(path.join(DATA_DIR, 'pgdata'));
    await db.waitReady;
    impl = {
      kind: 'pglite (embedded PostgreSQL)',
      query: (sql, params) => db.query(sql, params),
      exec: (sql) => db.exec(sql),
      tx: (fn) => db.transaction((tx) => fn({ query: (s, p) => tx.query(s, p) })),
    };
  }
  await impl.exec(SCHEMA);
  return impl.kind;
}

export const db = {
  query: (sql, params) => impl.query(sql, params),
  tx: (fn) => impl.tx(fn),
  async reset() {
    await impl.exec('DROP TABLE IF EXISTS appointments, reports, lab_orders, queue_entries, visits, patients CASCADE;');
    await impl.exec(SCHEMA);
  },
};
