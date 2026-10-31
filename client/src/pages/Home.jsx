import { motion } from 'framer-motion';
import { Activity, ArrowRight, Clock3, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

const PORTALS = [
  { to: '/login/patient', icon: UserRound, label: 'For patients', title: 'Patient portal', description: 'Book appointments, check in, follow your queue, and access released reports.', action: 'Continue as patient', className: 'portal-choice--patient' },
  { to: '/login/doctor', icon: Stethoscope, label: 'For hospital teams', title: 'Doctor portal', description: 'Coordinate patient flow across registration, consultations, and laboratory.', action: 'Continue as doctor', className: 'portal-choice--doctor' },
];

export default function Home() {
  return (
    <div className="portal-home">
      <motion.section className="portal-story" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}>
        <div className="portal-story__brand"><span className="brand__mark">V</span><strong>VisitWeave</strong></div>
        <p className="eyebrow">Hospital care coordination</p>
        <h1>Healthcare, without the waiting.</h1>
        <p className="lead">One connected visit keeps patients and care teams in sync from arrival to report.</p>
        <div className="care-visual" aria-hidden="true">
          <div className="care-visual__ring care-visual__ring--outer" />
          <div className="care-visual__ring care-visual__ring--inner" />
          <div className="care-visual__center"><Activity size={40} strokeWidth={1.5} /></div>
          <span className="care-visual__node care-visual__node--one"><UserRound size={17} /></span>
          <span className="care-visual__node care-visual__node--two"><Stethoscope size={17} /></span>
          <span className="care-visual__node care-visual__node--three"><ShieldCheck size={17} /></span>
          <span className="care-visual__caption">Registration <i /> Consultation <i /> Laboratory</span>
        </div>
        <div className="portal-signals">
          <span><Clock3 size={16} />Faster patient flow</span>
          <span><Activity size={16} />Live queue updates</span>
          <span><ShieldCheck size={16} />Protected report access</span>
        </div>
      </motion.section>
      <motion.section className="portal-entry" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="portal-entry__heading">
          <p className="eyebrow">Welcome to VisitWeave</p>
          <h2>Choose your portal</h2>
          <p className="muted">Select the workspace that fits your visit.</p>
        </div>
        <div className="portal-choices">
          {PORTALS.map(({ to, icon: Icon, label, title, description, action, className }) => (
            <Link to={to} key={to} className={`portal-choice ${className}`}>
              <span className="portal-choice__top"><span className="portal-choice__icon"><Icon size={21} /></span><span className="portal-choice__label">{label}</span></span>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="portal-choice__action">{action}<ArrowRight size={17} /></span>
            </Link>
          ))}
        </div>
        <div className="portal-entry__foot"><span className="status-dot" />Demo environment <span>·</span> Fictional records only</div>
      </motion.section>
    </div>
  );
}
