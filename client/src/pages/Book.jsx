import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useLive } from '../api.js';

const EMPTY = { fullName: '', age: '', phone: '' };

export default function Book() {
  const [options, setOptions] = useState(null);
  const [department, setDepartment] = useState(null);
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [booked, setBooked] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/booking/options')
      .then((o) => {
        setOptions(o);
        if (o.departments.length === 1) setDepartment(o.departments[0].key);
        setDate(o.dates[0].date);
      })
      .catch((err) => setError(err.message));
  }, []);

  const loadSlots = useCallback(() => {
    if (!department || !date) return;
    api(`/api/booking/slots?department=${department}&date=${date}`).then(setSlots).catch(() => {});
  }, [department, date]);
  useEffect(loadSlots, [loadSlots]);
  useLive(loadSlots);   // remaining seats update as others book

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setBooked(await api('/api/booking', { method: 'POST', body: { department, slotStart: slot.start, ...form } }));
    } catch (err) {
      setError(err.message);
      loadSlots();
    } finally {
      setBusy(false);
    }
  }

  if (booked) {
    const link = `/checkin/${booked.bookingCode}`;
    return (
      <div className="narrow mobile">
        <section className="card booked">
          <p className="eyebrow">Booking confirmed</p>
          <div className="booked__code">{booked.bookingCode}</div>
          <p>
            <strong>{booked.departmentName}</strong>
            <br />
            {booked.slotLabel}
          </p>
          <p className="notice">
            This reserves your slot only. Your queue token is issued when you check in at the hospital.
          </p>
          <ol className="steps">
            <li>Arrive before your slot (check-in opens 60 min before).</li>
            <li>
              Open your check-in link and tap <strong>I've arrived</strong>.
            </li>
            <li>Enter the 4-digit hall code shown on the waiting-hall screen.</li>
          </ol>
          <Link className="btn btn--primary btn--block" to={link}>
            Open check-in page
          </Link>
          <p className="muted small">
            Save this link: <span className="mono">{window.location.origin + link}</span>
            <br />
            No smartphone at the hospital? Give your booking code or phone number at the registration desk.
            <br />
            More than {options.lateGraceMin} min late? You can still check in, but you will join as a walk-in.
          </p>
          <button className="btn btn--ghost" onClick={() => { setBooked(null); setSlot(null); setForm(EMPTY); loadSlots(); }}>
            Make another booking
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="narrow mobile">
      <h1>Book a visit</h1>
      <p className="muted">Pick a slot online, then check in on arrival. Fictional data only.</p>
      {!options && <p className="muted">{error || 'Loading…'}</p>}

      {options && (
        <>
          <section className="card">
            <h3 className="step-title"><span className="step">1</span> Department</h3>
            <div className="choice-grid">
              {options.departments.map((d) => (
                <button
                  key={d.key}
                  className={department === d.key ? 'choice choice--on' : 'choice'}
                  onClick={() => { setDepartment(d.key); setSlot(null); }}
                >
                  <strong>{d.name}</strong>
                  <small>{d.hours} · {d.slotMinutes}-min slots</small>
                </button>
              ))}
            </div>
          </section>

          {department && (
            <section className="card">
              <h3 className="step-title"><span className="step">2</span> Date</h3>
              <div className="date-row">
                {options.dates.map((d) => (
                  <button
                    key={d.date}
                    className={date === d.date ? 'choice choice--on' : 'choice'}
                    onClick={() => { setDate(d.date); setSlot(null); }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {department && date && (
            <section className="card">
              <h3 className="step-title"><span className="step">3</span> Time</h3>
              {!slots ? (
                <p className="muted">Loading slots…</p>
              ) : slots.some((s) => s.available) ? (
                <div className="slot-grid">
                  {slots
                    .filter((s) => new Date(s.start).getTime() > Date.now())
                    .map((s) => (
                      <button
                        key={s.start}
                        disabled={!s.available}
                        className={slot?.start === s.start ? 'choice choice--on' : 'choice'}
                        onClick={() => setSlot(s)}
                      >
                        <strong>{s.label}</strong>
                        <small>{s.available ? `${s.remaining} left` : 'Full'}</small>
                      </button>
                    ))}
                </div>
              ) : (
                <p className="muted">No free slots on this day. Try another date.</p>
              )}
              <p className="muted small">Some places in every slot are kept for walk-in patients.</p>
            </section>
          )}

          {slot && (
            <form className="card form" onSubmit={submit}>
              <h3 className="step-title"><span className="step">4</span> Your details</h3>
              <label>
                Full name
                <input value={form.fullName} onChange={set('fullName')} placeholder="Fictional name" required autoComplete="off" />
              </label>
              <div className="row">
                <label>
                  Age
                  <input type="number" min="0" max="120" value={form.age} onChange={set('age')} inputMode="numeric" />
                </label>
                <label>
                  Phone
                  <input value={form.phone} onChange={set('phone')} placeholder="10-digit number" inputMode="tel" required autoComplete="off" />
                </label>
              </div>
              {error && <p className="error">{error}</p>}
              <button className="btn btn--primary btn--block" disabled={busy}>
                {busy ? 'Booking…' : `Book ${slot.label}`}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
