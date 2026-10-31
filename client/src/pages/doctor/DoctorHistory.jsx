import { useState } from 'react';
import { History, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, minutesSince, useLive } from '../../api.js';

const DEPARTMENTS = ['registration', 'doctor', 'lab'];

export default function DoctorHistory() {
  const [overview, setOverview] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const live = useLive(() => api('/api/staff/overview').then(setOverview).catch((cause) => setError(cause.message)));

  if (!overview) return <div className="loading-state"><span className="spinner" />{error || 'Loading queue records…'}</div>;

  const entries = DEPARTMENTS.flatMap((department) => {
    const group = overview.departments[department];
    return [...group.waiting, ...group.serving, ...group.missed].map((entry) => ({ ...entry, department }));
  }).filter((entry) => `${entry.patientName} ${entry.token} ${entry.reason || ''}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="portal-section">
      <div className="section-heading"><div><p className="eyebrow">Queue records</p><h2>Patient history</h2><p className="muted">The API exposes active queue records only; clinical history is not available in this prototype.</p></div><span className={live ? 'live-pill live-pill--on' : 'live-pill'}><i />{live ? 'Live snapshot' : 'Reconnecting'}</span></div>
      {error && <p className="error" role="alert">Queue records could not be refreshed: {error}</p>}
      <div className="demo-banner"><span className="demo-banner__dot" />LIMITED RECORDS <span>This view contains active queue context, not diagnoses, prescriptions, or historical medical records.</span></div>
      <label className="search-field reports-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search active token or patient" /></label>
      {entries.length ? <div className="table-wrap"><table className="table queue-table"><thead><tr><th>Token</th><th>Patient</th><th>Department</th><th>Reason</th><th>Queue time</th><th>Status</th></tr></thead><tbody>{entries.map((entry) => <tr key={`${entry.department}-${entry.entryId}`}><td className="mono">{entry.token}</td><td>{entry.patientName}<small>{entry.age ? `${entry.age} years` : 'Age not provided'}</small></td><td>{overview.departments[entry.department].name}</td><td>{entry.reason || '—'}</td><td>{minutesSince(entry.joinedAt)} min</td><td><span className={`status-badge status-badge--${entry.status}`}>{entry.status}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><History size={27} /><h3>No matching active queue records</h3><p>Completed visit history requires a backend endpoint and is not simulated here.</p><Link className="btn btn--ghost" to="/doctor/queue/doctor">Return to live queue</Link></div>}
    </section>
  );
}
