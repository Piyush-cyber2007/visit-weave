import { useState } from 'react';
import { ArrowLeft, ArrowRight, Phone, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function PatientLogin() {
  const navigate = useNavigate();
  const { requestPatientOtp, verifyPatientOtp } = useAuth();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('9876543210');
  const [otp, setOtp] = useState('');
  const [developmentOtp, setDevelopmentOtp] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestCode(event) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, '');
    const e164Phone = phone.trim().startsWith('+')
      ? `+${digits}`
      : digits.length === 10
        ? `+91${digits}`
        : `+${digits}`;
    if (!/^\+[1-9]\d{7,14}$/.test(e164Phone)) {
      setError('Enter a valid phone number with country code, or a 10-digit Indian number.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const response = await requestPatientOtp(e164Phone);
      setPhone(e164Phone);
      setDevelopmentOtp(response.development_otp);
      setOtp('');
      setStep('otp');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not request a verification code.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the six-digit verification code.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await verifyPatientOtp(phone, otp);
      toast.success('Phone number verified.');
      navigate('/patient', { replace: true });
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Could not verify this phone number.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <motion.section className="login-side" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}>
        <Link className="back-link" to="/login"><ArrowLeft size={17} /> All portals</Link>
        <span className="login-icon"><UserRound size={22} /></span>
        <p className="eyebrow">VisitWeave · Patient care</p>
        <h1>Your care, in one place.</h1>
        <p className="lead">Book a visit, follow your place in the queue, and find released reports when you need them.</p>
        <div className="login-trust"><span className="status-dot" /> Private visit details stay behind your visit token and PIN</div>
      </motion.section>
      <motion.form className="login-form" onSubmit={step === 'phone' ? requestCode : verifyCode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <div>
          <p className="eyebrow">Patient portal</p>
          <h2>{step === 'phone' ? 'Continue with your phone' : 'Verify your number'}</h2>
          <p className="muted">{step === 'phone' ? 'We’ll send a verification code to your phone.' : `Enter the six-digit code sent to ${phone}.`}</p>
        </div>
        {step === 'phone' ? (
          <label>
            Phone number
            <span className="phone-field"><Phone size={18} /><input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="10-digit phone number" required /></span>
          </label>
        ) : (
          <>
            <label>
              One-time code
              <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" required />
            </label>
            {developmentOtp && <p className="demo-hint">Development verification code <code>{developmentOtp}</code></p>}
            <button type="button" className="text-button" disabled={isSubmitting} onClick={() => { setStep('phone'); setOtp(''); setDevelopmentOtp(null); setError(''); }}>Change phone number</button>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait…' : step === 'phone' ? <>Continue <ArrowRight size={17} /></> : 'Verify and continue'}
        </button>
        <p className="muted small">Need help? <a href="mailto:support@visitweave.demo">Contact patient support</a>.</p>
        <p className="muted small">Viewing queue details or reports also requires the token and PIN on your visit slip.</p>
      </motion.form>
    </div>
  );
}
