import { useState } from 'react';
import { Check, Pencil, UserRound } from 'lucide-react';
import { getDemoAuth } from '../../auth.js';
import { storage, store } from '../../api.js';

function initialProfile(user) {
  try {
    return JSON.parse(storage(`mediflow-profile:${user?.phone || 'demo'}`, 'null')) || {
      name: user?.displayName || 'Rahul Sharma',
      age: '34',
      phone: user?.phone || '9876543210',
      patientId: 'DEMO-P-024',
    };
  } catch {
    return { name: user?.displayName || 'Rahul Sharma', age: '34', phone: user?.phone || '', patientId: 'DEMO-P-024' };
  }
}

export default function PatientProfile() {
  const user = getDemoAuth();
  const [profile, setProfile] = useState(() => initialProfile(user));
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function save(event) {
    event.preventDefault();
    store(`mediflow-profile:${user?.phone || 'demo'}`, JSON.stringify(profile));
    setEditing(false);
    setSaved(true);
  }

  return (
    <section className="portal-section profile-section">
      <div className="section-heading"><div><p className="eyebrow">Personal details</p><h2>Profile</h2></div><button className="btn btn--ghost" onClick={() => setEditing((current) => !current)}><Pencil size={16} />{editing ? 'Cancel' : 'Edit profile'}</button></div>
      <div className="demo-banner"><span className="demo-banner__dot" />DEMO PROFILE <span>Changes are saved only in this browser.</span></div>
      <div className="profile-card">
        <span className="profile-avatar"><UserRound size={28} /></span>
        {editing ? (
          <form className="profile-form" onSubmit={save}>
            <label>Full name<input value={profile.name} onChange={(event) => update('name', event.target.value)} required /></label>
            <div className="row"><label>Age<input type="number" min="0" max="120" value={profile.age} onChange={(event) => update('age', event.target.value)} /></label><label>Phone<input value={profile.phone} onChange={(event) => update('phone', event.target.value)} /></label></div>
            <button className="btn btn--primary" type="submit"><Check size={17} />Save profile</button>
          </form>
        ) : (
          <dl className="profile-details">
            <div><dt>Full name</dt><dd>{profile.name}</dd></div>
            <div><dt>Age</dt><dd>{profile.age || 'Not added'}</dd></div>
            <div><dt>Phone</dt><dd>{profile.phone || 'Not added'}</dd></div>
            <div><dt>Patient ID</dt><dd className="mono">{profile.patientId}</dd></div>
            {saved && <p className="success">Profile saved on this device.</p>}
          </dl>
        )}
      </div>
    </section>
  );
}
