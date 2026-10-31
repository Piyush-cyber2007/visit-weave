import { CalendarDays, CircleHelp, ClipboardList, FileText, LayoutDashboard, LogOut, Bell, UserRound } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { clearDemoAuth, getDemoAuth } from '../auth.js';
import { patientSession } from '../api.js';
import ThemeButton from '../components/ThemeButton.jsx';

const NAV = [
  { to: '/patient', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/patient/book', label: 'Book appointment', icon: CalendarDays },
  { to: '/patient/queue', label: 'My queue', icon: ClipboardList },
  { to: '/patient/appointments', label: 'My appointments', icon: CalendarDays },
  { to: '/patient/reports', label: 'Medical reports', icon: FileText },
  { to: '/patient/profile', label: 'Profile', icon: UserRound },
  { to: '/patient/help', label: 'Help & support', icon: CircleHelp },
];

const TITLES = {
  '/patient': 'Overview',
  '/patient/book': 'Book appointment',
  '/patient/queue': 'My queue',
  '/patient/appointments': 'My appointments',
  '/patient/reports': 'Medical reports',
  '/patient/profile': 'Profile',
  '/patient/help': 'Help & support',
};

export default function PatientLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = getDemoAuth();
  const title = TITLES[pathname] || 'Patient care';

  function signOut() {
    patientSession.set(null);
    clearDemoAuth();
    navigate('/login', { replace: true });
  }

  return (
    <div className="portal-shell patient-shell">
      <aside className="portal-sidebar">
        <NavLink to="/patient" className="portal-brand"><span className="portal-brand__mark">V</span><span>VisitWeave<small>Patient portal</small></span></NavLink>
        <p className="sidebar-label">YOUR CARE</p>
        <nav className="sidebar-nav" aria-label="Patient navigation">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'sidebar-link is-active' : 'sidebar-link'}>
              <Icon size={18} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-mini"><span className="avatar avatar--patient"><UserRound size={17} /></span><span><strong>{user?.displayName || 'Demo Patient'}</strong><small>Patient account</small></span></div>
          <button className="sidebar-link sidebar-link--button" onClick={signOut}><LogOut size={18} /><span>Log out</span></button>
        </div>
      </aside>
      <div className="portal-main">
        <header className="portal-topbar">
          <div><p className="eyebrow">Patient portal</p><h1>{title}</h1></div>
          <div className="portal-topbar__actions">
            <button className="icon-button" aria-label="Notifications" title="Notifications" onClick={() => toast.info('You are all caught up.')}><Bell size={18} /></button>
            <ThemeButton />
            <span className="avatar avatar--patient"><UserRound size={17} /></span>
          </div>
        </header>
        <main className="portal-content"><Outlet /></main>
      </div>
      <nav className="mobile-portal-nav" aria-label="Patient navigation">
        {NAV.slice(0, 5).map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'mobile-portal-nav__link is-active' : 'mobile-portal-nav__link'}>
            <Icon size={19} /><span>{label === 'Book appointment' ? 'Book' : label === 'My appointments' ? 'Visits' : label === 'Medical reports' ? 'Reports' : label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
