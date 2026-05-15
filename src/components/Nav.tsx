import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Nav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAdmin, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    setMenuOpen(false)
    window.location.href = '/'
  }

  function go(path: string) {
    navigate(path)
    setMenuOpen(false)
  }

  const isActive = (path: string) => location.pathname === path

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.9rem 1.5rem',
        background: 'linear-gradient(to bottom, rgba(10,10,10,0.97), rgba(10,10,10,0.85))',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(201,168,76,0.08)',
        minHeight: 56,
      }}>
        {/* Wordmark */}
        <div
          onClick={() => go('/')}
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(1.05rem, 3.5vw, 1.35rem)',
            letterSpacing: '0.08em',
            color: 'var(--gold)',
            cursor: 'pointer',
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          Rousey vs Carano
        </div>

        {/* Desktop links */}
        <div className="nav-desktop-links">
          <NavLink active={isActive('/')} onClick={() => go('/')}>Fight Info</NavLink>

          {user && (
            <NavLink active={isActive('/dashboard')} onClick={() => go('/dashboard')}>My Wager</NavLink>
          )}

          {/* Admin Panel — visible to admins on ALL screen sizes */}
          {isAdmin && (
            <NavLink active={isActive('/admin')} onClick={() => go('/admin')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{
                  fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.15em',
                  background: 'var(--red)', color: '#fff',
                  padding: '0.1rem 0.35rem', borderRadius: 2,
                }}>ADMIN</span>
                Panel
              </span>
            </NavLink>
          )}

          {user ? (
            <NavCta onClick={handleSignOut}>Sign Out</NavCta>
          ) : (
            <NavCta onClick={() => go('/login')}>Sign In</NavCta>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="nav-hamburger-btn"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            {menuOpen ? (
              <>
                <line x1="3" y1="3" x2="19" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="19" y1="3" x2="3" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              </>
            ) : (
              <>
                <line x1="2" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="2" y1="11" x2="20" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="2" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </>
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile drawer */}
      <div
        className="nav-mobile-drawer"
        style={{ maxHeight: menuOpen ? 400 : 0 }}
      >
        <div style={{ padding: '1rem 1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <MobileLink active={isActive('/')} onClick={() => go('/')}>Fight Info</MobileLink>

          {user && (
            <MobileLink active={isActive('/dashboard')} onClick={() => go('/dashboard')}>My Wager</MobileLink>
          )}

          {/* Admin Panel visible in mobile drawer too */}
          {isAdmin && (
            <MobileLink active={isActive('/admin')} onClick={() => go('/admin')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em',
                  background: 'var(--red)', color: '#fff',
                  padding: '0.15rem 0.4rem', borderRadius: 2,
                }}>ADMIN</span>
                Panel
              </span>
            </MobileLink>
          )}

          {user ? (
            <button className="mobile-cta-btn" onClick={handleSignOut}>Sign Out</button>
          ) : (
            <button className="mobile-cta-btn" onClick={() => go('/login')}>Sign In</button>
          )}
        </div>
      </div>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,0.5)' }}
        />
      )}
    </>
  )
}

function NavLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`nav-link${active ? ' nav-link-active' : ''}`}>
      {children}
    </button>
  )
}

function NavCta({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="nav-cta">{children}</button>
  )
}

function MobileLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`mobile-nav-link${active ? ' mobile-nav-link-active' : ''}`}>
      {children}
    </button>
  )
}
