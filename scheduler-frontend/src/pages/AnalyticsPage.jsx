import { useState, useEffect } from 'react'
import { scheduleAPI, resourceAPI, unwrap } from '../services/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import '../components/ui/index.css'
import './Analytics.css'

const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const HOURS  = ['8am','9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm']
const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444']

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px'}}>
      <div style={{fontSize:12,color:'var(--text2)',marginBottom:4}}>{label}</div>
      <div style={{fontSize:14,fontWeight:600,color:'var(--accent2)'}}>{payload[0].value}</div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [resources, setResources] = useState([])
  const [schedules, setSchedules] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [selectedR, setSelectedR] = useState('')
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      resourceAPI.getAll().catch(() => ({data:{}})),
      scheduleAPI.getAll().catch(() => ({data:{}})),
    ]).then(([r, s]) => {
      const resList = unwrap(r, 'resources')
      const schList = unwrap(s, 'schedules')
      setResources(resList)
      setSchedules(schList)
      if (resList.length > 0) setSelectedR(resList[0].id)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedR) return
    scheduleAPI.analytics(selectedR)
      .then(res => {
        // Response shape: { resource: {...}, analytics: {...} }
        const raw = res.data
        setAnalytics(raw?.analytics || raw?.data || raw)
      })
      .catch(() => setAnalytics(null))
  }, [selectedR])

  const confirmed = schedules.filter(s => s.status === 'confirmed').length
  const cancelled = schedules.filter(s => s.status === 'cancelled').length
  const total     = schedules.length
  const utilRate  = total > 0 ? Math.round((confirmed/total)*100) : 0

  const byResource = resources.map(r => ({
    name:  r.name.split(' ').slice(0,2).join(' '),
    value: schedules.filter(s=>(s.resourceId||s.resource_id)===r.id).length
  })).filter(r => r.value > 0)

  const byDay = DAYS.map((day,i) => ({
    day,
    bookings: schedules.filter(s => {
      try { return new Date(s.startTime||s.start_time).getDay() === (i+1)%7 }
      catch { return false }
    }).length
  }))

  // ── Parse hourly demand from backend analytics ──────────────
  // Backend returns: hourlyDemandMap as array of { hour: "8:00", bookingCount: 3 }
  // We need to transform it for the bar chart
  const hourlyData = (() => {
    if (!analytics?.hourlyDemandMap) return []

    // Handle array format from backend
    if (Array.isArray(analytics.hourlyDemandMap)) {
      return analytics.hourlyDemandMap
        .map(item => {
          const hourNum = parseInt(item.hour)
          if (isNaN(hourNum) || hourNum < 8 || hourNum > 20) return null
          return {
            hour:   HOURS[hourNum - 8] || `${hourNum}:00`,
            demand: item.bookingCount || 0
          }
        })
        .filter(item => item !== null)
    }

    // Handle object format { "8": 5, "9": 3, ... }
    return Object.entries(analytics.hourlyDemandMap).map(([h, v]) => ({
      hour:   HOURS[parseInt(h) - 8] || h + ':00',
      demand: typeof v === 'object' ? (v.bookingCount || 0) : v
    }))
  })()

  // ── Parse peak info ─────────────────────────────────────────
  // Backend returns peakHour as "14:00" string format
  const peakHourLabel = (() => {
    if (!analytics?.peakHour) return null
    const hourNum = parseInt(analytics.peakHour)
    if (isNaN(hourNum)) return analytics.peakHour
    if (hourNum >= 8 && hourNum <= 20) return HOURS[hourNum - 8]
    return `${hourNum}:00`
  })()

  const busiestDay = (() => {
    if (!analytics?.dailyDemandMap) return null
    if (Array.isArray(analytics.dailyDemandMap)) {
      const sorted = [...analytics.dailyDemandMap].sort((a, b) => b.bookingCount - a.bookingCount)
      return sorted[0]?.day || null
    }
    return null
  })()

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{width:32,height:32,border:'3px solid #1f2d45',borderTopColor:'#3b82f6',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
        <p className="page-subtitle">Resource utilization, peak hours & booking trends</p>
      </div>

      <div className="grid-4" style={{marginBottom:24}}>
        <div className="stat-card blue">
          <span className="stat-icon">◷</span>
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total Bookings</div>
        </div>
        <div className="stat-card green">
          <span className="stat-icon">✓</span>
          <div className="stat-value">{confirmed}</div>
          <div className="stat-label">Confirmed</div>
        </div>
        <div className="stat-card red">
          <span className="stat-icon">✕</span>
          <div className="stat-value">{cancelled}</div>
          <div className="stat-label">Cancelled</div>
        </div>
        <div className="stat-card purple">
          <span className="stat-icon">%</span>
          <div className="stat-value">{utilRate}%</div>
          <div className="stat-label">Utilization Rate</div>
        </div>
      </div>

      <div className="grid-2" style={{marginBottom:20}}>
        <div className="card">
          <h3 className="chart-title">Bookings by Day of Week</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byDay} margin={{top:0,right:0,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="day" tick={{fill:'var(--text3)',fontSize:12}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'var(--text3)',fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>}/>
              <Bar dataKey="bookings" fill="var(--accent)" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="chart-title">Bookings by Resource</h3>
          {byResource.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:'var(--text3)',fontSize:13}}>
              No booking data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byResource} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={3}>
                  {byResource.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie>
                <Tooltip content={<Tip/>}/>
                <Legend iconType="circle" iconSize={8}
                  formatter={v=><span style={{fontSize:11,color:'var(--text2)'}}>{v}</span>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <h3 className="chart-title" style={{margin:0}}>Hourly Demand Heatmap</h3>
          <select className="form-input" style={{width:'auto'}}
            value={selectedR} onChange={e=>setSelectedR(e.target.value)}>
            {resources.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {hourlyData.length === 0 ? (
          <div style={{textAlign:'center',padding:'32px 0',color:'var(--text3)',fontSize:13}}>
            No hourly data for this resource yet — make some bookings first!
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyData} margin={{top:0,right:0,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="hour" tick={{fill:'var(--text3)',fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'var(--text3)',fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>}/>
              <Bar dataKey="demand" fill="var(--purple)" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        )}

        {(peakHourLabel || busiestDay) && (
          <div className="alert alert-info" style={{marginTop:16}}>
            ⟁
            {peakHourLabel && (
              <span> Peak hour: <strong>{peakHourLabel}</strong></span>
            )}
            {busiestDay && (
              <span style={{marginLeft:12}}> · Busiest day: <strong>{busiestDay}</strong></span>
            )}
            {analytics?.totalBookingsAnalysed != null && (
              <span style={{marginLeft:12}}> · Based on <strong>{analytics.totalBookingsAnalysed}</strong> bookings (last {analytics.lookBackDays} days)</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}