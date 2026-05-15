import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase puts the token in the URL hash — listen for the session
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
      if (event === 'SIGNED_IN') setReady(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast('Passwords do not match.'); return }
    if (password.length < 8) { toast('Password must be at least 8 characters.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      toast('Something went wrong. Try requesting a new reset link.')
    } else {
      toast('Password set! Redirecting to your dashboard...')
      setTimeout(() => navigate('/dashboard'), 1500)
    }
  }

  const box: React.CSSProperties = {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 420,
    background: 'var(--dark-gray)', border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 4, padding: '2.5rem',
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--near-black)', display:'flex', alignItems:'center', justifyContent:'center', padding:'6rem 2rem 3rem', position:'relative' }}>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,16,46,0.1) 0%, transparent 70%)' }} />
      <div style={box}>
        <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.8rem', letterSpacing:'0.08em', color:'var(--gold)', textAlign:'center', marginBottom:'0.25rem' }}>Rousey vs Carano</div>
        <div style={{ fontFamily:"'Barlow Condensed'", fontSize:'0.75rem', letterSpacing:'0.15em', textTransform:'uppercase', color:'rgba(245,240,232,0.35)', textAlign:'center', marginBottom:'2rem' }}>Rousey vs Carano · May 16, 2026</div>
        <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.6rem', letterSpacing:'0.06em', marginBottom:'0.25rem' }}>Set Your Password</div>
        <div style={{ fontSize:'0.8rem', fontWeight:300, color:'rgba(245,240,232,0.45)', marginBottom:'1.75rem', lineHeight:1.5 }}>
          Choose a password for future logins. Must be at least 8 characters.
        </div>
        {!ready ? (
          <div style={{ fontFamily:"'Barlow Condensed'", fontSize:'0.85rem', letterSpacing:'0.1em', color:'rgba(245,240,232,0.4)', textAlign:'center', padding:'1rem' }}>
            Verifying your reset link...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>New password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat your password" required minLength={8} />
            </div>
            <button type="submit" className="btn-primary" style={{ width:'100%', padding:'0.85rem', marginTop:'0.5rem' }} disabled={loading}>
              {loading ? 'Saving...' : 'Set Password & Sign In →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
