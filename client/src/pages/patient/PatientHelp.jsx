import { ArrowUpRight, CircleHelp, FileQuestion, PhoneCall } from 'lucide-react';
import { Link } from 'react-router-dom';

const FAQ = [
  { question: 'When is my queue token created?', answer: 'Online booking reserves a time slot only. Your token is issued after you check in at the hospital.' },
  { question: 'Where do I find my hall code?', answer: 'The current four-digit code is shown on the public queue display in the waiting hall. It rotates every three minutes.' },
  { question: 'How do I access a report?', answer: 'Open My Queue and sign in with the visit token and PIN printed on your visit slip. Released lab reports appear with that visit.' },
];

export default function PatientHelp() {
  return (
    <section className="portal-section">
      <div className="section-heading"><div><p className="eyebrow">We're here to help</p><h2>Help & support</h2></div></div>
      <div className="help-grid">
        <article className="help-contact"><span className="summary-card__icon"><PhoneCall size={19} /></span><h3>Talk to the care desk</h3><p>For visit-specific questions, speak with hospital registration staff.</p><a className="btn btn--ghost" href="mailto:support@visitweave.demo">Contact support <ArrowUpRight size={16} /></a></article>
        <article className="help-contact"><span className="summary-card__icon"><FileQuestion size={19} /></span><h3>Queue status</h3><p>Approximate waits update as the department works through its queue.</p><Link className="btn btn--ghost" to="/patient/queue">Open my queue <ArrowUpRight size={16} /></Link></article>
      </div>
      <div className="faq-list"><h3><CircleHelp size={18} /> Common questions</h3>{FAQ.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
      <p className="notice">VisitWeave is a demonstration prototype. Do not enter real health information or rely on it for medical advice.</p>
    </section>
  );
}
