import { useState } from 'react';
import { Bell, CircleHelp, Database, Monitor, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api.js';
import ThemeButton from '../../components/ThemeButton.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';

export default function DoctorSettings() {
  const { theme } = useTheme();
  const [resetting, setResetting] = useState(false);

  async function resetDemo() {
    if (!window.confirm('Delete all demo visits, queues, bookings and reports, then restore sample bookings?')) return;
    setResetting(true);
    try {
      await api('/api/admin/reset', { method: 'POST' });
      toast.success('Demo data reset.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="portal-section settings-page">
      <div className="section-heading"><div><p className="eyebrow">Workspace preferences</p><h2>Settings</h2><p className="muted">Preferences are stored in this browser.</p></div></div>
      <div className="settings-list">
        <article className="settings-row"><span className="settings-row__icon"><Monitor size={19} /></span><div><strong>Appearance</strong><small>Current mode: {theme === 'dark' ? 'Dark' : 'Light'}. Respects your saved device preference.</small></div><ThemeButton /></article>
        <article className="settings-row"><span className="settings-row__icon"><Bell size={19} /></span><div><strong>Queue notifications</strong><small>Live updates are delivered while this workspace is open.</small></div><span className="settings-status">Enabled</span></article>
        <article className="settings-row"><span className="settings-row__icon"><ShieldCheck size={19} /></span><div><strong>Demo account</strong><small>Frontend-only role access. No backend staff authorization is configured.</small></div><span className="demo-chip">DEMO</span></article>
        <article className="settings-row"><span className="settings-row__icon"><Database size={19} /></span><div><strong>Reset demo data</strong><small>Restore the sample bookings and clear queue activity from the connected demo API.</small></div><button className="btn btn--ghost" disabled={resetting} onClick={resetDemo}>{resetting ? 'Resetting…' : 'Reset data'}</button></article>
        <article className="settings-row"><span className="settings-row__icon"><CircleHelp size={19} /></span><div><strong>Clinical data</strong><small>Use fictional patient details only. Local consultation drafts stay in this browser.</small></div></article>
      </div>
    </section>
  );
}
