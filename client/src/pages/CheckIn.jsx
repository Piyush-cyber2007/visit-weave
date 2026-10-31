import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, patientSession, timeOf } from '../api.js';

export default function CheckIn() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [arrived, setArrived] = useState(false);
  const [hallCode, setHallCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api(`/api/booking/${encodeURIComponent(code)}`)
      .then(setBooking)
      .catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, [code]);

  async function checkIn(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api(`/api/booking/${encodeURIComponent(code)}/checkin`, { method: 'POST', body: { hallCode } });
      patientSession.set(r.session);
      navigate('/patient', { state: { checkedIn: { token: r.token, pin: r.pin, onTime: r.onTime } } });
    } catch (err) {
      setError(err.message);
      setHallCode('');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Cancel this booking and free the slot?')) return;
    try {
      setBooking(await api(`/api/booking/${encodeURIComponent(code)}/cancel`, { method: 'POST' }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!booking) return <div className="narrow mobile"><p className={error ? 'error' : 'muted'}>{error || 'Loading booking…'}</p></div>;

  const now = Date.now();
  const opensAt = new Date(booking.checkInOpensAt).getTime();
  const late = now > new Date(booking.lateAfter).getTime();
  const sameDay = new Date(booking.slotStart).toDateString() === new Date().toDateString();
  const canCheckIn = ['booked', 'no_show'].includes(booking.status) && sameDay && now >= opensAt;

  return (
    <div className="narrow mobile">
      <h1>Check in</h1>
      <section className="card">
        <p className="eyebrow">Booking {booking.bookingCode}</p>
        <h2>{booking.firstName}</h2>
        <p>
          {booking.departmentName}
          <br />
          <strong>{booking.slotLabel}</strong>
        </p>

        {booking.status === 'checked_in' && (
          <>
            <p className="success">Checked in. Your token is {booking.token}.</p>
            <Link className="btn btn--primary btn--block" to="/patient">Open patient view</Link>
          </>
        )}
        {booking.status === 'cancelled' && <p className="muted">This booking was cancelled.</p>}

        {['booked', 'no_show'].includes(booking.status) && !canCheckIn && (
          <p className="notice">
            {sameDay
              ? `Check-in opens at ${timeOf(booking.checkInOpensAt)}, 60 minutes before your slot.`
              : 'Come back to this page on the day of your visit.'}
          </p>
        )}

        {canCheckIn && (
          <>
            {late && (
              <p className="notice">
                You are more than 15 minutes past your slot, so you will join the queue as a walk-in.
              </p>
            )}
            {!arrived ? (
              <button className="btn btn--primary btn--big btn--block" onClick={() => setArrived(true)}>
                I've arrived
              </button>
            ) : (
              <form className="form" onSubmit={checkIn}>
                <label>
                  Hall code
                  <input
                    className="hall-input"
                    value={hallCode}
                    onChange={(e) => setHallCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="0000"
                    autoFocus
                    required
                  />
                </label>
                <p className="muted small">The 4-digit code is on the queue screen in the waiting hall. It changes every 3 minutes.</p>
                {error && <p className="error">{error}</p>}
                <button className="btn btn--primary btn--block" disabled={busy || hallCode.length !== 4}>
                  {busy ? 'Checking in…' : 'Check in & get my token'}
                </button>
              </form>
            )}
          </>
        )}
        {!arrived && error && <p className="error">{error}</p>}
      </section>

      {booking.status === 'booked' && (
        <button className="btn btn--ghost" onClick={cancel}>Cancel booking</button>
      )}
      <p className="muted small">No smartphone? Give your booking code or phone number at the registration desk.</p>
    </div>
  );
}
