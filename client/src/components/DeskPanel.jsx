import { useState } from 'react';
import { api, minutesSince, storage, store, timeOf } from '../api.js';
import ReportForm from './ReportForm.jsx';

// One counter's view of a department queue: call next, serve, complete.
export default function DeskPanel({ dept, meta, live }) {
  const [counter, setCounter] = useState(() => storage(`counter:${dept.key}`, dept.counters[0]));
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const current = dept.serving.find((s) => s.counter === counter);
  const others = dept.serving.filter((s) => s.counter !== counter);

  async function run(fn, success) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fn();
      if (success) setMessage({ ok: true, text: success(result) });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const callNext = () =>
    run(() => api(`/api/queues/${dept.key}/call-next`, { method: 'POST', body: { counter } }), (r) => `Called ${r.token} to ${r.counter}.`);

  const complete = () =>
    run(
      () => api(`/api/entries/${current.entryId}/complete`, { method: 'POST' }),
      (r) => (r.next ? `${r.token} moved to the ${meta.departments[r.next].name} queue.` : `${r.token}: visit complete.`),
    );

  const pendingOrders = current?.labOrders.filter((o) => o.status === 'ordered') ?? [];
  const completeLabel = {
    registration: 'Complete registration → Doctor',
    doctor: pendingOrders.length ? 'Complete consultation → Lab' : 'Complete consultation (end visit)',
    lab: 'Sample collected — complete',
  }[dept.key];

  return (
    <section className="card desk">
      <header className="desk__head">
        <div>
          <h2>{dept.name}</h2>
          <p className="muted small">
            {dept.waiting.length} waiting · {dept.servedToday} served today · avg ≈ {dept.avgServiceMin} min
            <span className={live ? 'dot dot--on' : 'dot'} title={live ? 'Live' : 'Reconnecting (polling)'} />
          </p>
        </div>
        <label className="counter-pick">
          Counter
          <select
            value={counter}
            onChange={(e) => {
              setCounter(e.target.value);
              store(`counter:${dept.key}`, e.target.value);
            }}
          >
            {dept.counters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </header>

      {current ? (
        <div className="serving">
          <div className="serving__top">
            <div>
              <p className="eyebrow">Now serving at {counter}</p>
              <div className="serving__token">{current.token}</div>
            </div>
            <div className="serving__who">
              <strong>{current.patientName}</strong>
              <span className="muted">
                {[current.age && `${current.age} y`, current.sex].filter(Boolean).join(' · ')}
              </span>
              {current.reason && <span>{current.reason}</span>}
              <span className="muted small">Called {minutesSince(current.calledAt)} min ago</span>
            </div>
          </div>

          {dept.key === 'doctor' && <LabOrderForm current={current} meta={meta} run={run} busy={busy} />}

          {dept.key === 'lab' && (
            <div className="orders">
              {current.labOrders.map((o) => (
                <div key={o.id} className="order">
                  <div className="order__head">
                    <strong>{o.testName}</strong>
                    <span className={`pill pill--${o.status}`}>{o.status === 'reported' ? 'Report released' : 'Ordered'}</span>
                  </div>
                  {o.notes && <p className="muted small">Doctor's note: {o.notes}</p>}
                  {o.status === 'ordered' && <ReportForm order={o} onDone={(t) => setMessage({ ok: true, text: t })} />}
                </div>
              ))}
            </div>
          )}

          <div className="row">
            <button className="btn btn--primary" onClick={complete} disabled={busy}>
              {completeLabel}
            </button>
            <button
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => run(() => api(`/api/entries/${current.entryId}/recall`, { method: 'POST' }), (r) => `Announced ${r.token} again.`)}
            >
              Announce again
            </button>
            <button
              className="btn btn--ghost"
              disabled={busy || current.recallCount < 1}
              title={current.recallCount < 1 ? 'Announce again once before marking missed' : undefined}
              onClick={() => run(() => api(`/api/entries/${current.entryId}/missed`, { method: 'POST' }), (r) => `${r.token} marked missed.`)}
            >
              Mark missed
            </button>
          </div>
          {current.recallCount < 1 && <p className="muted small">Not here? Announce again once, then you can mark the token missed.</p>}
        </div>
      ) : (
        <div className="serving serving--empty">
          <p className="muted">{counter} is free.</p>
          <button className="btn btn--primary btn--big" onClick={callNext} disabled={busy || !dept.waiting.length}>
            {dept.waiting.length ? `Call next (${dept.waiting[0].token})` : 'Nobody waiting'}
          </button>
        </div>
      )}

      {message && <p className={message.ok ? 'success' : 'error'}>{message.text}</p>}

      {others.length > 0 && (
        <p className="muted small">
          Other counters: {others.map((o) => `${o.counter} → ${o.token}`).join(' · ')}
        </p>
      )}

      <h3>Waiting</h3>
      {dept.waiting.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Token</th>
              <th>Patient</th>
              <th>Waiting</th>
            </tr>
          </thead>
          <tbody>
            {dept.waiting.map((w, i) => (
              <tr key={w.entryId}>
                <td>{i + 1}</td>
                <td className="mono">{w.token}</td>
                <td>
                  {w.patientName}
                  {w.booking && (
                    <span className={w.booking.onTime ? 'tag tag--booked' : 'tag'}>
                      {w.booking.onTime ? `Booked ${timeOf(w.booking.slotStart)}` : 'Booked · late'}
                    </span>
                  )}
                  {w.labOrders.length > 0 && (
                    <span className="muted small"> · {w.labOrders.map((o) => o.testName).join(', ')}</span>
                  )}
                </td>
                <td>{minutesSince(w.joinedAt)} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Queue is empty.</p>
      )}

      {dept.missed.length > 0 && (
        <>
          <h3>Missed</h3>
          <p className="muted small">Not counted in waits. Restore puts the token back with 2 people ahead; it expires after 30 min.</p>
          <ul className="list">
            {dept.missed.map((m) => (
              <li key={m.entryId} className="row row--between">
                <span>
                  <span className="mono">{m.token}</span> {m.patientName}
                  <span className="muted small"> · {m.restoreMinLeft} min left</span>
                </span>
                <button
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() =>
                    run(() => api(`/api/entries/${m.entryId}/restore`, { method: 'POST' }), (r) => `${r.token} restored to position ${r.position}.`)
                  }
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function LabOrderForm({ current, meta, run, busy }) {
  const [testName, setTestName] = useState(meta.labTests[0]);
  const [notes, setNotes] = useState('');

  const order = () =>
    run(
      () => api(`/api/visits/${current.visitId}/lab-orders`, { method: 'POST', body: { testName, notes } }),
      (r) => {
        setNotes('');
        return `Ordered ${r.test_name} for ${r.token}.`;
      },
    );

  return (
    <div className="orders">
      <h4>Lab orders</h4>
      {current.labOrders.length > 0 && (
        <ul className="chips">
          {current.labOrders.map((o) => (
            <li key={o.id}>{o.testName}</li>
          ))}
        </ul>
      )}
      <div className="row">
        <select value={testName} onChange={(e) => setTestName(e.target.value)}>
          {meta.labTests.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note for lab (optional)" />
        <button className="btn" onClick={order} disabled={busy}>
          Order test
        </button>
      </div>
    </div>
  );
}
