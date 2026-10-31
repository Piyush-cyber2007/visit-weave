import { useState } from 'react';
import { Activity, FlaskConical, Stethoscope, UserRound } from 'lucide-react';
import { NavLink, useParams } from 'react-router-dom';
import { api, useLive, useMeta } from '../../api.js';
import DeskPanel from '../../components/DeskPanel.jsx';

const DEPARTMENT_TABS = [
  { key: 'registration', label: 'Registration', icon: UserRound },
  { key: 'doctor', label: 'Consultation', icon: Stethoscope },
  { key: 'lab', label: 'Laboratory', icon: FlaskConical },
];

export default function DoctorQueue() {
  const { dept = 'doctor' } = useParams();
  const department = DEPARTMENT_TABS.some((tab) => tab.key === dept) ? dept : 'doctor';
  const meta = useMeta();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const live = useLive(() => api('/api/staff/overview').then(setOverview).catch((cause) => setError(cause.message)));

  if (!overview || !meta) return <div className="loading-state"><span className="spinner" />{error || 'Loading queue operations…'}</div>;

  const queue = overview.departments[department];
  return (
    <div className="queue-workspace">
      <div className="section-heading"><div><p className="eyebrow">Live operations <span className="live-dot"><i />{live ? 'Connected' : 'Reconnecting'}</span></p><h2>Connected queues</h2><p className="muted">Call, recall, complete, or restore patients using the active queue.</p></div><div className="queue-workspace__stats"><strong>{queue.waiting.length}</strong><span>waiting here</span></div></div>
      <nav className="queue-tabs" aria-label="Queue departments">
        {DEPARTMENT_TABS.map(({ key, label, icon: Icon }) => <NavLink key={key} to={`/doctor/queue/${key}`} className={department === key ? 'queue-tab is-active' : 'queue-tab'}><Icon size={17} /><span>{label}</span><b>{overview.departments[key].waiting.length}</b></NavLink>)}
      </nav>
      {error && <p className="error" role="alert">Queue refresh failed: {error}</p>}
      <div className="queue-workspace__panel"><DeskPanel key={department} dept={queue} meta={meta} live={live} /></div>
      {department === 'doctor' && <section className="queue-next-lab"><div><p className="eyebrow">Downstream</p><h3>Next in laboratory</h3></div>{overview.departments.lab.waiting.length ? <ul>{overview.departments.lab.waiting.slice(0, 4).map((patient) => <li key={patient.entryId}><span className="mono">{patient.token}</span> {patient.patientName}<small>{patient.labOrders.map((order) => order.testName).join(', ')}</small></li>)}</ul> : <p className="muted">No patients currently waiting for laboratory.</p>}</section>}
      <p className="demo-footnote"><Activity size={14} /> Queue state and actions are served by the existing hospital API.</p>
    </div>
  );
}
