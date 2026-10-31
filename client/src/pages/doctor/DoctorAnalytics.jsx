import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Clock3, UsersRound } from 'lucide-react';
import { api, useLive } from '../../api.js';
import { useTheme } from '../../contexts/ThemeContext.jsx';

const DEPARTMENTS = ['registration', 'doctor', 'lab'];
const COLORS = ['#3686f5', '#16a394', '#e3a650'];
const TRENDS = {
  today: [
    { label: '08:00', checkIns: 9, consultations: 4 }, { label: '10:00', checkIns: 17, consultations: 12 },
    { label: '12:00', checkIns: 14, consultations: 16 }, { label: '14:00', checkIns: 11, consultations: 10 },
    { label: '16:00', checkIns: 18, consultations: 15 }, { label: '18:00', checkIns: 7, consultations: 8 },
  ],
  week: [
    { label: 'Mon', checkIns: 58, consultations: 46 }, { label: 'Tue', checkIns: 72, consultations: 60 },
    { label: 'Wed', checkIns: 66, consultations: 54 }, { label: 'Thu', checkIns: 81, consultations: 69 },
    { label: 'Fri', checkIns: 75, consultations: 64 }, { label: 'Sat', checkIns: 49, consultations: 41 },
    { label: 'Sun', checkIns: 28, consultations: 21 },
  ],
  month: [
    { label: 'Wk 1', checkIns: 310, consultations: 264 }, { label: 'Wk 2', checkIns: 354, consultations: 302 },
    { label: 'Wk 3', checkIns: 328, consultations: 279 }, { label: 'Wk 4', checkIns: 382, consultations: 326 },
  ],
};

export default function DoctorAnalytics() {
  const [overview, setOverview] = useState(null);
  const [period, setPeriod] = useState('today');
  const [error, setError] = useState('');
  const { theme } = useTheme();
  const live = useLive(() => api('/api/staff/overview').then(setOverview).catch((cause) => setError(cause.message)));
  const axis = theme === 'dark' ? '#9aa9a5' : '#667782';
  const grid = theme === 'dark' ? '#35443f' : '#e1e8e9';

  if (!overview) return <div className="loading-state"><span className="spinner" />{error || 'Loading queue analytics…'}</div>;

  const departments = DEPARTMENTS.map((key) => overview.departments[key]);
  const departmentRows = departments.map((department) => ({ name: department.name.replace(' Consultation', ''), waiting: department.waiting.length, serving: department.serving.length, completed: department.servedToday, average: department.avgServiceMin }));
  const waitingRows = departmentRows.map(({ name, waiting }) => ({ name, value: waiting }));
  const totalServed = departments.reduce((total, department) => total + department.servedToday, 0);
  const totalWaiting = departments.reduce((total, department) => total + department.waiting.length, 0);
  const totalActivity = totalServed + totalWaiting + departments.reduce((total, department) => total + department.serving.length, 0);
  const completionRate = totalActivity ? Math.round((totalServed / totalActivity) * 100) : 0;

  return (
    <div className="analytics-page">
      <div className="section-heading"><div><p className="eyebrow">Queue performance</p><h2>Analytics</h2><p className="muted">Live department counts from the hospital queue API.</p></div><div className="analytics-period"><span>Sample trends</span><select aria-label="Trend period" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select></div></div>
      {error && <p className="error" role="alert">Analytics refresh failed: {error}</p>}
      <div className="analytics-kpis"><article><span><UsersRound size={17} />Queue activity</span><strong>{totalActivity}</strong><small>Waiting, serving, and completed stages</small></article><article><span><Clock3 size={17} />Avg. service time</span><strong>{Math.round(departments.reduce((sum, department) => sum + department.avgServiceMin, 0) / departments.length)} <small>min</small></strong><small>Across active departments</small></article><article><span><Activity size={17} />Stage completion</span><strong>{completionRate}<small>%</small></strong><small>{totalServed} completed stages today</small></article></div>
      <div className="analytics-grid">
        <section className="data-panel analytics-panel analytics-panel--wide"><header className="data-panel__head"><div><p className="eyebrow">Illustrative only</p><h3>Patient flow · {period === 'today' ? 'today' : period === 'week' ? 'this week' : 'this month'}</h3></div><span className="demo-chip">DEMO DATA</span></header><ResponsiveContainer width="100%" height={260}><LineChart data={TRENDS[period]} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}><CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" stroke={axis} tickLine={false} axisLine={false} /><YAxis stroke={axis} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: theme === 'dark' ? '#17211e' : '#fff', borderColor: grid, borderRadius: 8 }} /><Line type="monotone" dataKey="checkIns" name="Check-ins" stroke="#3686f5" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="consultations" name="Consultations" stroke="#16a394" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer><p className="chart-caption">Sample trend series for layout demonstration; historical analytics are not provided by the current API.</p></section>
        <section className="data-panel analytics-panel"><header className="data-panel__head"><div><p className="eyebrow">Live API</p><h3>People waiting by department</h3></div><span className={live ? 'live-pill live-pill--on' : 'live-pill'}><i />{live ? 'Live' : 'Polling'}</span></header><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={waitingRows} dataKey="value" nameKey="name" innerRadius={66} outerRadius={92} paddingAngle={4}><Cell fill={COLORS[0]} /><Cell fill={COLORS[1]} /><Cell fill={COLORS[2]} /></Pie><Tooltip contentStyle={{ background: theme === 'dark' ? '#17211e' : '#fff', borderColor: grid, borderRadius: 8 }} /></PieChart></ResponsiveContainer><div className="chart-legend">{waitingRows.map((row, index) => <span key={row.name}><i style={{ background: COLORS[index] }} />{row.name}<strong>{row.value}</strong></span>)}</div></section>
        <section className="data-panel analytics-panel analytics-panel--wide"><header className="data-panel__head"><div><p className="eyebrow">Live API</p><h3>Department performance</h3></div></header><ResponsiveContainer width="100%" height={250}><BarChart data={departmentRows} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}><CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" stroke={axis} tickLine={false} axisLine={false} /><YAxis stroke={axis} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: theme === 'dark' ? '#17211e' : '#fff', borderColor: grid, borderRadius: 8 }} /><Bar dataKey="completed" name="Completed stages" fill="#16a394" radius={[4, 4, 0, 0]} /><Bar dataKey="waiting" name="Waiting" fill="#3686f5" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer><p className="chart-caption">Service and queue counts reflect the latest API snapshot. Completed stages are not the same as completed visits.</p></section>
      </div>
    </div>
  );
}
