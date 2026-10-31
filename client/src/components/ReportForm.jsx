import { useState } from 'react';
import { api } from '../api.js';

const SAMPLES = {
  'Complete Blood Count (CBC)': 'FICTIONAL REPORT. Hb 13.2 g/dL, WBC 7,800/µL, Platelets 2.4 lakh/µL. All values within reference range.',
  'Fasting Blood Glucose': 'FICTIONAL REPORT. Fasting glucose 96 mg/dL (reference 70–99). Normal.',
  'Lipid Profile': 'FICTIONAL REPORT. Total cholesterol 182, LDL 104, HDL 52, Triglycerides 128 mg/dL. Within desirable limits.',
  'Thyroid Panel (TSH)': 'FICTIONAL REPORT. TSH 2.1 mIU/L (reference 0.4–4.0). Normal thyroid function.',
  Urinalysis: 'FICTIONAL REPORT. Clear, pale yellow. pH 6.0. No protein, glucose or blood detected.',
  'Liver Function Test': 'FICTIONAL REPORT. ALT 28 U/L, AST 24 U/L, Bilirubin 0.8 mg/dL. Within reference range.',
};

export default function ReportForm({ order, onDone }) {
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function release(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('summary', summary);
    if (file) form.append('file', file);
    try {
      const r = await api(`/api/lab-orders/${order.id}/report`, { method: 'POST', form });
      onDone?.(`Released ${r.testName} report for ${r.token}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="report-form" onSubmit={release}>
      <textarea
        rows={3}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Report summary (fictional)"
        required
      />
      <div className="row">
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={(e) => setFile(e.target.files[0] ?? null)} />
        <button type="button" className="btn btn--ghost" onClick={() => setSummary(SAMPLES[order.testName] ?? 'FICTIONAL REPORT.')}>
          Fill sample
        </button>
        <button className="btn" disabled={busy}>
          {busy ? 'Releasing…' : 'Release report'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
