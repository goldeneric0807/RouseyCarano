import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    })
    setLoading(false)
    if (error) {
      if (error.message?.toLowerCase().includes('signups not allowed') || error.message?.toLowerCase().includes('user not found')) {
        toast("This email isn't in our system. Request access from the admin or check your invite email.")
      } else {
        toast('Something went wrong sending the link. Please try again.')
      }
    } else {
      setSent(true)
    }
  }

  const box: React.CSSProperties = {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 420,
    background: 'var(--dark-gray)', border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 4, padding: '2.5rem',
  }
  const wordmark: React.CSSProperties = { fontFamily:"'Bebas Neue'", fontSize:'1.8rem', letterSpacing:'0.08em', color:'var(--gold)', textAlign:'center', marginBottom:'0.25rem' }
  const tagline: React.CSSProperties = { fontFamily:"'Barlow Condensed'", fontSize:'0.75rem', letterSpacing:'0.15em', textTransform:'uppercase', color:'rgba(245,240,232,0.35)', textAlign:'center', marginBottom:'2rem' }
  const hr: React.CSSProperties = { border:'none', borderTop:'1px solid rgba(245,240,232,0.08)', margin:'1.5rem 0' }
  const muted: React.CSSProperties = { textAlign:'center', fontSize:'0.8rem', color:'rgba(245,240,232,0.4)', marginTop:'0.75rem' }
  const link: React.CSSProperties = { color:'var(--gold)', cursor:'pointer' }

  if (sent) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--near-black)', display:'flex', alignItems:'center', justifyContent:'center', padding:'6rem 2rem 3rem', position:'relative' }}>
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,16,46,0.1) 0%, transparent 70%)' }} />
        <div style={box}>
          <div style={wordmark}>Rousey vs Carano</div>
          <div style={tagline}>Rousey vs Carano · May 16, 2026</div>
          <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
            <div style={{ fontSize:'3rem', marginBottom:'0.75rem' }}>✉️</div>
            <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.6rem', letterSpacing:'0.06em', color:'var(--gold)', marginBottom:'0.5rem' }}>
              Check your inbox
            </div>
            <div style={{ fontSize:'0.85rem', fontWeight:300, color:'rgba(245,240,232,0.55)', lineHeight:1.7, marginBottom:'1rem' }}>
              We sent a magic link to
            </div>
            <div style={{ fontFamily:"'Barlow Condensed'", fontSize:'1rem', fontWeight:600, letterSpacing:'0.05em', color:'var(--off-white)', background:'rgba(245,240,232,0.06)', border:'1px solid rgba(245,240,232,0.12)', borderRadius:2, padding:'0.6rem 1rem', marginBottom:'1rem' }}>
              {email}
            </div>
            <div style={{ fontSize:'0.82rem', fontWeight:300, color:'rgba(245,240,232,0.45)', lineHeight:1.7 }}>
              Click the link in the email and you'll be signed in instantly. No password needed — ever.
            </div>
          </div>
          <div style={{ background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.15)', borderRadius:4, padding:'0.875rem 1rem', marginBottom:'1.5rem' }}>
            <div style={{ fontFamily:"'Barlow Condensed'", fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase' as const, color:'var(--gold)', marginBottom:'0.35rem' }}>Didn't get it?</div>
            <div style={{ fontSize:'0.78rem', color:'rgba(245,240,232,0.45)', lineHeight:1.6 }}>
              Check your spam folder. The link expires in 1 hour. If it's still not there,{' '}
              <span style={link} onClick={() => setSent(false)}>try again with your email</span>.
            </div>
          </div>
          <hr style={hr} />
          <div style={muted}>
            Wrong email?{' '}
            <span style={link} onClick={() => { setSent(false); setEmail('') }}>Start over</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--near-black)', display:'flex', alignItems:'center', justifyContent:'center', padding:'6rem 2rem 3rem', position:'relative' }}>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,16,46,0.1) 0%, transparent 70%)' }} />
      <div style={box}>
        <div style={wordmark}>Rousey vs Carano</div>
        <div style={tagline}>Rousey vs Carano · May 16, 2026</div>

        <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.6rem', letterSpacing:'0.06em', marginBottom:'0.25rem' }}>Sign In</div>
        <div style={{ fontSize:'0.82rem', fontWeight:300, color:'rgba(245,240,232,0.45)', marginBottom:'1.75rem', lineHeight:1.6 }}>
          Enter your email and we'll send you a magic link. One click and you're in — no password ever needed.
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width:'100%', padding:'0.85rem', marginTop:'0.5rem' }} disabled={loading}>
            {loading ? 'Sending link...' : 'Send Magic Link →'}
          </button>
        </form>

        <hr style={hr} />
        <div style={{ textAlign:'center', fontSize:'0.8rem', color:'rgba(245,240,232,0.4)' }}>
          Not in the pool?{' '}
          <span style={link} onClick={() => navigate('/request')}>Request access</span>
        </div>
        <div style={muted}>
          <span style={{ cursor:'pointer' }} onClick={() => navigate('/')}>← Back to fight info</span>
        </div>
      </div>
    </div>
  )
}
