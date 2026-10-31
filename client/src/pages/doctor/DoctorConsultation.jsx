import { useEffect, useState } from 'react';
import { Activity, ClipboardPlus, FileText, FlaskConical, Save, Stethoscope, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, storage, store, useLive, useMeta } from '../../api.js';

export default function DoctorConsultation() {
  const meta = useMeta();
  const [overview, setOverview] = useState(null);
  const [selected, setSelected] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [prescription, setPrescription] = useState('');
  const [testName, setTestName] = useState('');
  const [labNotes, setLabNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const live = useLive(() => api('/api/staff/overview').then(setOverview).catch((cause) => setError(cause.message)));
  const serving = overview?.departments.doctor.serving || [];
  const patient = serving.find((entry) => String(entry.entryId) === selected) || serving[0];

  useEffect(() => {
    if (!patient) return;
    setSelected(String(patient.entryId));
    const saved = storage(`consult-note:${patient.visitId}`, '');
    try {
      const note = JSON.parse(saved);
      setDiagnosis(note?.diagnosis || '');
      setPrescription(note?.prescription || '');
    } catch {
      setDiagnosis('');
      setPrescription('');
    }
  }, [patient?.entryId]);

  useEffect(() => {
    if (meta?.labTests?.length) setTestName(meta.labTests[0]);
  }, [meta]);

  function saveNotes(event) {
    event.preventDefault();
    if (!patient) return;
    store(`consult-note:${patient.visitId}`, JSON.stringify({ diagnosis, prescription }));
    toast.success('Draft saved on this device.');
  }

  async function createLabOrder(event) {
    event.preventDefault();
    if (!patient) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/visits/${patient.visitId}/lab-orders`, { method: 'POST', body: { testName, notes: labNotes } });
      setLabNotes('');
      toast.success(`${testName} added to the laboratory queue.`);
    } catch (cause) {
      setError(cause.message);
      toast.error(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (!overview || !meta) return <div className="loading-state"><span className="spinner" />{error || 'Loading consultation room…'}</div>;

  return (
    <div className="consultation-workspace">
      <div className="section-heading"><div><p className="eyebrow">Doctor consultation</p><h2>Consultation room</h2></div><span className={live ? 'live-pill live-pill--on' : 'live-pill'}><i />{live ? 'Queue live' : 'Reconnecting'}</span></div>
      {error && <p className="error" role="alert">{error}</p>}
      {!patient ? (
        <div className="empty-state"><Stethoscope size={28} /><h3>No patient in consultation</h3><p>Call the next patient from the doctor queue to open their consultation workspace.</p><Link className="btn btn--primary" to="/doctor/queue/doctor">Open doctor queue <Activity size={17} /></Link></div>
      ) : (
        <>
          {serving.length > 1 && <label className="consultation-patient-select">Currently serving<select value={patient.entryId} onChange={(event) => setSelected(event.target.value)}>{serving.map((entry) => <option key={entry.entryId} value={entry.entryId}>{entry.token} · {entry.patientName} · {entry.counter}</option>)}</select></label>}
          <section className="consultation-patient-card">
            <span className="consultation-avatar"><UserRound size={23} /></span>
            <div><p className="eyebrow">Now called · {patient.counter}</p><h3>{patient.patientName}</h3><p>{patient.age ? `${patient.age} years` : 'Age not provided'}{patient.sex ? ` · ${patient.sex}` : ''}{patient.reason ? ` · ${patient.reason}` : ''}</p></div>
            <strong className="mono consultation-token">{patient.token}</strong>
          </section>
          <div className="consultation-grid">
            <form className="card form consultation-form" onSubmit={saveNotes}>
              <div><p className="eyebrow">Clinical draft</p><h3><FileText size={17} /> Notes & diagnosis</h3></div>
              <p className="notice">Demo-only note: saved in this browser, not sent to a medical record.</p>
              <label>Diagnosis<textarea rows="3" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} placeholder="Enter a fictional diagnosis" /></label>
              <label>Prescription<textarea rows="3" value={prescription} onChange={(event) => setPrescription(event.target.value)} placeholder="Enter a fictional prescription" /></label>
              <button className="btn btn--ghost" type="submit"><Save size={16} />Save local draft</button>
            </form>
            <form className="card form consultation-form" onSubmit={createLabOrder}>
              <div><p className="eyebrow">Connected workflow</p><h3><FlaskConical size={17} /> Create lab order</h3></div>
              <p className="muted small">Orders are sent to the existing lab queue for this visit.</p>
              <label>Test<select value={testName} onChange={(event) => setTestName(event.target.value)}>{meta.labTests.map((test) => <option key={test}>{test}</option>)}</select></label>
              <label>Note for laboratory<textarea rows="3" value={labNotes} onChange={(event) => setLabNotes(event.target.value)} placeholder="Optional test note" /></label>
              <button className="btn btn--primary" type="submit" disabled={busy}><ClipboardPlus size={16} />{busy ? 'Adding order…' : 'Add lab order'}</button>
            </form>
          </div>
          <p className="demo-footnote">Complete the consultation from the queue actions after the patient has been seen.</p>
        </>
      )}
    </div>
  );
}
