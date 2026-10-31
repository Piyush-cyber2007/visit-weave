import { Activity, BarChart3, Bell, ClipboardList, FileText, FlaskConical, LayoutDashboard, LogOut, Settings, Stethoscope, UserRound, UsersRound } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import ThemeButton from '../components/ThemeButton.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

const NAV = [
  { to: '/doctor', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/doctor/queue/doctor', label: 'Live queue', icon: Activity },
  { to: '/doctor/registration', label: 'Registration', icon: ClipboardList },
  { to: '/doctor/consultation', label: 'Consultation', icon: Stethoscope },
  { to: '/doctor/laboratory', label: 'Laboratory', icon: FlaskConical },
  { to: '/doctor/reports', label: 'Reports', icon: FileText },
  { to: '/doctor/history', label: 'Patient history', icon: UsersRound },
  { to: '/doctor/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/doctor/settings', label: 'Settings', icon: Settings },
];

const TITLES = {
  '/doctor': 'Overview',
  '/doctor/registration': 'Registration desk',
  '/doctor/consultation': 'Consultation workspace',
  '/doctor/laboratory': 'Laboratory',
  '/doctor/reports': 'Reports',
  '/doctor/history': 'Patient history',
  '/doctor/analytics': 'Analytics',
  '/doctor/settings': 'Settings',
};

export default function DoctorLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const title = pathname.includes('/doctor/queue/') ? 'Live queue' : TITLES[pathname] || 'Staff workspace';

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="portal-shell doctor-shell">
      <aside className="portal-sidebar">
        <NavLink to="/doctor" className="portal-brand"><span className="portal-brand__mark">V</span><span>VisitWeave<small>Clinical operations</small></span></NavLink>
        <p className="sidebar-label">WORKSPACE</p>
        <nav className="sidebar-nav" aria-label="Doctor navigation">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'sidebar-link is-active' : 'sidebar-link'}>
              <Icon size={18} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-mini"><span className="avatar avatar--doctor"><Stethoscope size={17} /></span><span><strong>{user?.display_name || 'Doctor'}</strong><small>Hospital staff</small></span></div>
          <button className="sidebar-link sidebar-link--button" onClick={signOut}><LogOut size={18} /><span>Log out</span></button>
        </div>
      </aside>
      <div className="portal-main">
        <header className="portal-topbar">
          <div><p className="eyebrow">Clinical operations</p><h1>{title}</h1></div>
          <div className="portal-topbar__actions">
            <span className="current-date">{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <button className="icon-button" aria-label="Notifications" title="Notifications" onClick={() => toast.info('No new queue alerts.')}><Bell size={18} /></button>
            <ThemeButton />
            <span className="avatar avatar--doctor"><Stethoscope size={17} /></span>
          </div>
        </header>
        <main className="portal-content"><Outlet /></main>
      </div>
      <nav className="mobile-portal-nav" aria-label="Doctor navigation">
        {NAV.slice(0, 5).map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'mobile-portal-nav__link is-active' : 'mobile-portal-nav__link'}>
            <Icon size={19} /><span>{label === 'Live queue' ? 'Queue' : label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
