import { useState } from 'react';
import { FileText, FlaskConical, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, timeOf, useLive } from '../../api.js';
import ReportForm from '../../components/ReportForm.jsx';

export default function DoctorReports() {
  const [overview, setOverview] = useState(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const live = useLive(() => api('/api/staff/overview').then(setOverview).catch((cause) => setError(cause.message)));

  if (!overview) return <div className="loading-state"><span className="spinner" />{error || 'Loading lab reports…'}</div>;

  const orders = overview.labOrders.filter((order) => `${order.token} ${order.patientName} ${order.testName}`.toLowerCase().includes(query.toLowerCase()));
  const pending = orders.filter((order) => order.status === 'ordered' && order.sampleCollected);
  const released = orders.filter((order) => order.status === 'reported');

  return (
    <div className="reports-workspace">
      <div className="section-heading"><div><p className="eyebrow">Laboratory follow-up</p><h2>Reports</h2><p className="muted">Release completed fictional reports to the patient’s protected visit.</p></div><span className={live ? 'live-pill live-pill--on' : 'live-pill'}><i />{live ? 'Live' : 'Reconnecting'}</span></div>
      {error && <p className="error" role="alert">Report list refresh failed: {error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <label className="search-field reports-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search token, patient, or test" /></label>
      <div className="reports-columns">
        <section className="data-panel"><header className="data-panel__head"><div><p className="eyebrow">Sample collected</p><h3>Ready to release <span className="count-badge">{pending.length}</span></h3></div><FlaskConical size={20} /></header>
          {pending.length ? pending.map((order) => <article className="report-order" key={order.id}><div className="order__head"><strong><span className="mono">{order.token}</span> · {order.testName}</strong><span className="muted small">{order.patientName}</span></div><ReportForm order={order} onDone={setMessage} /></article>) : <div className="empty-inline">No collected samples are waiting for report release.</div>}
        </section>
        <section className="data-panel"><header className="data-panel__head"><div><p className="eyebrow">Patient access</p><h3>Released reports <span className="count-badge">{released.length}</span></h3></div><FileText size={20} /></header>
          {released.length ? <div className="released-list">{released.map((order) => <article key={order.id}><div><strong>{order.testName}</strong><span><span className="mono">{order.token}</span> · {order.patientName}</span></div><small>Ordered {timeOf(order.orderedAt)}</small></article>)}</div> : <div className="empty-inline">Released reports will appear here.</div>}
          <Link className="text-link reports-link" to="/doctor/laboratory">Open laboratory queue</Link>
        </section>
      </div>
    </div>
  );
}
