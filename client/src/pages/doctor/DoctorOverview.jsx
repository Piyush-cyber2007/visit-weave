import { useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Clock3, FlaskConical, Search, UsersRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api, minutesSince, useLive } from '../../api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

const DEPARTMENTS = ['registration', 'doctor', 'lab'];
const PAGE_SIZE = 8;

export default function DoctorOverview() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('longest');
  const [page, setPage] = useState(0);
  const { user } = useAuth();
  const live = useLive(() => api('/api/staff/overview').then((data) => { setOverview(data); setError(''); }).catch((cause) => setError(cause.message)));

  if (!overview) return <div className="loading-state"><span className="spinner" />{error || 'Loading live queue overview…'}</div>;

  const doctor = overview.departments.doctor;
  const lab = overview.departments.lab;
  const rows = DEPARTMENTS.flatMap((key) => {
    const group = overview.departments[key];
    return [
      ...group.serving.map((entry) => ({ ...entry, departmentKey: key, queueStatus: 'In progress' })),
      ...group.waiting.map((entry) => ({ ...entry, departmentKey: key, queueStatus: 'Waiting' })),
      ...group.missed.map((entry) => ({ ...entry, departmentKey: key, queueStatus: 'Missed' })),
    ];
  }).filter((entry) => department === 'all' || entry.departmentKey === department)
    .filter((entry) => status === 'all' || entry.queueStatus.toLowerCase() === status)
    .filter((entry) => `${entry.token} ${entry.patientName} ${entry.reason || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((left, right) => sort === 'longest' ? minutesSince(right.joinedAt) - minutesSince(left.joinedAt) : minutesSince(left.joinedAt) - minutesSince(right.joinedAt));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const stats = [
    { label: 'Patients today', value: doctor.servedToday + doctor.waiting.length + doctor.serving.length, note: 'Consultation queue activity', icon: UsersRound, trend: 'Current count' },
    { label: 'Waiting patients', value: doctor.waiting.length, note: 'Across active departments', icon: Clock3, trend: 'Live queue' },
    { label: 'In consultation', value: doctor.serving.length, note: 'Currently called to a room', icon: Activity, trend: live ? 'Live' : 'Polling' },
    { label: 'Pending lab tests', value: overview.labOrders.filter((order) => order.status === 'ordered').length, note: `${lab.waiting.length} waiting in laboratory`, icon: FlaskConical, trend: 'Open orders' },
  ];

  return (
    <motion.div className="doctor-dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="dashboard-welcome"><div><p className="eyebrow">Saturday, October 31, 2026 · General Medicine</p><h2>Welcome back, {user?.display_name || 'Doctor'}.</h2><p className="muted">A live view of today’s patient flow.</p></div><Link className="btn btn--primary" to="/doctor/queue/doctor">Open live queue <Activity size={17} /></Link></div>
      {error && <p className="error" role="alert">Live queue refresh failed: {error}</p>}
      <section className="summary-grid summary-grid--doctor">
        {stats.map(({ label, value, note, icon: Icon, trend }, index) => <article className="summary-card" key={label} style={{ '--card-index': index }}><span className="summary-card__icon"><Icon size={18} /></span><span className="summary-card__label">{label}</span><strong>{value}</strong><small>{note}</small><span className="summary-card__trend">{index % 2 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{trend}</span></article>)}
      </section>

      <section className="data-panel">
        <header className="data-panel__head"><div><p className="eyebrow">Operations</p><h2>Live queue overview</h2></div><span className={live ? 'live-pill live-pill--on' : 'live-pill'}><i />{live ? 'Live updates' : 'Polling'}</span></header>
        <div className="table-filters">
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search token or patient" /></label>
          <select aria-label="Filter by department" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(0); }}><option value="all">All departments</option>{DEPARTMENTS.map((key) => <option value={key} key={key}>{overview.departments[key].name}</option>)}</select>
          <select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}><option value="all">All statuses</option><option value="waiting">Waiting</option><option value="in progress">In progress</option><option value="missed">Missed</option></select>
          <select aria-label="Sort queue" value={sort} onChange={(event) => setSort(event.target.value)}><option value="longest">Longest wait</option><option value="shortest">Shortest wait</option></select>
        </div>
        <div className="table-wrap"><table className="table queue-table"><thead><tr><th>Token</th><th>Patient</th><th>Department</th><th>Appointment</th><th>Waiting</th><th>Status</th><th /></tr></thead>
          <tbody>{visibleRows.map((entry) => <tr key={entry.entryId}><td className="mono">{entry.token}</td><td><strong>{entry.patientName}</strong><small>{entry.age ? `${entry.age} years` : 'Age not provided'}</small></td><td>{overview.departments[entry.departmentKey].name}</td><td>{entry.booking ? entry.booking.onTime ? 'Booked' : 'Booked · late' : 'Walk-in'}</td><td>{minutesSince(entry.joinedAt)} min</td><td><span className={`status-badge status-badge--${entry.queueStatus === 'In progress' ? 'active' : entry.queueStatus.toLowerCase()}`}>{entry.queueStatus}</span></td><td><Link className="text-link" to={`/doctor/queue/${entry.departmentKey}`}>Open</Link></td></tr>)}</tbody>
        </table></div>
        {!visibleRows.length && <div className="empty-inline">No queue entries match these filters.</div>}
        <footer className="table-pagination"><span>{rows.length ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, rows.length)} of ${rows.length}` : '0 patients'}</span><div><button className="btn btn--ghost" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="btn btn--ghost" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div></footer>
      </section>
    </motion.div>
  );
}
