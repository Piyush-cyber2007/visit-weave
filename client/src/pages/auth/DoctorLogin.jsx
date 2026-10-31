import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Stethoscope } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authenticate, setDemoAuth } from '../../auth.js';

export default function DoctorLogin() {
  const navigate = useNavigate();
  const [doctorId, setDoctorId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    const user = authenticate('doctor', doctorId, password);
    if (!user) {
      setError('The doctor ID or password is incorrect.');
      return;
    }
    setDemoAuth(user, remember);
    toast.success('Signed in to the staff workspace.');
    navigate('/doctor', { replace: true });
  }

  return (
    <div className="login-page">
      <motion.section className="login-side" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}>
        <Link className="back-link" to="/login"><ArrowLeft size={17} /> All portals</Link>
        <span className="login-icon login-icon--staff"><Stethoscope size={22} /></span>
        <p className="eyebrow">VisitWeave · Clinical team</p>
        <h1>Staff portal</h1>
        <p className="lead">Coordinate registration, consultation and laboratory queues from one workspace.</p>
        <div className="login-trust"><span className="status-dot" /> Demo workspace · fictional records only</div>
      </motion.section>
      <motion.form className="login-form" onSubmit={submit} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <div>
          <p className="eyebrow">Secure staff access</p>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your demo doctor credentials.</p>
        </div>
        <label>
          Doctor ID or email
          <input value={doctorId} onChange={(event) => setDoctorId(event.target.value)} autoComplete="username" placeholder="doctor@visitweave.demo" required />
        </label>
        <label>
          Password
          <span className="password-field">
            <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        <div className="login-form__options">
          <label className="check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember me</label>
          <a href="mailto:support@visitweave.demo">Forgot password?</a>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" type="submit">Sign in to VisitWeave</button>
        <p className="demo-hint">Demo ID <code>doctor@visitweave.demo</code><br />Password <code>Demo@123</code></p>
      </motion.form>
    </div>
  );
}
