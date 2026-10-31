import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const SCREENS = [
  { to: '/book', title: 'Online booking', text: 'Reserve a slot from a phone. The token is issued only at check-in on arrival.' },
  { to: '/patient', title: 'Patient view', text: 'Token, current stage, people ahead, approximate wait, next destination and secure reports.' },
  { to: '/registration', title: 'Registration desk', text: 'Create a visit and issue one token + PIN that follows the patient everywhere.' },
  { to: '/staff/doctor', title: 'Doctor / lab dashboard', text: 'Call next, complete a stage, order lab tests, release fictional reports.' },
  { to: '/display', title: 'Queue display', text: 'Big-screen board of called tokens and live department status.' },
];

const BOOKING_DEMO = [
  'Book (on a phone): Doctor Consultation → Today → the next free slot → fictional details. Note the booking code.',
  'Queue display: read the 4-digit hall code (it changes every 3 minutes).',
  'Check-in page: tap "I’ve arrived", enter the hall code. The token is created and the patient view opens.',
  'Doctor dashboard: the token is in the waiting list, tagged "Booked HH:MM", ordered by slot time.',
  'Registration desk: search DEMO02 or phone 9000000002 and check in without a hall code.',
];

const DEMO = [
  'Registration desk: register a fictional patient and note the token + PIN.',
  'Patient view (another tab or phone): sign in with the token + PIN.',
  'Doctor dashboard: Call next → order a lab test → Complete consultation.',
  'Watch the visit move into the lab queue automatically — no second registration.',
  'Lab dashboard: Call next → Sample collected → release the fictional report.',
  'Patient view: the report appears and can be opened securely.',
];

export default function Home() {
  const [resetMsg, setResetMsg] = useState('');

  async function reset() {
    if (!window.confirm('Delete all demo visits, queues, bookings and reports, then add fresh sample bookings?')) return;
    await api('/api/admin/reset', { method: 'POST' });
    setResetMsg('Demo data cleared.');
  }

  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">Hospital queue coordination prototype</p>
        <h1>One visit. One token. Every hospital queue connected.</h1>
        <p className="lead">
          Registration → Doctor → Lab, linked by a single token. When the doctor orders a test, the visit
          moves into the lab queue on its own, and the report is released securely to the patient.
        </p>
        <div className="flow">
          <span>Registration</span>
          <i>→</i>
          <span>Doctor</span>
          <i>→</i>
          <span>Lab</span>
          <i>→</i>
          <span>Secure report</span>
        </div>
      </section>

      <section className="grid grid--5">
        {SCREENS.map((s, i) => (
          <Link key={s.to} to={s.to} className="card card--link">
            <span className="step">{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </Link>
        ))}
      </section>

      <section className="card">
        <h2>Demo script</h2>
        <ol className="demo-steps">
          {DEMO.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ol>
        <h3>Booking &amp; check-in</h3>
        <ol className="demo-steps">
          {BOOKING_DEMO.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ol>
        <p className="muted small">
          Use fictional patients only. Wait times are approximate, estimated from people ahead and recent service times.
        </p>
        <button className="btn btn--ghost" onClick={reset}>Reset demo data (re-adds sample bookings)</button>
        {resetMsg && <span className="muted small"> {resetMsg}</span>}
      </section>
    </div>
  );
}
