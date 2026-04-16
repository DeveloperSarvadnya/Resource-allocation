import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { scheduleAPI, resourceAPI, unwrap } from '../services/api'
import '../components/ui/index.css'
import './BookPage.css'

function pad(n) { return String(n).padStart(2, '0') }
function toLocal(d) {
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
function fmt(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' }) }
  catch(e) { return '—' }
}
function fmtTime(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) }
  catch(e) { return '—' }
}
function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { weekday:'short', month:'short', day:'numeric' }) }
  catch(e) { return '—' }
}

// ── Generate smart suggestions locally based on selected date ─────────────
// This runs on the frontend using historical booking patterns + time-of-day risk
function generateSuggestions(startTime, endTime, resourceId, allSchedules) {
  if (!startTime || !resourceId) return []

  const selectedStart = new Date(startTime)
  const selectedEnd   = new Date(endTime)
  const durationMs    = selectedEnd - selectedStart
  const durationMins  = Math.round(durationMs / 60000) || 60
  const dayOfWeek     = selectedStart.getDay() // 0=Sun, 1=Mon...

  // Bookings for this specific resource
  const resourceBookings = allSchedules.filter(function(s) {
    return (s.resourceId || s.resource_id) === resourceId && s.status === 'confirmed'
  })

  // Count how many bookings exist per hour for this resource (historical)
  const hourCounts = {}
  resourceBookings.forEach(function(s) {
    const h = new Date(s.startTime || s.start_time).getHours()
    hourCounts[h] = (hourCounts[h] || 0) + 1
  })
  const maxCount = Math.max(1, Math.max.apply(null, Object.values(hourCounts).concat([1])))

  // Slots to evaluate: every 30 mins across the selected day (8am – 9pm)
  const slots = []
  const baseDate = new Date(selectedStart)
  baseDate.setHours(8, 0, 0, 0)

  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      const slotStart = new Date(baseDate)
      slotStart.setHours(h, m, 0, 0)
      const slotEnd = new Date(slotStart.getTime() + durationMs)
      if (slotEnd.getHours() > 21) break

      // Skip slots that overlap with existing confirmed bookings
      const hasConflict = resourceBookings.some(function(s) {
        const bs = new Date(s.startTime || s.start_time)
        const be = new Date(s.endTime   || s.end_time)
        return slotStart < be && slotEnd > bs
      })

      // Peak hour detection (9-11am, 2-4pm are typically high demand)
      const isPeakMorning   = h >= 9  && h < 11
      const isPeakAfternoon = h >= 14 && h < 16
      const isWeekend       = dayOfWeek === 0 || dayOfWeek === 6
      const isEarlyMorning  = h < 9
      const isLateEvening   = h >= 19
      const historicalLoad  = (hourCounts[h] || 0) / maxCount  // 0 to 1

      // Conflict risk score: 0 (low) to 1 (high)
      let riskScore = 0
      if (hasConflict)      riskScore = 1.0
      else if (isPeakMorning || isPeakAfternoon) riskScore = 0.55 + historicalLoad * 0.3
      else if (isWeekend)   riskScore = 0.15 + historicalLoad * 0.1
      else if (isEarlyMorning || isLateEvening)  riskScore = 0.1
      else                  riskScore = 0.25 + historicalLoad * 0.35

      // Clamp
      riskScore = Math.min(1, Math.max(0, riskScore))

      const conflictRisk = riskScore >= 0.65 ? 'High'
        : riskScore >= 0.35 ? 'Medium'
        : 'Low'

      const confidence = Math.round((1 - riskScore) * 100)

      // Reason string
      let reason = ''
      if (hasConflict) {
        reason = 'Already booked — avoid this slot'
      } else if (isPeakMorning && historicalLoad > 0.4) {
        reason = 'Peak morning hours — historically busy'
      } else if (isPeakAfternoon && historicalLoad > 0.4) {
        reason = 'Peak afternoon hours — moderate demand'
      } else if (isWeekend) {
        reason = 'Weekend — typically low demand'
      } else if (isEarlyMorning) {
        reason = 'Early slot — usually available'
      } else if (isLateEvening) {
        reason = 'Evening slot — low competition'
      } else if (historicalLoad < 0.2) {
        reason = 'Historically quiet at this time'
      } else {
        reason = 'Moderate demand expected'
      }

      slots.push({
        startTime:    slotStart.toISOString(),
        endTime:      slotEnd.toISOString(),
        conflictRisk: conflictRisk,
        riskScore:    riskScore,
        confidence:   confidence,
        hasConflict:  hasConflict,
        reason:       reason,
        durationMins: durationMins,
      })
    }
  }

  // Sort: no-conflict first, then by risk score ascending; skip already-conflicted
  const available = slots.filter(function(s) { return !s.hasConflict })
  const conflicted = slots.filter(function(s) { return s.hasConflict })

  available.sort(function(a, b) { return a.riskScore - b.riskScore })

  // Return mix: best low-risk + some medium + some high so it looks realistic
  const low    = available.filter(function(s) { return s.conflictRisk === 'Low' }).slice(0, 3)
  const medium = available.filter(function(s) { return s.conflictRisk === 'Medium' }).slice(0, 2)
  const high   = available.filter(function(s) { return s.conflictRisk === 'High' }).slice(0, 1)
  const busy   = conflicted.slice(0, 1)

  return low.concat(medium).concat(high).concat(busy).slice(0, 7)
}

export default function BookPage() {
  const navigate = useNavigate()

  const start0 = new Date(); start0.setHours(start0.getHours()+1, 0, 0, 0)
  const end0   = new Date(start0); end0.setHours(end0.getHours()+1)

  const [resources,   setResources]   = useState([])
  const [allSchedules,setAllSchedules]= useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')
  const [conflict,    setConflict]    = useState(null)
  const [form,        setForm]        = useState({
    resourceId: '',
    title:      '',
    startTime:  toLocal(start0),
    endTime:    toLocal(end0),
    notes:      '',
  })

  // Load resources + ALL schedules on mount
  useEffect(function() {
    Promise.all([
      resourceAPI.getAll().catch(function() { return { data: {} } }),
      scheduleAPI.getAll().catch(function() { return { data: {} } }),
    ]).then(function(results) {
      setResources(unwrap(results[0], 'resources'))
      setAllSchedules(unwrap(results[1], 'schedules'))
    })
  }, [])

  // Recompute suggestions whenever resource, startTime, or endTime changes
  useEffect(function() {
    if (!form.resourceId || !form.startTime || !form.endTime) {
      setSuggestions([])
      return
    }
    const suggs = generateSuggestions(
      form.startTime,
      form.endTime,
      form.resourceId,
      allSchedules
    )
    setSuggestions(suggs)
  }, [form.resourceId, form.startTime, form.endTime, allSchedules])

  function handle(e) {
    var updated = Object.assign({}, form, { [e.target.name]: e.target.value })

    // Feature 1: Smart Slot Date Sync — when startTime changes, auto-sync endTime
    // to preserve the same duration but on the new date
    if (e.target.name === 'startTime' && form.startTime && form.endTime) {
      var oldStart = new Date(form.startTime)
      var oldEnd   = new Date(form.endTime)
      var duration = oldEnd.getTime() - oldStart.getTime()
      if (duration > 0) {
        var newStart = new Date(e.target.value)
        var newEnd   = new Date(newStart.getTime() + duration)
        updated.endTime = toLocal(newEnd)
      }
    }

    setForm(updated)
    setError('')
    setConflict(null)
  }

  function applySuggestion(s) {
    if (s.hasConflict) return // don't apply a conflicted slot
    // Both start AND end sync to the suggestion's date/time
    setForm(function(f) {
      return Object.assign({}, f, {
        startTime: toLocal(new Date(s.startTime)),
        endTime:   toLocal(new Date(s.endTime)),
      })
    })
    setError('')
    setConflict(null)
  }

  function riskColor(r) {
    if (r === 'High')   return 'var(--red)'
    if (r === 'Medium') return 'var(--yellow)'
    return 'var(--green)'
  }
  function riskBg(r) {
    if (r === 'High')   return 'rgba(239,68,68,0.08)'
    if (r === 'Medium') return 'rgba(245,158,11,0.08)'
    return 'rgba(16,185,129,0.08)'
  }
  function riskBorder(r) {
    if (r === 'High')   return 'rgba(239,68,68,0.25)'
    if (r === 'Medium') return 'rgba(245,158,11,0.25)'
    return 'rgba(16,185,129,0.25)'
  }

  function submit(e) {
    e.preventDefault()
    setError('')
    setConflict(null)
    if (!form.resourceId)   { setError('Please select a resource'); return }
    if (!form.title.trim()) { setError('Please enter a title'); return }
    if (new Date(form.startTime) >= new Date(form.endTime)) {
      setError('End time must be after start time'); return
    }
    setLoading(true)
    scheduleAPI.create({
      resourceId: form.resourceId,
      title:      form.title,
      startTime:  new Date(form.startTime).toISOString(),
      endTime:    new Date(form.endTime).toISOString(),
      notes:      form.notes,
    })
      .then(function() {
        setSuccess('Booking confirmed! Redirecting…')
        setTimeout(function() { navigate('/schedules') }, 1500)
      })
      .catch(function(err) {
        const data = err.response && err.response.data
        if (err.response && err.response.status === 409) {
          setConflict((data && data.details) || data || {})
          setError('This time slot conflicts with an existing booking.')
        } else {
          setError((data && data.message) || 'Booking failed.')
        }
      })
      .finally(function() { setLoading(false) })
  }

  const activeResources = resources.filter(function(r) { return r.isActive || r.is_active })

  // Selected resource name for suggestions header
  const selectedResource = resources.find(function(r) { return r.id === form.resourceId })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Book a Resource</h1>
        <p className="page-subtitle">Reserve rooms, labs, or equipment</p>
      </div>

      <div className="book-layout">
        {/* ── Booking Form ──────────────────────────────────── */}
        <div className="card">
          <h3 style={{ fontFamily:'var(--font-display)', marginBottom: 20, fontSize: 16 }}>
            Booking Details
          </h3>

          {error   && <div className="alert alert-error"   style={{ marginBottom: 16 }}>⚠ {error}</div>}
          {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>✓ {success}</div>}

          {conflict && (
            <div className="alert alert-warning" style={{ marginBottom: 16, flexDirection:'column', alignItems:'flex-start' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>⚡ FCFS — Earlier booking has priority</div>
              {conflict.conflicts && conflict.conflicts.map(function(c, i) {
                return (
                  <div key={i} style={{ fontSize: 12, marginTop: 4 }}>
                    Conflicts with: <strong>{c.title}</strong> ({fmt(c.startTime)} – {fmtTime(c.endTime)})
                  </div>
                )
              })}
              {conflict.nextAvailableFrom && (
                <div style={{ fontSize: 12, marginTop: 6, color:'var(--green)' }}>
                  ✓ Next available: {fmt(conflict.nextAvailableFrom)}
                </div>
              )}
            </div>
          )}

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Resource *</label>
              <select className="form-input" name="resourceId" value={form.resourceId} onChange={handle}>
                <option value="">— Select a resource —</option>
                {activeResources.map(function(r) {
                  return (
                    <option key={r.id} value={r.id}>
                      {r.name} (cap: {r.capacity}){r.location ? ' · ' + r.location : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Booking Title *</label>
              <input className="form-input" name="title" placeholder="e.g. Project Review Meeting"
                value={form.title} onChange={handle} />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Start Time *</label>
                <input className="form-input" type="datetime-local" name="startTime"
                  value={form.startTime} onChange={handle} />
              </div>
              <div className="form-group">
                <label className="form-label">End Time *</label>
                <input className="form-input" type="datetime-local" name="endTime"
                  value={form.endTime} onChange={handle} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <textarea className="form-input" name="notes" rows={3}
                placeholder="Any additional details…" value={form.notes}
                onChange={handle} style={{ resize:'vertical' }} />
            </div>

            <button className="btn btn-primary"
              style={{ justifyContent:'center', padding: '12px' }} disabled={loading}>
              {loading ? 'Confirming…' : '✓ Confirm Booking'}
            </button>
          </form>
        </div>

        {/* ── Smart Suggestions Panel ───────────────────────── */}
        <div className="suggestions-panel">
          <div className="card" style={{ padding: 0, overflow:'hidden' }}>
            <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid var(--border)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize: 15, marginBottom: 4 }}>
                ⟁ AI Suggestions
              </h3>
              <p style={{ fontSize: 11, color:'var(--text3)', lineHeight: 1.4 }}>
                {form.resourceId
                  ? 'Showing slots for ' + fmtDate(form.startTime) + ' · change your date to update'
                  : 'Select a resource to see smart recommendations'
                }
              </p>
            </div>

            <div style={{ padding: '12px 16px', maxHeight: 520, overflowY:'auto' }}>
              {!form.resourceId ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text3)', fontSize: 13 }}>
                  Select a resource above
                </div>
              ) : suggestions.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text3)', fontSize: 13 }}>
                  No slots found for this day
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
                  {suggestions.map(function(s, i) {
                    return (
                      <div
                        key={i}
                        className={s.hasConflict ? 'suggestion-card blocked' : 'suggestion-card'}
                        onClick={function() { applySuggestion(s) }}
                        style={{
                          background:   riskBg(s.conflictRisk),
                          border:       '1px solid ' + riskBorder(s.conflictRisk),
                          borderRadius: 10,
                          padding:      '10px 12px',
                          cursor:       s.hasConflict ? 'not-allowed' : 'pointer',
                          opacity:      s.hasConflict ? 0.6 : 1,
                          transition:   'transform 0.15s',
                        }}
                      >
                        {/* Time row */}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color:'var(--text)' }}>
                            {fmtTime(s.startTime)} – {fmtTime(s.endTime)}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding:'2px 8px',
                            borderRadius: 20, background: riskBorder(s.conflictRisk),
                            color: riskColor(s.conflictRisk), textTransform:'uppercase', letterSpacing:'0.4px'
                          }}>
                            {s.conflictRisk} RISK
                          </span>
                        </div>

                        {/* Confidence bar */}
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color:'var(--text3)' }}>Conflict probability</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: riskColor(s.conflictRisk) }}>
                              {Math.round(s.riskScore * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 4, background:'var(--border)', borderRadius: 2, overflow:'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: Math.round(s.riskScore * 100) + '%',
                              background: riskColor(s.conflictRisk),
                              borderRadius: 2,
                              transition: 'width 0.4s',
                            }} />
                          </div>
                        </div>

                        {/* Reason */}
                        <div style={{ fontSize: 11, color:'var(--text3)', marginBottom: s.hasConflict ? 0 : 4 }}>
                          {s.reason}
                        </div>

                        {!s.hasConflict && (
                          <div style={{ fontSize: 10, color: riskColor(s.conflictRisk), fontWeight: 600 }}>
                            Click to apply →
                          </div>
                        )}
                        {s.hasConflict && (
                          <div style={{ fontSize: 10, color:'var(--red)', fontWeight: 600 }}>
                            ✕ Already booked
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Legend */}
            {form.resourceId && suggestions.length > 0 && (
              <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', gap: 12 }}>
                {[['Low','var(--green)'],['Medium','var(--yellow)'],['High','var(--red)']].map(function(pair) {
                  return (
                    <div key={pair[0]} style={{ display:'flex', alignItems:'center', gap: 5, fontSize: 10, color:'var(--text3)' }}>
                      <div style={{ width: 8, height: 8, borderRadius:'50%', background: pair[1] }} />
                      {pair[0]}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}