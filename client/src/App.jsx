import { lazy, Suspense } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { clearDemoAuth, getDemoAuth, hasDemoRole } from './auth.js';
import { patientSession } from './api.js';
import ThemeButton from './components/ThemeButton.jsx';
import { useTheme } from './contexts/ThemeContext.jsx';
import DoctorLayout from './layouts/DoctorLayout.jsx';
import PatientLayout from './layouts/PatientLayout.jsx';

const Book = lazy(() => import('./pages/Book.jsx'));
const CheckIn = lazy(() => import('./pages/CheckIn.jsx'));
const Home = lazy(() => import('./pages/Home.jsx'));
const DoctorLogin = lazy(() => import('./pages/auth/DoctorLogin.jsx'));
const PatientLogin = lazy(() => import('./pages/auth/PatientLogin.jsx'));
const Patient = lazy(() => import('./pages/Patient.jsx'));
const PatientOverview = lazy(() => import('./pages/patient/PatientOverview.jsx'));
const PatientAppointments = lazy(() => import('./pages/patient/PatientAppointments.jsx'));
const PatientProfile = lazy(() => import('./pages/patient/PatientProfile.jsx'));
const PatientHelp = lazy(() => import('./pages/patient/PatientHelp.jsx'));
const DoctorOverview = lazy(() => import('./pages/doctor/DoctorOverview.jsx'));
const DoctorQueue = lazy(() => import('./pages/doctor/DoctorQueue.jsx'));
const DoctorConsultation = lazy(() => import('./pages/doctor/DoctorConsultation.jsx'));
const DoctorReports = lazy(() => import('./pages/doctor/DoctorReports.jsx'));
const DoctorHistory = lazy(() => import('./pages/doctor/DoctorHistory.jsx'));
const DoctorAnalytics = lazy(() => import('./pages/doctor/DoctorAnalytics.jsx'));
const DoctorSettings = lazy(() => import('./pages/doctor/DoctorSettings.jsx'));
const Registration = lazy(() => import('./pages/Registration.jsx'));
const Staff = lazy(() => import('./pages/Staff.jsx'));
const Display = lazy(() => import('./pages/Display.jsx'));

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const auth = getDemoAuth();
  const fullScreen = pathname.startsWith('/display');
  const isPortal = pathname.startsWith('/patient') || pathname.startsWith('/doctor');
  const homePath = auth?.role === 'doctor' ? '/doctor' : '/patient';
  const bookPath = auth?.role === 'patient' ? '/patient/book' : '/login/patient';

  function signOut() {
    patientSession.set(null);
    clearDemoAuth();
    navigate('/login', { replace: true });
  }

  return (
    <div className={fullScreen ? 'app app--display' : 'app'} data-theme={theme}>
      {!fullScreen && !isPortal && (
        <header className="topbar">
          <NavLink to={auth ? homePath : '/login'} className="brand">
              <span className="brand__mark">V</span>
            <span>
              VisitWeave <small>Smarter Queues. Better Care.</small>
            </span>
          </NavLink>
          <nav className="topnav">
            {auth && <NavLink to={homePath}>{auth.role === 'doctor' ? 'Staff workspace' : 'Patient portal'}</NavLink>}
            <NavLink to={bookPath}>Book appointment</NavLink>
            <NavLink to="/display">Display</NavLink>
            {auth ? (
              <button className="topnav__logout" onClick={signOut}>Sign out</button>
            ) : (
              <NavLink to="/login">Sign in</NavLink>
            )}
            <ThemeButton />
          </nav>
        </header>
      )}
      <main className={fullScreen ? '' : isPortal ? 'portal-route-main' : 'page'}>
        <Suspense fallback={<div className="loading-state"><span className="spinner" />Opening workspace…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Home />} />
            <Route path="/login/doctor" element={<DoctorLogin />} />
            <Route path="/login/patient" element={<PatientLogin />} />
            <Route path="/book" element={<RoleRoute role="patient"><Navigate to="/patient/book" replace /></RoleRoute>} />
            <Route path="/checkin/:code" element={<CheckIn />} />
            <Route path="/patient" element={<RoleRoute role="patient"><PatientLayout /></RoleRoute>}>
              <Route index element={<PatientOverview />} />
              <Route path="book" element={<Book />} />
              <Route path="queue" element={<Patient />} />
              <Route path="appointments" element={<PatientAppointments />} />
              <Route path="reports" element={<Patient />} />
              <Route path="profile" element={<PatientProfile />} />
              <Route path="help" element={<PatientHelp />} />
            </Route>
            <Route path="/doctor" element={<RoleRoute role="doctor"><DoctorLayout /></RoleRoute>}>
              <Route index element={<DoctorOverview />} />
              <Route path="queue/:dept" element={<DoctorQueue />} />
              <Route path="registration" element={<Registration />} />
              <Route path="consultation" element={<DoctorConsultation />} />
              <Route path="laboratory" element={<Staff departmentOverride="lab" />} />
              <Route path="reports" element={<DoctorReports />} />
              <Route path="history" element={<DoctorHistory />} />
              <Route path="analytics" element={<DoctorAnalytics />} />
              <Route path="settings" element={<DoctorSettings />} />
            </Route>
            <Route path="/registration" element={<RoleRoute role="doctor"><Navigate to="/doctor/registration" replace /></RoleRoute>} />
            <Route path="/staff/:dept" element={<RoleRoute role="doctor"><LegacyStaffRedirect /></RoleRoute>} />
            <Route path="/display" element={<Display />} />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        </Suspense>
      </main>
      <Toaster position="top-right" theme={theme} richColors />
    </div>
  );
}

function RoleRoute({ role, children }) {
  const location = useLocation();
  const auth = getDemoAuth();
  const hasPatientSession = role === 'patient' && Boolean(patientSession.get());

  if (auth) {
    if (hasDemoRole(auth, role)) return children;
    return <Navigate to={auth.role === 'doctor' ? '/doctor' : '/patient'} replace />;
  }
  if (hasPatientSession && role === 'patient') return children;
  return <Navigate to={role === 'doctor' ? '/login/doctor' : '/login/patient'} state={{ from: location }} replace />;
}

function LegacyStaffRedirect() {
  const { pathname } = useLocation();
  return <Navigate to={pathname.endsWith('/lab') ? '/doctor/laboratory' : '/doctor/queue/doctor'} replace />;
}
