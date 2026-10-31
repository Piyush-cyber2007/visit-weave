import { useState } from 'react';
import { api, timeOf, useLive, useMeta } from '../api.js';
import DeskPanel from '../components/DeskPanel.jsx';

const EMPTY = { fullName: '', age: '', sex: '', reason: '', completeRegistration: true };

export default function Registration() {
  const meta = useMeta();
  const [overview, setOverview] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [bookings, setBookings] = useState([]);
  const [bookingError, setBookingError] = useState('');
  const live = useLive(() => {
    api('/api/staff/overview').then(setOverview).catch(() => {});
    api(`/api/staff/appointments?q=${encodeURIComponent(search)}`).then(setBookings).catch(() => {});
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setSlip(await api('/api/visits', { method: 'POST', body: form }));
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function findBookings(e) {
    e?.preventDefault();
    setBookings(await api(`/api/staff/appointments?q=${encodeURIComponent(search)}`).catch(() => []));
  }

  async function deskCheckIn(appt) {
    setBookingError('');
    try {
      setSlip(await api(`/api/staff/appointments/${appt.id}/checkin`, { method: 'POST' }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setBookingError(err.message);
    }
  }

  return (
    <div className="grid grid--2">
      <div>
        <h1>Registration desk</h1>
        {slip ? (
          <div className="card slip" id="token-slip">
            <p className="eyebrow">Visit token</p>
            <div className="slip__token">{slip.token}</div>
            <p className="slip__name">{slip.patientName}</p>
            <div className="slip__pin">
              <span>Report PIN</span>
              <strong>{slip.pin}</strong>
            </div>
            <p>
              First stop: <strong>{slip.firstStop}</strong>
            </p>
            {slip.bookingCode && (
              <p className={slip.onTime ? 'success' : 'notice'}>
                Booking {slip.bookingCode} ({slip.slotLabel}):{' '}
                {slip.onTime ? 'on time — queued by slot time.' : 'more than 15 min late — queued as a walk-in.'}
              </p>
            )}
            <p className="muted small">
              Keep this slip. Use the same token at every department. Check your place and reports in the Patient
              view with your token and PIN. The PIN is shown only once.
            </p>
            <div className="row no-print">
              <button className="btn" onClick={() => window.print()}>Print slip</button>
              <button className="btn btn--ghost" onClick={() => setSlip(null)}>Register next patient</button>
            </div>
          </div>
        ) : (
          <form className="card form" onSubmit={submit}>
            <h2>New visit</h2>
            <p className="notice">Prototype: enter fictional patient details only.</p>
            <label>
              Full name
              <input value={form.fullName} onChange={set('fullName')} placeholder="e.g. Asha Verma (fictional)" required />
            </label>
            <div className="row">
              <label>
                Age
                <input type="number" min="0" max="120" value={form.age} onChange={set('age')} />
              </label>
              <label>
                Sex
                <select value={form.sex} onChange={set('sex')}>
                  <option value="">—</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
              </label>
            </div>
            <label>
              Reason for visit
              <input value={form.reason} onChange={set('reason')} placeholder="e.g. Fever for 3 days" />
            </label>
            <label className="check">
              <input type="checkbox" checked={form.completeRegistration} onChange={set('completeRegistration')} />
              Registration complete now — send straight to the doctor queue
            </label>
            <p className="muted small">
              Untick to issue a quick token first; the patient then waits in the registration queue below.
            </p>
            {error && <p className="error">{error}</p>}
            <button className="btn btn--primary" disabled={busy}>
              {busy ? 'Issuing…' : 'Create visit & issue token'}
            </button>
          </form>
        )}

        <section className="card no-print">
          <h2>Booked patient check-in</h2>
          <p className="muted small">
            For patients without a smartphone. Search by booking code or phone number; no hall code needed.
            Leave blank to see today's bookings.
          </p>
          <form className="row" onSubmit={findBookings}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Booking code or phone" />
            <button className="btn">Search</button>
          </form>
          {bookingError && <p className="error">{bookingError}</p>}
          {bookings.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Code</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{search ? b.slotLabel : timeOf(b.slotStart)}</td>
                    <td className="mono">{b.bookingCode}</td>
                    <td>
                      {b.fullName}
                      <span className="muted small"> · …{b.phone.slice(-4)}</span>
                    </td>
                    <td>
                      <span className={`pill pill--${b.status}`}>{b.status.replace('_', ' ')}</span>
                      {b.token && <span className="mono"> {b.token}</span>}
                    </td>
                    <td>
                      {b.canCheckIn && (
                        <button className="btn" onClick={() => deskCheckIn(b)}>Check in</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No bookings found.</p>
          )}
        </section>
      </div>
      <div className="no-print">
        {overview && meta && <DeskPanel dept={overview.departments.registration} meta={meta} live={live} />}
      </div>
    </div>
  );
}
