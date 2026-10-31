import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Book from './pages/Book.jsx';
import CheckIn from './pages/CheckIn.jsx';
import Home from './pages/Home.jsx';
import Patient from './pages/Patient.jsx';
import Registration from './pages/Registration.jsx';
import Staff from './pages/Staff.jsx';
import Display from './pages/Display.jsx';

export default function App() {
  const { pathname } = useLocation();
  const fullScreen = pathname.startsWith('/display');

  return (
    <div className={fullScreen ? 'app app--display' : 'app'}>
      {!fullScreen && (
        <header className="topbar">
          <NavLink to="/" className="brand">
            <span className="brand__mark">1</span>
            <span>
              OneToken <small>Hospital Queues</small>
            </span>
          </NavLink>
          <nav className="topnav">
            <NavLink to="/book">Book</NavLink>
            <NavLink to="/patient">Patient</NavLink>
            <NavLink to="/registration">Registration</NavLink>
            <NavLink to="/staff/doctor">Doctor</NavLink>
            <NavLink to="/staff/lab">Lab</NavLink>
            <NavLink to="/display">Display</NavLink>
          </nav>
        </header>
      )}
      <main className={fullScreen ? '' : 'page'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book" element={<Book />} />
          <Route path="/checkin/:code" element={<CheckIn />} />
          <Route path="/patient" element={<Patient />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/staff/:dept" element={<Staff />} />
          <Route path="/display" element={<Display />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
