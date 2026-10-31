import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSocket, useLive } from '../api.js';
import ThemeButton from '../components/ThemeButton.jsx';

const STATUS_LABEL = { serving: 'Serving', waiting: 'Waiting', idle: 'Open' };

export default function Display() {
  const [board, setBoard] = useState(null);
  const [flash, setFlash] = useState(null);
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(new Date());
  const [hall, setHall] = useState(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const live = useLive(() => api('/api/display').then(setBoard).catch(() => {}));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // The hall code is pushed only to sockets in the display room (rejoin on reconnect).
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit('display:join');
    s.on('hallcode', setHall);
    s.on('connect', join);
    if (s.connected) join();
    return () => {
      s.off('hallcode', setHall);
      s.off('connect', join);
    };
  }, []);

  useEffect(() => {
    const s = getSocket();
    let timer;
    const onAnnounce = (a) => {
      setFlash(a);
      clearTimeout(timer);
      timer = setTimeout(() => setFlash(null), 8000);
      if (soundRef.current && 'speechSynthesis' in window) {
        const spoken = `Token ${a.token.replace('T-', '').split('').join(' ')}`;
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${spoken}, please go to ${a.departmentName}, ${a.counter}`));
      }
    };
    s.on('announce', onAnnounce);
    return () => {
      s.off('announce', onAnnounce);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="display">
      <header className="display__head">
        <Link to="/" className="display__brand">OneToken · Live Queue</Link>
        <div className="display__right">
          <button className="btn btn--dark" onClick={() => setSound(!sound)}>
            {sound ? '🔊 Announcements on' : '🔈 Enable announcements'}
          </button>
          <ThemeButton className="theme-button--display" />
          <span className={live ? 'dot dot--on' : 'dot'} />
          <time>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
      </header>

      <div className="hall">
        <div>
          <p className="board__label">Booked online? Check in with this hall code</p>
          <p className="hall__hint">Open your check-in link → “I've arrived” → enter the code</p>
        </div>
        <div className="hall__code" aria-live="polite">{hall?.code ?? '····'}</div>
        <div className="hall__timer">
          {hall && (
            <>
              changes in {Math.max(0, Math.ceil((new Date(hall.expiresAt) - now) / 1000))} s
              <span
                className="hall__bar"
                style={{ width: `${Math.max(0, Math.min(100, ((new Date(hall.expiresAt) - now) / 180000) * 100))}%` }}
              />
            </>
          )}
        </div>
      </div>

      <div className={flash ? 'display__flash display__flash--on' : 'display__flash'} aria-live="assertive">
        {flash ? (
          <>
            <span className="display__flash-token">{flash.token}</span>
            <span>
              please go to <strong>{flash.departmentName}</strong> · {flash.counter}
            </span>
          </>
        ) : (
          <span className="muted">Please watch for your token. Same token at every department.</span>
        )}
      </div>

      <div className="display__cols">
        {board?.departments.map((d) => (
          <section key={d.key} className="board">
            <header className="board__head">
              <h2>{d.name}</h2>
              <span className={`pill pill--${d.status}`}>{STATUS_LABEL[d.status]}</span>
            </header>
            <p className="board__label">Now serving</p>
            {d.serving.length ? (
              d.serving.map((s) => (
                <div key={s.token} className={flash?.token === s.token ? 'board__now board__now--flash' : 'board__now'}>
                  <span className="board__token">{s.token}</span>
                  <span className="board__counter">{s.counter}</span>
                </div>
              ))
            ) : (
              <div className="board__now board__now--empty">—</div>
            )}
            <p className="board__label">Next</p>
            <div className="board__next">
              {d.nextUp.length ? d.nextUp.map((t) => <span key={t}>{t}</span>) : <span className="muted">No one waiting</span>}
            </div>
            <footer className="board__foot">
              <span>{d.waitingCount} waiting</span>
              <span title={d.estimate.basis}>
                ≈ {d.estimate.minutes} min for new arrivals <small>(approx.)</small>
              </span>
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}
