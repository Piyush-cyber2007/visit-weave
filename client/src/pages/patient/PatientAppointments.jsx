import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, storage } from '../../api.js';

function savedCodes() {
  try {
    return JSON.parse(storage('patient-bookings', '[]'));
  } catch {
    return [];
  }
}

export default function PatientAppointments() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadBookings() {
    const codes = savedCodes();
    if (!codes.length) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const results = await Promise.all(codes.map(async (code) => {
      try {
        return await api(`/api/booking/${encodeURIComponent(code)}`);
      } catch (cause) {
        setError(cause.message);
        return null;
      }
    }));
    setBookings(results.filter(Boolean));
    setLoading(false);
  }

  useEffect(() => { loadBookings(); }, []);

  async function cancel(booking) {
    if (!window.confirm(`Cancel booking ${booking.bookingCode}?`)) return;
    try {
      const updated = await api(`/api/booking/${encodeURIComponent(booking.bookingCode)}/cancel`, { method: 'POST' });
      setBookings((current) => current.map((item) => item.bookingCode === booking.bookingCode ? updated : item));
    } catch (cause) {
      setError(cause.message);
    }
  }

  return (
    <section className="portal-section">
      <div className="section-heading"><div><p className="eyebrow">Appointments</p><h2>Your bookings</h2></div><Link className="btn btn--primary" to="/patient/book">Book a visit</Link></div>
      {error && <p className="error" role="alert">Booking status could not be refreshed: {error}</p>}
      {loading ? <div className="skeleton-list"><span /><span /><span /></div> : bookings.length ? (
        <div className="appointment-list">
          {bookings.map((booking) => (
            <article className="appointment-row" key={booking.bookingCode}>
              <span className="appointment-row__icon"><CalendarDays size={20} /></span>
              <div className="appointment-row__details"><strong>{booking.departmentName}</strong><span>{booking.slotLabel}</span><small>Booking {booking.bookingCode}</small></div>
              <span className={`pill pill--${booking.status}`}>{booking.status.replaceAll('_', ' ')}</span>
              {booking.status === 'booked' && <button className="text-button text-button--danger" onClick={() => cancel(booking)}>Cancel</button>}
              {booking.status === 'booked' && <Link className="icon-button" to={`/checkin/${booking.bookingCode}`} aria-label="Open check-in"><ExternalLink size={17} /></Link>}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><CalendarDays size={27} /><h3>No saved appointments</h3><p>Bookings made on this device will appear here. Your token is created only after check-in.</p><Link className="btn btn--primary" to="/patient/book">Browse available times</Link></div>
      )}
    </section>
  );
}
