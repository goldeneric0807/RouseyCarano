import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

export default function RequestAccess() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [referredBy, setReferredBy] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await (supabase.from('access_requests') as any).insert({
      full_name: `${firstName} ${lastName}`.trim(),
      email,
      referred_by: referredBy || undefined,
    })
    setLoading(false)
    if (error) {
      if (error.code === '23505') {
        toast('That email has already submitted a request.')
      } else {
        toast('Something went wrong. Please try again.')
      }
    } else {
      toast('Request submitted! The admin will review and contact you.')
      setTimeout(() => navigate('/login'), 1800)
    }
  }

  const boxStyle: React.CSSProperties = {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 420,
    background: 'var(--dark-gray)', border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 4, padding: '2.5rem',
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--near-black)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '6rem 2rem 3rem', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,16,46,0.1) 0%, transparent 70%)',
      }} />
      <div style={boxStyle}>
        <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.8rem', letterSpacing:'0.08em', color:'var(--gold)', textAlign:'center', marginBottom:'0.25rem' }}>
          Rousey vs Carano
        </div>
        <div style={{ fontFamily:"'Barlow Condensed'", fontSize:'0.75rem', fontWeight:400, letterSpacing:'0.15em', textTransform:'uppercase', color:'rgba(245,240,232,0.35)', textAlign:'center', marginBottom:'2rem' }}>
          Rousey vs Carano · May 16, 2026
        </div>

        <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.6rem', letterSpacing:'0.06em', marginBottom:'0.25rem' }}>Request Access</div>
        <div style={{ fontSize:'0.8rem', fontWeight:300, color:'rgba(245,240,232,0.45)', marginBottom:'1.75rem', lineHeight:1.5 }}>
          Submit your info. The admin reviews all requests and will send you an invite link if approved. Your wager amount is set by the admin.
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <div className="field" style={{ flex:1 }}>
              <label>First name</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jordan" required />
            </div>
            <div className="field" style={{ flex:1 }}>
              <label>Last name</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" required />
            </div>
          </div>
          <div className="field">
            <label>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label>Who referred you?</label>
            <input type="text" value={referredBy} onChange={e => setReferredBy(e.target.value)} placeholder="Name of the person who told you about this" />
          </div>
          <button type="submit" className="btn-primary" style={{ width:'100%', padding:'0.85rem', marginTop:'0.5rem' }} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Request →'}
          </button>
        </form>

        <hr style={{ border:'none', borderTop:'1px solid rgba(245,240,232,0.08)', margin:'1.5rem 0' }} />
        <div style={{ textAlign:'center', fontSize:'0.8rem', color:'rgba(245,240,232,0.4)' }}>
          Already have access?{' '}
          <span style={{ color:'var(--gold)', cursor:'pointer' }} onClick={() => navigate('/login')}>Sign in</span>
        </div>
      </div>
    </div>
  )
}
