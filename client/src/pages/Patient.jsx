import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, patientSession, timeOf, useLive } from '../api.js';
import { createReportPdf } from '../reportPdf.js';

export default function Patient() {
  const { state } = useLocation();
  const [session, setSession] = useState(patientSession.get);

  const signOut = useCallback(() => {
    patientSession.set(null);
    setSession(null);
  }, []);

  if (!session) {
    return (
      <SignIn
        onSession={(s) => {
          patientSession.set(s);
          setSession(s);
        }}
      />
    );
  }
  return <Status session={session} onSignOut={signOut} checkedIn={state?.checkedIn} />;
}

function SignIn({ onSession }) {
  const [token, setToken] = useState('');
  const [pin, setPin] = useState('');
  const [demoReport, setDemoReport] = useState(null);
  const [demoError, setDemoError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api('/api/demo/report-access')
      .then((demo) => { if (active && demo.enabled) setDemoReport(demo); })
      .catch((err) => { if (active) setDemoError(err.message); });
    return () => { active = false; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { session } = await api('/api/patient/login', { method: 'POST', body: { token, pin } });
      onSession(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Your visit</h1>
      {demoReport && (
        <section className="card demo-hint" aria-label="Fictional report demo credentials">
          <strong>Fictional report demo</strong>
          <p>Token <code>{demoReport.token}</code> · PIN <code>{demoReport.pin}</code></p>
          <p>Demo data only. Enter both credentials below; report access remains protected.</p>
          <button
            type="button"
            className="text-button"
            onClick={() => { setToken(demoReport.token); setPin(demoReport.pin); }}
          >
            Use demo credentials
          </button>
        </section>
      )}
      {demoError && <p className="error" role="status">Demo credentials are unavailable: {demoError}</p>}
      <form className="card form" onSubmit={submit}>
        <p>Enter the token and 6-digit PIN printed on your visit slip.</p>
        <label>
          Visit token
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="T-001" autoComplete="off" required />
        </label>
        <label>
          PIN
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            placeholder="••••••"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Checking…' : 'View my visit'}</button>
        <p className="muted small">Your PIN protects your lab reports. Staff will never ask you to share it.</p>
      </form>
    </div>
  );
}

function Status({ session, onSignOut, checkedIn }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [printingReportId, setPrintingReportId] = useState(null);
  const lastState = useRef(null);

  const live = useLive(() =>
    api('/api/patient/status', { session })
      .then((s) => {
        setStatus(s);
        setError('');
      })
      .catch((err) => (err.status === 401 ? onSignOut() : setError(err.message))),
  );

  useEffect(() => {
    if (printingReportId === null) return undefined;
    document.body.classList.add('printing-medical-report');
    const afterPrint = () => setPrintingReportId(null);
    window.addEventListener('afterprint', afterPrint);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', afterPrint);
      document.body.classList.remove('printing-medical-report');
    };
  }, [printingReportId]);

  // Buzz and notify when the patient's token gets called.
  useEffect(() => {
    const key = status?.current?.state === 'called' ? `${status.current.department}:called` : null;
    if (key && lastState.current !== key) navigator.vibrate?.([300, 150, 300]);
    lastState.current = key;
  }, [status]);

  async function openReport(r) {
    try {
      const blob = await api(`/api/patient/reports/${r.id}/file`, { session });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.fileName || 'report';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(err.message);
    }
  }

  function downloadReportPdf(report) {
    setError('');
    try {
      createReportPdf(report, { token: status.token, patientName: status.firstName }).save();
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : 'Could not create the report PDF.');
    }
  }

  if (!status) return <p className="muted">{error || 'Loading your visit…'}</p>;
  const { current } = status;
  const called = current?.state === 'called';

  return (
    <div className="narrow">
      <div className="row row--between">
        <h1>Hello, {status.firstName}</h1>
        <button className="btn btn--ghost" onClick={onSignOut}>Sign out</button>
      </div>

      {checkedIn && (
        <section className="card checked-in">
          <strong>You're checked in — token {checkedIn.token}.</strong>
          <p>
            {checkedIn.onTime
              ? 'You keep your booked slot time in the doctor queue.'
              : 'You arrived more than 15 min after your slot, so you joined as a walk-in.'}
          </p>
          <p>
            Report PIN: <span className="mono pin">{checkedIn.pin}</span> — save it. You need it with your token to
            see reports on another device. It is shown only once.
          </p>
        </section>
      )}

      <section className={called ? 'card patient-hero patient-hero--called' : 'card patient-hero'}>
        <div>
          <p className="eyebrow">Your visit token</p>
          <div className="patient-hero__token">{status.token}</div>
        </div>
        <div className="patient-hero__stage">
          <p className="eyebrow">Current stage</p>
          <strong>{current ? current.departmentName : status.visitStatus === 'expired' ? 'Expired' : 'Visit complete'}</strong>
          <span className="muted small">
            {{ called: 'Called — please go now', waiting: 'Waiting', missed: 'Missed — go to the desk' }[current?.state] ??
              (status.visitStatus === 'expired' ? 'Token expired' : 'Completed')}
            <span className={live ? 'dot dot--on' : 'dot'} title={live ? 'Live updates' : 'Reconnecting'} />
          </span>
        </div>
      </section>

      {current?.state === 'waiting' && (
        <section className="grid grid--2 stats">
          <div className="card stat">
            <span className="stat__value">{current.peopleAhead}</span>
            <span className="stat__label">people ahead of you</span>
          </div>
          <div className="card stat">
            {current.estimate.high < 1 ? (
              <>
                <span className="stat__value">Next</span>
                <span className="stat__label">you should be called shortly (approx.)</span>
              </>
            ) : (
              <>
                <span className="stat__value">
                  ~{current.estimate.minutes}
                  <small> min</small>
                </span>
                <span className="stat__label">
                  estimated wait · approx. {current.estimate.low}–{current.estimate.high} min
                </span>
              </>
            )}
          </div>
          <p className="muted small span-2">{current.estimate.basis} Actual times may vary.</p>
        </section>
      )}

      <section className={called || current?.state === 'missed' ? 'card next next--called' : 'card next'}>
        <p className="eyebrow">Next destination</p>
        <h2>{status.nextDestination.label}</h2>
        <p>{status.nextDestination.detail}</p>
      </section>

      <section className="card">
        <h3>Your journey</h3>
        <ol className="journey">
          {status.journey.map((j) => (
            <li key={j.department} className={`journey__step journey__step--${j.state}`}>
              <span className="journey__dot" />
              <span>{j.name}</span>
              <small>{{ done: 'Done', current: 'Now', upcoming: 'Next', expired: 'Expired' }[j.state]}</small>
            </li>
          ))}
        </ol>
      </section>

      {(status.labOrders.length > 0 || status.reports.length > 0) && (
        <section className="card">
          <h3>Lab tests & reports</h3>
          <ul className="list">
            {status.labOrders.map((o) => {
              const report = status.reports.find((r) => r.labOrderId === o.id);
              return (
                <li
                  key={o.id}
                  className={printingReportId === report?.id
                    ? 'report report-print-target'
                    : 'report'}
                >
                  <div className="order__head">
                    <strong>{o.testName}</strong>
                    <span className={`pill pill--${o.status}`}>{o.status === 'reported' ? 'Report ready' : 'In progress'}</span>
                  </div>
                  {report && (
                    <>
                      <p>{report.summary}</p>
                      <p className="muted small">Released {timeOf(report.releasedAt)}</p>
                      <div className="report-actions no-print">
                        <button className="btn" onClick={() => downloadReportPdf(report)}>Download PDF</button>
                        <button className="btn btn--ghost" onClick={() => setPrintingReportId(report.id)}>Print report</button>
                      </div>
                      {report.hasFile && (
                        <button className="btn no-print" onClick={() => openReport(report)}>
                          Download {report.fileName}
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
