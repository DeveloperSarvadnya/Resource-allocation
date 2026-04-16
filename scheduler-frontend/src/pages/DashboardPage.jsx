import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { scheduleAPI, resourceAPI, unwrap } from '../services/api'
import '../components/ui/index.css'
import './Dashboard.css'

export default function DashboardPage() {
  const { user } = useAuth()
  const [schedules, setSchedules] = useState([])
  const [resources, setResources] = useState([])
  const [loading,   setLoading]   = useState(true)

  // ── Delete confirmation state ──────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  useEffect(() => {
    Promise.all([
      scheduleAPI.getAll().catch(() => ({ data: {} })),
      resourceAPI.getAll().catch(() => ({ data: {} })),
    ]).then(([s, r]) => {
      setSchedules(unwrap(s, 'schedules'))
      setResources(unwrap(r, 'resources'))
    }).finally(() => setLoading(false))
  }, [])

  const confirmed  = schedules.filter(s => s.status === 'confirmed').length
  const myBookings = schedules.filter(s => s.userId === user?.id || s.user_id === user?.id).length

  // ── Feature 4: Bookings Classification ─────────────────────
  const now = new Date()

  const upcomingBookings = schedules
    .filter(s => {
      const endTime = new Date(s.endTime || s.end_time)
      return endTime > now && s.status === 'confirmed'
    })
    .sort((a, b) => new Date(a.startTime || a.start_time) - new Date(b.startTime || b.start_time))

  const pastBookings = schedules
    .filter(s => {
      const endTime = new Date(s.endTime || s.end_time)
      return endTime <= now || s.status === 'cancelled'
    })
    .sort((a, b) => new Date(b.endTime || b.end_time) - new Date(a.endTime || a.end_time))

  const fmt = (d) => { try { return new Date(d).toLocaleString() } catch { return '—' } }
  const greeting = () => { const h = new Date().getHours(); return h<12?'morning':h<17?'afternoon':'evening' }

  // ── Feature 5: Delete Upcoming Bookings ────────────────────
  const handleDeleteClick = (schedule) => {
    setDeleteTarget(schedule)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await scheduleAPI.cancel(deleteTarget.id)
      // Remove from state immediately
      setSchedules(prev => prev.filter(s => s.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete booking:', err)
      alert('Failed to delete booking. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const cancelDelete = () => {
    setDeleteTarget(null)
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{width:32,height:32,border:'3px solid #1f2d45',borderTopColor:'#3b82f6',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Good {greeting()}, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="page-subtitle">Here's what's happening with your resources today</p>
      </div>

      <div className="grid-4" style={{marginBottom:24}}>
        <div className="stat-card blue">
          <span className="stat-icon">◷</span>
          <div className="stat-value">{schedules.length}</div>
          <div className="stat-label">Total Bookings</div>
        </div>
        <div className="stat-card green">
          <span className="stat-icon">✓</span>
          <div className="stat-value">{confirmed}</div>
          <div className="stat-label">Confirmed</div>
        </div>
        <div className="stat-card purple">
          <span className="stat-icon">⊞</span>
          <div className="stat-value">{resources.length}</div>
          <div className="stat-label">Resources</div>
        </div>
        <div className="stat-card yellow">
          <span className="stat-icon">★</span>
          <div className="stat-value">{myBookings}</div>
          <div className="stat-label">My Bookings</div>
        </div>
      </div>

      {/* ── Feature 4: Upcoming Bookings Section ──────────────── */}
      <div className="card" style={{marginBottom: 20}}>
        <div className="card-head">
          <h3 className="card-title">📅 Upcoming Bookings</h3>
          <Link to="/schedules" className="card-link">View all →</Link>
        </div>
        {upcomingBookings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <div>No upcoming bookings available</div>
          </div>
        ) : (
          <div className="booking-list">
            {upcomingBookings.map(s => (
              <div className="booking-item" key={s.id}>
                <div className="booking-dot" style={{background: 'var(--green)'}}/>
                <div className="booking-info">
                  <div className="booking-title">{s.title}</div>
                  <div className="booking-meta">{fmt(s.startTime || s.start_time)} — {fmt(s.endTime || s.end_time)}</div>
                </div>
                <span className={`badge badge-${s.status}`}>{s.status}</span>
                {/* Feature 5: Delete button for upcoming bookings only */}
                <button
                  className="btn btn-danger btn-sm delete-booking-btn"
                  onClick={() => handleDeleteClick(s)}
                  title="Cancel this booking"
                >
                  ✕ Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Feature 4: Past Bookings Section ──────────────────── */}
      <div className="card" style={{marginBottom: 20}}>
        <div className="card-head">
          <h3 className="card-title">🕐 Past Bookings</h3>
        </div>
        {pastBookings.length === 0 ? (
          <div className="empty-state">No past bookings</div>
        ) : (
          <div className="booking-list">
            {pastBookings.slice(0, 10).map(s => (
              <div className="booking-item past-booking" key={s.id}>
                <div className="booking-dot" style={{background: s.status==='cancelled'?'var(--red)':'var(--text3)'}}/>
                <div className="booking-info">
                  <div className="booking-title">{s.title}</div>
                  <div className="booking-meta">{fmt(s.startTime || s.start_time)} — {fmt(s.endTime || s.end_time)}</div>
                </div>
                <span className={`badge badge-${s.status}`}>{s.status}</span>
                {/* No delete button for past bookings */}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3 className="card-title">Quick Actions</h3></div>
          <div className="quick-actions">
            {[
              {to:'/book',      icon:'+', title:'Book a Resource',  sub:'Reserve a room or equipment'},
              {to:'/schedules', icon:'◷', title:'View Schedules',   sub:'See all upcoming bookings'},
              {to:'/analytics', icon:'⟁', title:'Analytics',        sub:'Resource usage and peak hours'},
            ].map(({to,icon,title,sub}) => (
              <Link key={to} to={to} className="quick-action-card">
                <span className="qa-icon">{icon}</span>
                <div><div className="qa-title">{title}</div><div className="qa-sub">{sub}</div></div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Feature 5: Delete Confirmation Modal ──────────────── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Cancel Booking</h3>
              <button className="modal-close" onClick={cancelDelete}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{color: 'var(--text2)', fontSize: 14, lineHeight: 1.6}}>
                Are you sure you want to cancel this booking?
              </p>
              <div className="delete-confirm-card">
                <div className="delete-confirm-title">{deleteTarget.title}</div>
                <div className="delete-confirm-meta">
                  {fmt(deleteTarget.startTime || deleteTarget.start_time)} — {fmt(deleteTarget.endTime || deleteTarget.end_time)}
                </div>
              </div>
              <p style={{color: 'var(--text3)', fontSize: 12}}>
                This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={cancelDelete} disabled={deleting}>
                Keep Booking
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Cancelling…' : '✕ Cancel Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}