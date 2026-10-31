// Patient access: a 6-digit PIN issued at registration (stored hashed), traded
// for a short-lived signed session that unlocks queue status and reports.
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function newPin() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(pin), salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

export function issueSession(visitId) {
  const body = Buffer.from(JSON.stringify({ v: visitId, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readSession(header) {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const { v, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
  return exp > Date.now() ? v : null;
}

// Rotating 4-digit hall code shown only on the in-hospital display. Derived from
// the secret and the current 3-minute window, so nothing needs storing.
export const HALL_CODE_PERIOD_MS = 3 * 60 * 1000;
const HALL_CODE_GRACE_MS = 30 * 1000;

function hallCodeFor(window) {
  const n = crypto.createHmac('sha256', SECRET).update(`hall:${window}`).digest().readUInt32BE(0);
  return String(n % 10000).padStart(4, '0');
}

export function currentHallCode(now = Date.now()) {
  const window = Math.floor(now / HALL_CODE_PERIOD_MS);
  return { code: hallCodeFor(window), expiresAt: new Date((window + 1) * HALL_CODE_PERIOD_MS) };
}

// Accepts the current code, or the previous one for 30 s after it rotates
// (someone who read it just before the change).
export function checkHallCode(input, now = Date.now()) {
  const given = String(input ?? '').trim();
  const window = Math.floor(now / HALL_CODE_PERIOD_MS);
  if (given === hallCodeFor(window)) return true;
  return now - window * HALL_CODE_PERIOD_MS < HALL_CODE_GRACE_MS && given === hallCodeFor(window - 1);
}

// Simple in-memory brute-force guard for PIN and hall-code attempts.
const failures = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;

export function tooManyAttempts(key, max = MAX_FAILURES) {
  const rec = failures.get(key);
  if (!rec || rec.until < Date.now()) return false;
  return rec.count >= max;
}

export function recordFailure(key) {
  const rec = failures.get(key);
  if (!rec || rec.until < Date.now()) failures.set(key, { count: 1, until: Date.now() + WINDOW_MS });
  else rec.count += 1;
}

export function clearFailures(key) {
  failures.delete(key);
}
