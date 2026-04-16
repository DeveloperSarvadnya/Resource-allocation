import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Auth.css'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form,    setForm]    = useState({ name:'', email:'', password:'', timezone:'Asia/Kolkata' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name || !form.email || !form.password) { setError('Please fill in all fields'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await register(form)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand fade-in">
          <span className="auth-brand-icon">◈</span>
          <span className="auth-brand-name">ResourceFlow</span>
        </div>
        <div className="auth-hero fade-up stagger-1">
          <h1>Start scheduling smarter today</h1>
          <p>Join your team on ResourceFlow and take control of shared resources.</p>
        </div>
        <div className="auth-features fade-up stagger-2">
          {['Free to get started','No setup required','Works with your existing calendar'].map(f => (
            <div className="auth-feature" key={f}><span className="auth-feature-dot" />{f}</div>
          ))}
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap fade-up">
          <h2 className="auth-title">Create account</h2>
          <p className="auth-sub">Get started in seconds</p>

          {error && <div className="alert alert-error" style={{marginBottom:16}}>⚠ {error}</div>}

          <form onSubmit={submit} className="auth-form">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" type="text" name="name" placeholder="Arjun Sharma" value={form.name} onChange={handle} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" name="email" placeholder="you@example.com" value={form.email} onChange={handle} />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" name="password" placeholder="Min. 8 characters" value={form.password} onChange={handle} />
            </div>
            <div className="form-group">
              <label className="form-label">Timezone</label>
              <select className="form-input" name="timezone" value={form.timezone} onChange={handle}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              </select>
            </div>
            <button className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account →'}
            </button>
          </form>

          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  )
}
