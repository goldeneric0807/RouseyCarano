import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import type { ReactNode } from 'react'

interface ToastContextType {
  toast: (msg: string) => void
}
const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const [visible, setVisible] = useState(false)

  const toast = useCallback((message: string) => {
    setMsg(message)
    setVisible(true)
  }, [])

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setVisible(false), 2800)
    return () => clearTimeout(t)
  }, [visible, msg])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999,
        background: 'var(--dark-gray)',
        border: '1px solid rgba(201,168,76,0.4)',
        borderRadius: '2px',
        padding: '0.9rem 1.5rem',
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.06em',
        color: 'var(--off-white)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'all 0.3s',
        pointerEvents: 'none',
      }}>
        {msg}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
