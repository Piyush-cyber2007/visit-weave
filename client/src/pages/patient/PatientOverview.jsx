import { useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, FileText, HeartPulse, UsersRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api, patientSession, useLive } from '../../api.js';

const SAMPLE_QUEUE = { token: 'D-024', department: 'Doctor Consultation', peopleAhead: 4, minutes: 18, destination: 'Doctor Consultation Room' };
const SAMPLE_STEPS = [
  { name: 'Registration', state: 'done' },
  { name: 'Doctor', state: 'current' },
  { name: 'Lab', state: 'upcoming' },
  { name: 'Report', state: 'upcoming' },
];

export default function PatientOverview() {
  const session = patientSession.get();
  const [visit, setVisit] = useState(null);
  const [error, setError] = useState('');
  const live = useLive(() => {
    if (!session) return;
    api('/api/patient/status', { session })
      .then((result) => { setVisit(result); setError(''); })
      .catch((cause) => setError(cause.message));
  });

  const firstName = visit?.firstName || 'Rahul';
  const current = visit?.current;
  const isDemo = !session;
  const steps = visit?.journey?.map((step) => ({ name: step.name, state: step.state })) || SAMPLE_STEPS;
  const metrics = [
    { label: 'Upcoming appointments', value: isDemo ? '1' : 'View', note: isDemo ? '1 booking in the demo account' : 'Booking history is linked to your account', icon: CalendarDays },
    { label: 'Active visits', value: isDemo ? '1' : current ? '1' : '0', note: isDemo ? 'Sample visit · demo data' : current ? 'A visit is in progress' : 'No active visit', icon: HeartPulse },
    { label: 'Completed visits', value: isDemo ? '2' : visit?.visitStatus === 'complete' ? '1' : '0', note: isDemo ? 'Sample account activity' : 'For this visit', icon: UsersRound },
    { label: 'Available reports', value: isDemo ? '1' : String(visit?.reports?.length || 0), note: isDemo ? 'Sample report · not a medical record' : 'Released to your visit', icon: FileText },
  ];

  return (
    <motion.div className="patient-overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {isDemo && <div className="demo-banner"><span className="demo-banner__dot" />DEMO MODE <span>Sample patient information is fictional and not connected to a medical record.</span></div>}
      {error && <p className="error" role="alert">Could not refresh visit status: {error}</p>}
      <section className="welcome-row">
        <div><p className="eyebrow">Saturday, October 31, 2026</p><h2>Good morning, {firstName}.</h2><p className="muted">Here’s the latest on your care journey.</p></div>
        <Link className="btn btn--primary" to="/patient/book">Book an appointment <ArrowRight size={17} /></Link>
      </section>

      <section className="summary-grid" aria-label="Visit summary">
        {metrics.map(({ label, value, note, icon: Icon }, index) => (
          <article className="summary-card" key={label} style={{ '--card-index': index }}>
            <span className="summary-card__icon"><Icon size={18} /></span>
            <span className="summary-card__label">{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <section className="queue-feature">
        <header className="queue-feature__head">
          <div><p className="eyebrow">{isDemo ? 'Sample queue · demo data' : 'Live queue'}</p><h2>Your active queue</h2></div>
          <span className={live && !isDemo ? 'live-pill live-pill--on' : 'live-pill'}><i />{isDemo ? 'Sample' : live ? 'Live' : 'Connecting'}</span>
        </header>
        <div className="queue-feature__main">
          <div className="queue-token"><span>YOUR TOKEN</span><strong>{visit?.token || SAMPLE_QUEUE.token}</strong><span className="status-badge status-badge--waiting">Waiting</span></div>
          <div className="queue-facts">
            <div><span>Current stage</span><strong>{current?.departmentName || SAMPLE_QUEUE.department}</strong></div>
            <div><span>People ahead</span><strong>{current?.peopleAhead ?? SAMPLE_QUEUE.peopleAhead}</strong></div>
            <div><span>Estimated wait</span><strong>~{current?.estimate?.minutes ?? SAMPLE_QUEUE.minutes} min</strong></div>
            <div><span>Next destination</span><strong>{visit?.nextDestination?.label || SAMPLE_QUEUE.destination}</strong></div>
          </div>
        </div>
        <ol className="patient-progress" aria-label="Visit progress">
          {steps.map((step, index) => <li key={`${step.name}-${index}`} className={`patient-progress__step is-${step.state}`}><span className="patient-progress__marker">{index + 1}</span><span>{step.name}</span></li>)}
        </ol>
        <footer className="queue-feature__foot"><span><Clock3 size={15} />Approximate wait; actual times may vary.</span><Link to="/patient/queue">View live queue <ArrowRight size={16} /></Link></footer>
      </section>

      <section className="patient-shortcuts">
        <Link to="/patient/appointments"><CalendarDays size={19} /><span><strong>My appointments</strong><small>See bookings and check-in status</small></span><ArrowRight size={17} /></Link>
        <Link to="/patient/reports"><FileText size={19} /><span><strong>Medical reports</strong><small>Open reports released for your visit</small></span><ArrowRight size={17} /></Link>
      </section>
    </motion.div>
  );
}
