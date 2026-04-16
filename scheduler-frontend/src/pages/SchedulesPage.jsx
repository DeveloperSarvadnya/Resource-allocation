import { useState, useEffect } from 'react'
import { scheduleAPI, unwrap } from '../services/api'
import '../components/ui/index.css'

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('all')
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')

  const load = () => {
    setLoading(true)
    scheduleAPI.getAll()
      .then(res => setSchedules(unwrap(res, 'schedules')))
      .catch(() => setError('Failed to load schedules'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleCancel = async (id) => {
    if (!confirm('Cancel this booking?')) return
    try {
      await scheduleAPI.cancel(id)
      setSuccess('Booking cancelled')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel')
      setTimeout(() => setError(''), 3000)
    }
  }

  const fmt = (d) => { try { return new Date(d).toLocaleString() } catch { return '—' } }
  const filtered = filter === 'all' ? schedules : schedules.filter(s => s.status === filter)

  // ── Split into Upcoming vs Past ─────────────────────────────
  const now = new Date()

  const upcoming = filtered
    .filter(s => {
      const endTime = new Date(s.endTime || s.end_time)
      return endTime > now && s.status !== 'cancelled'
    })
    .sort((a, b) => new Date(a.startTime || a.start_time) - new Date(b.startTime || b.start_time))

  const past = filtered
    .filter(s => {
      const endTime = new Date(s.endTime || s.end_time)
      return endTime <= now || s.status === 'cancelled'
    })
    .sort((a, b) => new Date(b.endTime || b.end_time) - new Date(a.endTime || a.end_time))

  // ── Reusable table renderer ─────────────────────────────────
  const renderTable = (rows, isPast) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th><th>Resource</th><th>Booked By</th>
            <th>Start</th><th>End</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s => (
            <tr key={s.id} style={isPast ? {opacity: 0.6} : undefined}>
              <td style={{fontWeight:500}}>{s.title}</td>
              <td style={{color:'var(--text2)'}}>{s.Resource?.name||s.resource?.name||'—'}</td>
              <td style={{color:'var(--text2)'}}>{s.User?.name||s.user?.name||'—'}</td>
              <td style={{color:'var(--text2)',fontSize:12}}>{fmt(s.startTime||s.start_time)}</td>
              <td style={{color:'var(--text2)',fontSize:12}}>{fmt(s.endTime||s.end_time)}</td>
              <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
              <td>
                {/* Only show Cancel for upcoming confirmed bookings */}
                {!isPast && s.status==='confirmed' && (
                  <button className="btn btn-danger btn-sm" onClick={()=>handleCancel(s.id)}>Cancel</button>
                )}
                {isPast && (
                  <span style={{fontSize:11,color:'var(--text3)'}}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Schedules</h1>
        <p className="page-subtitle">{schedules.length} total bookings</p>
      </div>

      {error   && <div className="alert alert-error"   style={{marginBottom:16}}>⚠ {error}</div>}
      {success && <div className="alert alert-success" style={{marginBottom:16}}>✓ {success}</div>}

      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {['all','confirmed','cancelled','pending'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={'btn btn-sm '+(filter===f?'btn-primary':'btn-ghost')}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{display:'flex',justifyContent:'center',padding:40}}>
          <div style={{width:28,height:28,border:'3px solid #1f2d45',borderTopColor:'#3b82f6',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
        </div>
      ) : (
        <>
          {/* ── Upcoming Bookings ────────────────────────────── */}
          <div className="card" style={{marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h3 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:600}}>📅 Upcoming Bookings</h3>
              <span style={{fontSize:12,color:'var(--text3)'}}>{upcoming.length} booking{upcoming.length!==1?'s':''}</span>
            </div>
            {upcoming.length === 0 ? (
              <div style={{textAlign:'center',padding:32,color:'var(--text3)',fontSize:13}}>
                No upcoming bookings available
              </div>
            ) : (
              renderTable(upcoming, false)
            )}
          </div>

          {/* ── Past Bookings ────────────────────────────────── */}
          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h3 style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:600}}>🕐 Past Bookings</h3>
              <span style={{fontSize:12,color:'var(--text3)'}}>{past.length} booking{past.length!==1?'s':''}</span>
            </div>
            {past.length === 0 ? (
              <div style={{textAlign:'center',padding:32,color:'var(--text3)',fontSize:13}}>
                No past bookings
              </div>
            ) : (
              renderTable(past, true)
            )}
          </div>
        </>
      )}
    </div>
  )
}