import { useState, useEffect } from 'react'
import { resourceAPI } from '../services/api'
import '../components/ui/index.css'

const EMPTY = { name:'', description:'', capacity:1, location:'', isActive:true }

export default function ResourcesPage() {
  const [resources, setResources] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState(EMPTY)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [saving,    setSaving]    = useState(false)

  const load = () => {
    setLoading(true)
    resourceAPI.getAll()
      .then(res => setResources(res.data?.resources || res.data || []))
      .catch(() => setError('Failed to load resources'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true); setError('') }
  const openEdit   = (r) => {
    setEditing(r)
    setForm({ name: r.name, description: r.description||'', capacity: r.capacity, location: r.location||'', isActive: r.isActive ?? r.is_active ?? true })
    setModal(true)
    setError('')
  }

  const handle = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm({ ...form, [e.target.name]: val })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (form.capacity < 1) { setError('Capacity must be at least 1'); return }
    setSaving(true)
    try {
      if (editing) await resourceAPI.update(editing.id, form)
      else         await resourceAPI.create(form)
      setModal(false)
      setSuccess(editing ? 'Resource updated' : 'Resource created')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this resource? All associated bookings will also be removed.')) return
    try {
      await resourceAPI.delete(id)
      setSuccess('Resource deleted')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed')
      setTimeout(() => setError(''), 3000)
    }
  }

  return (
    <div className="fade-up">
      <div className="page-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 className="page-title">Resources</h1>
          <p className="page-subtitle">Manage bookable resources — Admin only</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Resource</button>
      </div>

      {error   && <div className="alert alert-error"   style={{marginBottom:16}}>⚠ {error}</div>}
      {success && <div className="alert alert-success" style={{marginBottom:16}}>✓ {success}</div>}

      <div className="card">
        {loading ? (
          <div style={{display:'flex',justifyContent:'center',padding:40}}><span className="spinner"/></div>
        ) : resources.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>No resources yet. Create one!</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Location</th><th>Capacity</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {resources.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{fontWeight:500}}>{r.name}</div>
                      <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{r.description}</div>
                    </td>
                    <td style={{color:'var(--text2)'}}>{r.location || '—'}</td>
                    <td style={{color:'var(--text2)'}}>{r.capacity}</td>
                    <td>
                      <span className={`badge ${(r.isActive||r.is_active) ? 'badge-confirmed' : 'badge-cancelled'}`}>
                        {(r.isActive||r.is_active) ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Edit Resource' : 'New Resource'}</h3>
              <button className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>
            {error && <div className="alert alert-error" style={{marginBottom:16}}>⚠ {error}</div>}
            <form onSubmit={submit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" name="name" value={form.name} onChange={handle} placeholder="Conference Room A" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" name="description" value={form.description} onChange={handle} rows={2} placeholder="Optional description" style={{resize:'vertical'}} />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Capacity *</label>
                    <input className="form-input" type="number" name="capacity" min={1} value={form.capacity} onChange={handle} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input className="form-input" name="location" value={form.location} onChange={handle} placeholder="Floor 3" />
                  </div>
                </div>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer'}}>
                  <input type="checkbox" name="isActive" checked={form.isActive} onChange={handle} />
                  Active (users can book this resource)
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
