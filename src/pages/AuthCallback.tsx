import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace('#', '?'))
    const urlError = params.get('error_description') || params.get('error')

    if (urlError) {
      setErrorMessage(urlError.replace(/\+/g, ' '))
      setError(true)
      return
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session) {
            subscription.unsubscribe()
            navigate('/dashboard', { replace: true })
          }
        })
        setTimeout(() => {
          setErrorMessage('This link has expired or is invalid.')
          setError(true)
        }, 5000)
      } else {
        navigate('/dashboard', { replace: true })
      }
    })
  }, [navigate])

  if (error) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', background:'var(--near-black)', gap:'1rem', padding:'2rem' }}>
        <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.8rem', letterSpacing:'0.1em', color:'var(--gold)' }}>Rousey vs Carano</div>
        <div style={{ fontFamily:"'Barlow Condensed'", fontSize:'1rem', letterSpacing:'0.1em', color:'var(--red)' }}>
          {errorMessage || 'This link has expired or is invalid.'}
        </div>
        <div style={{ fontSize:'0.82rem', color:'rgba(245,240,232,0.4)', textAlign:'center', maxWidth:320, lineHeight:1.6 }}>
          Magic links expire after 1 hour. Request a new one from the sign in page.
        </div>
        <button className="btn-primary" style={{ marginTop:'0.5rem' }} onClick={() => navigate('/login')}>
          Back to Sign In
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', background:'var(--near-black)', gap:'1.25rem' }}>
      <div style={{ fontFamily:"'Bebas Neue'", fontSize:'1.8rem', letterSpacing:'0.1em', color:'var(--gold)' }}>Rousey vs Carano</div>
      <div style={{ width:36, height:36, border:'2px solid rgba(201,168,76,0.25)', borderTop:'2px solid var(--gold)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily:"'Barlow Condensed'", fontSize:'0.85rem', letterSpacing:'0.2em', color:'rgba(245,240,232,0.4)', textTransform:'uppercase' as const }}>
        Signing you in...
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
