import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import './Auth.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const [form,    setForm]    = useState({ email: '', password: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  // ── Forgot Password state ──────────────────────────────────
  const [showForgot,  setShowForgot]  = useState(false)
  const [forgotForm,  setForgotForm]  = useState({ email: '', secretCode: '', newPassword: '' })
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) { setError('Please fill in all fields'); return }
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/dashboard')
    } catch (err) {
      // Feature 3: Generic error — do NOT expose which field is wrong
      const serverMsg = err.response?.data?.error
      setError(serverMsg || 'Wrong email/password')
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot Password handlers ───────────────────────────────
  const handleForgot = (e) => setForgotForm({ ...forgotForm, [e.target.name]: e.target.value })

  const openForgot = (e) => {
    e.preventDefault()
    setShowForgot(true)
    setForgotError('')
    setForgotSuccess('')
    setForgotForm({ email: '', secretCode: '', newPassword: '' })
  }

  const closeForgot = () => {
    setShowForgot(false)
    setForgotError('')
    setForgotSuccess('')
  }

  const submitForgot = async (e) => {
    e.preventDefault()
    setForgotError('')
    setForgotSuccess('')

    if (!forgotForm.email || !forgotForm.secretCode || !forgotForm.newPassword) {
      setForgotError('Please fill in all fields')
      return
    }
    if (forgotForm.newPassword.length < 8) {
      setForgotError('New password must be at least 8 characters')
      return
    }

    setForgotLoading(true)
    try {
      const res = await authAPI.forgotPassword(forgotForm)
      setForgotSuccess(res.data.message || 'Password reset successfully!')
      // Clear form after success
      setForgotForm({ email: '', secretCode: '', newPassword: '' })
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.details?.[0]?.msg || 'Password reset failed.'
      setForgotError(msg)
    } finally {
      setForgotLoading(false)
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
          <h1>Smart scheduling<br />for modern teams</h1>
          <p>Book resources, detect conflicts, predict demand — all in one place.</p>
        </div>
        <div className="auth-features fade-up stagger-2">
          {['AI-powered conflict detection','Real-time availability','Predictive analytics'].map(f => (
            <div className="auth-feature" key={f}>
              <span className="auth-feature-dot" />
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap fade-up">
          <h2 className="auth-title">Welcome back</h2>
          <p className="auth-sub">Sign in to your account</p>

          {error && (
            <div className="alert alert-error" style={{marginBottom: 16}}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handle}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                name="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handle}
              />
            </div>
            <button className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <div className="auth-links">
            <a href="#" className="auth-forgot-link" onClick={openForgot}>Forgot Password?</a>
          </div>

          <p className="auth-switch">
            Don't have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </div>

      {/* ── Forgot Password Modal ──────────────────────────────── */}
      {showForgot && (
        <div className="modal-overlay" onClick={closeForgot}>
          <div className="modal forgot-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reset Password</h3>
              <button className="modal-close" onClick={closeForgot}>✕</button>
            </div>

            {forgotError && (
              <div className="alert alert-error" style={{marginBottom: 16}}>
                ⚠ {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div className="alert alert-success" style={{marginBottom: 16}}>
                ✓ {forgotSuccess}
              </div>
            )}

            {!forgotSuccess ? (
              <form onSubmit={submitForgot} className="modal-body">
                <div className="form-group">
                  <label className="form-label">Registered Email</label>
                  <input
                    className="form-input"
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    value={forgotForm.email}
                    onChange={handleForgot}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Secret Code</label>
                  <input
                    className="form-input"
                    type="text"
                    name="secretCode"
                    placeholder="Enter your secret code"
                    value={forgotForm.secretCode}
                    onChange={handleForgot}
                  />
                  <span className="form-hint">Contact your administrator for the secret code</span>
                </div>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    className="form-input"
                    type="password"
                    name="newPassword"
                    placeholder="Min. 8 characters"
                    value={forgotForm.newPassword}
                    onChange={handleForgot}
                  />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={closeForgot}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={forgotLoading}>
                    {forgotLoading ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={closeForgot}>
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
