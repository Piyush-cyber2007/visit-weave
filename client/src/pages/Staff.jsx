import { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { api, timeOf, useLive, useMeta } from '../api.js';
import DeskPanel from '../components/DeskPanel.jsx';
import ReportForm from '../components/ReportForm.jsx';

export default function Staff({ departmentOverride }) {
  const { dept: routeDepartment } = useParams();
  const dept = departmentOverride || routeDepartment;
  const meta = useMeta();
  const [overview, setOverview] = useState(null);
  const [message, setMessage] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const live = useLive(() => api('/api/staff/overview').then(setOverview).catch(() => {}));

  if (!['doctor', 'lab'].includes(dept)) return <p>Unknown dashboard.</p>;
  if (!overview || !meta) return <p className="muted">Loading…</p>;

  // Reports still to release once the patient has left the lab counter.
  const awaiting = overview.labOrders.filter((o) => o.status === 'ordered' && o.sampleCollected);
  const released = overview.labOrders.filter((o) => o.status === 'reported');

  async function resetDemo() {
    if (!window.confirm('Delete all demo visits, queues, bookings and reports, then add fresh sample bookings?')) return;
    try {
      await api('/api/admin/reset', { method: 'POST' });
      setResetMessage('Demo data reset.');
    } catch (error) {
      setResetMessage(error.message);
    }
  }

  return (
    <div>
      <div className="tabs">
        <NavLink to={departmentOverride ? '/doctor/queue/doctor' : '/staff/doctor'}>Doctor dashboard</NavLink>
        <NavLink to={departmentOverride ? '/doctor/laboratory' : '/staff/lab'}>Lab dashboard</NavLink>
      </div>
      <div className="grid grid--2">
        <DeskPanel key={dept} dept={overview.departments[dept]} meta={meta} live={live} />

        {dept === 'doctor' ? (
          <section className="card">
            <h2>Next in the lab</h2>
            <p className="muted small">Patients you sent on keep the same token — no new registration.</p>
            {overview.departments.lab.waiting.length ? (
              <ul className="list">
                {overview.departments.lab.waiting.map((w) => (
                  <li key={w.entryId}>
                    <span className="mono">{w.token}</span> {w.patientName}
                    <span className="muted small"> · {w.labOrders.map((o) => o.testName).join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No one waiting for the lab.</p>
            )}
          </section>
        ) : (
          <section className="card">
            <h2>Reports to release</h2>
            <p className="muted small">Samples collected; release the (fictional) report when it is ready.</p>
            {message && <p className="success">{message}</p>}
            {awaiting.length ? (
              awaiting.map((o) => (
                <div key={o.id} className="order">
                  <div className="order__head">
                    <strong>
                      <span className="mono">{o.token}</span> · {o.testName}
                    </strong>
                    <span className="muted small">{o.patientName}</span>
                  </div>
                  <ReportForm order={o} onDone={setMessage} />
                </div>
              ))
            ) : (
              <p className="muted">Nothing pending.</p>
            )}
            <h3>Released today</h3>
            {released.length ? (
              <ul className="list">
                {released.map((o) => (
                  <li key={o.id}>
                    <span className="mono">{o.token}</span> {o.testName}
                    <span className="muted small"> · ordered {timeOf(o.orderedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">None yet.</p>
            )}
          </section>
        )}
      </div>
      {dept === 'doctor' && (
        <section className="staff-tools">
          <div>
            <h2>Demo data</h2>
            <p className="muted small">Reset queue activity and restore the sample bookings.</p>
          </div>
          <div className="row">
            {resetMessage && <span className="muted small" role="status">{resetMessage}</span>}
            <button className="btn btn--ghost" onClick={resetDemo}>Reset demo data</button>
          </div>
        </section>
      )}
    </div>
  );
}
