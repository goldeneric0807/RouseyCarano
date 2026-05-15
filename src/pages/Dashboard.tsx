import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import type { Wager, WagerPoolEntry, WagerReservation, EventInfo, WagerChangeRequest } from '../types/database'
import { ADMIN_EMAIL, MAX_WAGER_MEMBER, MAX_WAGER_ADMIN, MIN_WAGER } from '../types/database'

export default function Dashboard() {
  const { user, profile, isAdmin } = useAuth()
  const { toast } = useToast()

  const [wager, setWager] = useState<Wager | null>(null)
  const [reservation, setReservation] = useState<WagerReservation | null>(null)
  const [pool, setPool] = useState<WagerPoolEntry[]>([])
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit wager modal state (admin only)
  const [editOpen, setEditOpen] = useState(false)
  const [editPick, setEditPick] = useState<'rousey' | 'carano'>('rousey')
  const [editAmount, setEditAmount] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Change request state (members)
  const [changeRequests, setChangeRequests] = useState<WagerChangeRequest[]>([])
  const [reqOpen, setReqOpen] = useState(false)
  const [reqPick, setReqPick] = useState<'rousey' | 'carano'>('rousey')
  const [reqAmount, setReqAmount] = useState('')
  const [reqReason, setReqReason] = useState('')
  const [reqSaving, setReqSaving] = useState(false)

  const isAdminUser = isAdmin || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const maxWager = isAdminUser ? MAX_WAGER_ADMIN : MAX_WAGER_MEMBER

  useEffect(() => {
    if (!user) return

    async function load() {
      if (!user) return
      const [
        { data: wagerData },
        { data: reservationData },
        { data: poolData },
        { data: eventData },
        { data: changeReqData },
      ] = await Promise.all([
        supabase.from('wagers').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('wager_reservations').select('*').eq('email', user.email ?? '').maybeSingle(),
        supabase.from('wager_pool').select('*'),
        supabase.from('event_info').select('*').eq('id', 1).maybeSingle(),
        supabase.from('wager_change_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])
      setWager((wagerData as Wager | null) ?? null)
      setReservation((reservationData as WagerReservation | null) ?? null)
      setPool((poolData as WagerPoolEntry[]) || [])
      setEventInfo((eventData as EventInfo | null) ?? null)
      setChangeRequests((changeReqData as WagerChangeRequest[]) || [])
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wagers' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wager_reservations' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_info' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wager_change_requests' }, load)
      .subscribe()

    const interval = window.setInterval(load, 15000)

    return () => {
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [user])

  // Open edit modal pre-filled with current values
  function openEditModal() {
    const dw = wager || reservation
    if (dw) {
      setEditPick(dw.pick)
      setEditAmount(String(Number(dw.amount)))
    } else {
      setEditPick('rousey')
      setEditAmount(String(MIN_WAGER))
    }
    setEditOpen(true)
  }

  // Save updated wager (user self-edit — only works when betting is open)
  async function saveWagerEdit() {
    if (!user) return
    const amt = parseFloat(editAmount)

    // Frontend validation
    if (isNaN(amt) || amt < MIN_WAGER) {
      toast(`Minimum wager is $${MIN_WAGER}`)
      return
    }
    if (amt > maxWager) {
      toast(`Maximum wager is $${maxWager}`)
      return
    }

    // Check betting locked
    if (eventInfo?.betting_locked) {
      toast('Betting is currently locked.')
      return
    }

    setEditSaving(true)

    if (wager) {
      // Update existing wager row
      const { error } = await supabase
        .from('wagers')
        .update({ pick: editPick, amount: amt } as unknown as { pick: 'rousey' | 'carano'; amount: number })
        .eq('user_id', user.id)

      if (error) {
        toast('Could not update your wager. Try again.')
        setEditSaving(false)
        return
      }
    } else {
      // No wager row yet — create one (only possible if admin already confirmed them)
      const { error } = await supabase
        .from('wagers')
        .insert({ user_id: user.id, pick: editPick, amount: amt, status: 'confirmed' } as unknown as { user_id: string; pick: 'rousey' | 'carano'; amount: number; status: string })

      if (error) {
        toast('Could not save your wager.')
        setEditSaving(false)
        return
      }
    }

    setEditSaving(false)
    setEditOpen(false)
    toast('✓ Wager updated!')

    // Reload
    const { data } = await supabase.from('wagers').select('*').eq('user_id', user.id).maybeSingle()
    setWager((data as Wager | null) ?? null)
    const { data: poolData } = await supabase.from('wager_pool').select('*')
    setPool((poolData as WagerPoolEntry[]) || [])
  }

  const totalPot = pool.reduce((s, w) => s + Number(w.amount), 0)
  const totalRousey = pool.filter(w => w.pick === 'rousey').reduce((s, w) => s + Number(w.amount), 0)
  const totalCarano = pool.filter(w => w.pick === 'carano').reduce((s, w) => s + Number(w.amount), 0)

  function calcPayout(amount: number, pick: 'rousey' | 'carano') {
    const winningSide = pick === 'rousey' ? totalRousey : totalCarano
    const losingSide = pick === 'rousey' ? totalCarano : totalRousey
    if (winningSide === 0) return amount
    return amount + (amount / winningSide) * losingSide
  }

  const displayWager = wager || reservation
  const myPayout = displayWager ? calcPayout(Number(displayWager.amount), displayWager.pick) : 0
  const rouseyPct = totalPot > 0 ? Math.round((totalRousey / totalPot) * 100) : 50
  const caranoPct = 100 - rouseyPct

  const bettingOpen = !eventInfo?.betting_locked
  // Only admin can edit wagers — members view-only
  const canEdit = isAdminUser && bettingOpen && !!displayWager && displayWager.status === 'confirmed'

  // Members can request a change when: betting open, have a confirmed wager, no pending request already
  const pendingChangeRequest = changeRequests.find(r => r.status === 'pending')
  const canRequestChange = !isAdminUser && bettingOpen && !!wager && wager.status === 'confirmed' && !pendingChangeRequest
  const latestRequest = changeRequests[0] ?? null

  function openRequestModal() {
    if (!wager) return
    setReqPick(wager.pick)
    setReqAmount(String(Number(wager.amount)))
    setReqReason('')
    setReqOpen(true)
  }

  async function submitChangeRequest() {
    if (!user || !wager) return
    const amt = parseFloat(reqAmount)
    if (isNaN(amt) || amt < MIN_WAGER) { toast(`Minimum wager is $${MIN_WAGER}`); return }
    if (amt > MAX_WAGER_MEMBER) { toast(`Maximum wager is $${MAX_WAGER_MEMBER}`); return }
    if (reqPick === wager.pick && amt === Number(wager.amount)) {
      toast('No changes detected — your request is identical to your current wager.'); return
    }

    setReqSaving(true)
    try {
      const { error } = await (supabase.from('wager_change_requests') as any).insert({
        user_id: user.id,
        current_pick: wager.pick,
        current_amount: Number(wager.amount),
        requested_pick: reqPick,
        requested_amount: amt,
        reason: reqReason.trim() || null,
        status: 'pending',
      })
      if (error) { toast('Could not submit request. Please try again.'); return }
      toast('✓ Request sent to admin!')
      setReqOpen(false)
      // Refresh change requests
      const { data } = await supabase.from('wager_change_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      setChangeRequests((data as WagerChangeRequest[]) || [])
    } catch {
      toast('Something went wrong. Please try again.')
    } finally {
      setReqSaving(false)
    }
  }

  const card: React.CSSProperties = {
    background: 'var(--dark-gray)', border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 4, overflow: 'hidden', marginBottom: '1.5rem',
  }
  const cardHeader: React.CSSProperties = {
    background: 'rgba(201,168,76,0.06)', borderBottom: '1px solid rgba(201,168,76,0.15)',
    padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: '0.5rem',
  }
  const cardTitle: React.CSSProperties = {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: '0.08em', color: 'var(--gold)',
  }
  const label: React.CSSProperties = {
    fontFamily: "'Barlow Condensed', sans-serif", fontSize: '0.65rem', fontWeight: 700,
    letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.35)', marginBottom: 4,
  }
  const bigVal = (color?: string): React.CSSProperties => ({
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.5rem,4vw,2rem)', letterSpacing: '0.05em',
    lineHeight: 1, color: color || 'var(--off-white)',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--near-black)', paddingTop: 56 }}>
      {/* Page Header */}
      <div style={{
        background: 'var(--dark-gray)', borderBottom: '1px solid rgba(201,168,76,0.15)',
        padding: '1.5rem', display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
      }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 'clamp(1.2rem,3vw,1.5rem)', letterSpacing: '0.08em' }}>
            Welcome back, <span style={{ color: 'var(--gold)' }}>{profile?.full_name?.split(' ')[0]}</span>
          </div>
          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.78rem', letterSpacing: '0.08em', color: 'rgba(245,240,232,0.35)', marginTop: 4 }}>
            Private wager pool · Members only
            {isAdminUser && <span style={{ marginLeft: 8, color: 'var(--red)', fontWeight: 700 }}>· ADMIN</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            fontFamily: "'Barlow Condensed'", fontSize: '0.72rem', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            background: bettingOpen ? 'var(--red)' : 'rgba(245,240,232,0.15)',
            color: bettingOpen ? '#fff' : 'rgba(245,240,232,0.5)',
            padding: '0.3rem 0.8rem', borderRadius: 2,
          }}>
            {bettingOpen ? '⚡ Betting Open · May 16' : '🔒 Betting Locked'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(1.25rem,4vw,2.5rem) clamp(1rem,3vw,2rem)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', fontFamily: "'Barlow Condensed'", color: 'rgba(245,240,232,0.4)', letterSpacing: '0.2em', fontSize: '0.85rem', textTransform: 'uppercase' as const }}>
            Loading your wager...
          </div>
        ) : (
          <>
            {/* My Wager Card */}
            <div style={card}>
              <div style={cardHeader}>
                <div style={cardTitle}>My Wager</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {displayWager && (
                    <span className={`pill pill-${displayWager.status}`}>
                      {displayWager.status === 'confirmed' ? '✓ ' : ''}{displayWager.status}
                    </span>
                  )}
                  {canEdit && (
                    <button className="btn-sm btn-action" onClick={openEditModal}>
                      ✏ Edit Wager
                    </button>
                  )}
                  {!bettingOpen && displayWager && (
                    <span style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.7rem', letterSpacing: '0.1em', color: 'rgba(245,240,232,0.35)' }}>
                      🔒 Locked
                    </span>
                  )}
                </div>
              </div>
              <div style={{ padding: 'clamp(1rem,3vw,1.5rem)' }}>
                {!displayWager ? (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.875rem', padding: '2rem 1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', opacity: 0.4 }}>🥊</div>
                    <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.2rem', letterSpacing: '0.06em', color: 'var(--off-white)' }}>
                      No wager on file yet
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.82rem', color: 'rgba(245,240,232,0.4)', lineHeight: 1.6, maxWidth: 340, letterSpacing: '0.03em' }}>
                      You're in the pool but your wager hasn't been confirmed yet. The admin will set your pick and amount — you'll see everything here once it's locked in.
                    </div>
                    <div style={{ marginTop: '0.5rem', padding: '0.65rem 1rem', background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 3, fontFamily: "'Barlow Condensed'", fontSize: '0.75rem', color: 'rgba(201,168,76,0.7)', letterSpacing: '0.08em' }}>
                      Questions? Reach out to the admin directly.
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                      <div>
                        <div style={label}>Your pick</div>
                        <div style={{ ...bigVal(displayWager.pick === 'rousey' ? '#60a5fa' : '#f87171'), fontSize: 'clamp(1.1rem,3vw,1.4rem)' }}>
                          {displayWager.pick === 'rousey' ? 'Ronda Rousey' : 'Gina Carano'}
                        </div>
                      </div>
                      <div>
                        <div style={label}>Your wager</div>
                        <div style={bigVal('var(--gold)')}>${Number(displayWager.amount).toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={label}>If your fighter wins</div>
                        <div style={bigVal('#4ade80')}>${myPayout.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={label}>Net profit if win</div>
                        <div style={bigVal('#4ade80')}>+${(myPayout - Number(displayWager.amount)).toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Quick adjust buttons */}
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.35)' }}>
                          Quick adjust:
                        </span>
                        <button
                          className="btn-sm btn-action"
                          disabled={Number(displayWager.amount) <= MIN_WAGER}
                          onClick={async () => {
                            const newAmt = Math.max(MIN_WAGER, Number(displayWager.amount) - 5)
                            if (!user) return
                            if (wager) {
                              await supabase.from('wagers').update({ amount: newAmt } as unknown as { amount: number }).eq('user_id', user.id)
                            }
                            const { data } = await supabase.from('wagers').select('*').eq('user_id', user.id).maybeSingle()
                            setWager((data as Wager | null) ?? null)
                            const { data: poolData } = await supabase.from('wager_pool').select('*')
                            setPool((poolData as WagerPoolEntry[]) || [])
                          }}
                        >
                          − $5
                        </button>
                        <button
                          className="btn-sm btn-action"
                          disabled={Number(displayWager.amount) >= maxWager}
                          onClick={async () => {
                            const newAmt = Math.min(maxWager, Number(displayWager.amount) + 5)
                            if (!user) return
                            if (wager) {
                              await supabase.from('wagers').update({ amount: newAmt } as unknown as { amount: number }).eq('user_id', user.id)
                            }
                            const { data } = await supabase.from('wagers').select('*').eq('user_id', user.id).maybeSingle()
                            setWager((data as Wager | null) ?? null)
                            const { data: poolData } = await supabase.from('wager_pool').select('*')
                            setPool((poolData as WagerPoolEntry[]) || [])
                          }}
                        >
                          + $5
                        </button>
                        <button className="btn-sm btn-action" onClick={openEditModal}>
                          Custom amount
                        </button>
                        <span style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', color: 'rgba(245,240,232,0.25)' }}>
                          Max: ${maxWager}
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: '0.72rem', color: 'rgba(245,240,232,0.3)', fontFamily: "'Barlow Condensed'", letterSpacing: '0.08em', borderTop: '1px solid rgba(245,240,232,0.07)', paddingTop: '1rem' }}>
                      Payout updates live as new members join · Your wager + (Your wager ÷ Total on your side) × Total on losing side
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Wager Change Request card (members only) ── */}
            {!isAdminUser && wager && wager.status === 'confirmed' && (
              <div style={{ ...card, border: pendingChangeRequest ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(245,240,232,0.08)' }}>
                <div style={cardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={cardTitle}>Request a Change</div>
                    {pendingChangeRequest && (
                      <span className="pill pill-pending" style={{ fontSize: '0.58rem' }}>⏳ Pending Review</span>
                    )}
                    {latestRequest?.status === 'approved' && !pendingChangeRequest && (
                      <span className="pill pill-confirmed" style={{ fontSize: '0.58rem' }}>✓ Last: Approved</span>
                    )}
                    {latestRequest?.status === 'denied' && !pendingChangeRequest && (
                      <span className="pill pill-denied" style={{ fontSize: '0.58rem' }}>✕ Last: Denied</span>
                    )}
                  </div>
                  {bettingOpen && canRequestChange && (
                    <button className="btn-sm btn-action" onClick={openRequestModal}>✏ New Request</button>
                  )}
                  {!bettingOpen && (
                    <span style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.7rem', letterSpacing: '0.1em', color: 'rgba(245,240,232,0.3)' }}>🔒 Betting locked</span>
                  )}
                </div>
                <div style={{ padding: 'clamp(1rem,3vw,1.5rem)' }}>
                  {changeRequests.length === 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '1rem', padding: '1.5rem 0', textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', opacity: 0.5 }}>✏️</div>
                      <div>
                        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.92rem', fontWeight: 600, color: 'var(--off-white)', marginBottom: '0.3rem' }}>Want to change your wager?</div>
                        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.78rem', color: 'rgba(245,240,232,0.4)', letterSpacing: '0.04em', lineHeight: 1.5 }}>Submit a request and the admin will review it. Changes take effect only after admin approval.</div>
                      </div>
                      {bettingOpen ? (
                        <button className="btn-sm btn-action" style={{ padding: '0.6rem 1.5rem', fontSize: '0.78rem' }} onClick={openRequestModal}>✏ Request a Change</button>
                      ) : (
                        <div style={{ padding: '0.65rem 1rem', background: 'rgba(245,240,232,0.03)', border: '1px solid rgba(245,240,232,0.08)', borderRadius: 3, fontFamily: "'Barlow Condensed'", fontSize: '0.78rem', color: 'rgba(245,240,232,0.4)', letterSpacing: '0.06em', lineHeight: 1.5 }}>
                          🔒 Betting is locked ahead of fight night. Wager changes are no longer accepted. Contact the admin if you have an urgent issue.
                        </div>
                      )}
                    </div>
                  )}
                  {pendingChangeRequest && (
                    <div style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, padding: '1rem 1.25rem' }}>
                      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--gold)', marginBottom: '0.75rem' }}>Awaiting Admin Review</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '0.75rem 1rem' }}>
                        <div>
                          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>Current Fighter</div>
                          <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.1rem', letterSpacing: '0.05em', color: pendingChangeRequest.current_pick === 'rousey' ? '#60a5fa' : '#f87171' }}>{pendingChangeRequest.current_pick === 'rousey' ? 'Rousey' : 'Carano'}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(245,240,232,0.2)', fontSize: '1.2rem' }}>→</div>
                        <div>
                          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>Requested Fighter</div>
                          <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.1rem', letterSpacing: '0.05em', color: pendingChangeRequest.requested_pick === 'rousey' ? '#60a5fa' : '#f87171' }}>{pendingChangeRequest.requested_pick === 'rousey' ? 'Rousey' : 'Carano'}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>Current Amount</div>
                          <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.1rem', color: 'var(--off-white)', letterSpacing: '0.05em' }}>${Number(pendingChangeRequest.current_amount).toLocaleString()}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(245,240,232,0.2)', fontSize: '1.2rem' }}>→</div>
                        <div>
                          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>Requested Amount</div>
                          <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>${Number(pendingChangeRequest.requested_amount).toLocaleString()}</div>
                        </div>
                      </div>
                      {pendingChangeRequest.reason && (
                        <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid rgba(245,240,232,0.07)', fontFamily: "'Barlow Condensed'", fontSize: '0.82rem', color: 'rgba(245,240,232,0.5)', fontStyle: 'italic' }}>"{pendingChangeRequest.reason}"</div>
                      )}
                    </div>
                  )}
                  {!pendingChangeRequest && latestRequest && (
                    <div style={{ background: latestRequest.status === 'approved' ? 'rgba(74,222,128,0.04)' : 'rgba(200,16,46,0.04)', border: `1px solid ${latestRequest.status === 'approved' ? 'rgba(74,222,128,0.15)' : 'rgba(200,16,46,0.15)'}`, borderRadius: 4, padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: latestRequest.status === 'approved' ? '#4ade80' : 'var(--red)' }}>
                          {latestRequest.status === 'approved' ? '✓ Last request approved' : '✕ Last request denied'}
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', color: 'rgba(245,240,232,0.3)' }}>{new Date(latestRequest.updated_at).toLocaleDateString()}</div>
                      </div>
                      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.82rem', color: 'rgba(245,240,232,0.5)' }}>
                        Requested: <span style={{ color: latestRequest.requested_pick === 'rousey' ? '#60a5fa' : '#f87171', fontWeight: 600 }}>{latestRequest.requested_pick === 'rousey' ? 'Rousey' : 'Carano'}</span> · <span style={{ color: 'var(--gold)', fontWeight: 600 }}>${Number(latestRequest.requested_amount).toLocaleString()}</span>
                      </div>
                      {latestRequest.admin_response && (
                        <div style={{ marginTop: '0.5rem', fontFamily: "'Barlow Condensed'", fontSize: '0.8rem', color: 'rgba(245,240,232,0.45)', fontStyle: 'italic' }}>Admin: "{latestRequest.admin_response}"</div>
                      )}
                      {bettingOpen && (
                        <button className="btn-sm btn-action" style={{ marginTop: '0.875rem' }} onClick={openRequestModal}>✏ Submit another request</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pool Breakdown */}
            <div style={card}>
              <div style={cardHeader}>
                <div style={cardTitle}>Pool Breakdown</div>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.75rem', letterSpacing: '0.1em', color: 'rgba(245,240,232,0.35)' }}>
                  Total pot: <span style={{ color: 'var(--gold)' }}>${totalPot.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ padding: 'clamp(1rem,3vw,1.5rem)' }}>
                {/* Split bar */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.25rem' }}>
                    <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', color: '#60a5fa' }}>
                      ROUSEY — ${totalRousey.toLocaleString()} ({rouseyPct}%)
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', color: '#f87171' }}>
                      CARANO — ${totalCarano.toLocaleString()} ({caranoPct}%)
                    </div>
                  </div>
                  <div style={{ height: 8, background: 'rgba(245,240,232,0.08)', borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${rouseyPct}%`, background: '#60a5fa', transition: 'width 0.5s ease' }} />
                    <div style={{ flex: 1, background: '#f87171' }} />
                  </div>
                </div>

                {/* Payout scenarios */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  {(['rousey', 'carano'] as const).map(side => (
                    <div key={side} style={{ border: `1px solid ${side === 'rousey' ? 'rgba(96,165,250,0.2)' : 'rgba(200,16,46,0.2)'}`, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ padding: '0.75rem 1rem', background: side === 'rousey' ? 'rgba(96,165,250,0.06)' : 'rgba(200,16,46,0.06)', borderBottom: `1px solid ${side === 'rousey' ? 'rgba(96,165,250,0.15)' : 'rgba(200,16,46,0.15)'}` }}>
                        <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1rem', letterSpacing: '0.06em', color: side === 'rousey' ? '#60a5fa' : 'var(--red)' }}>
                          If {side === 'rousey' ? 'Rousey' : 'Carano'} Wins
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', color: 'rgba(245,240,232,0.35)', letterSpacing: '0.08em' }}>Each winner's payout</div>
                      </div>
                      {pool.filter(w => w.pick === side).length === 0
                        ? <div style={{ padding: '1rem', fontSize: '0.8rem', color: 'rgba(245,240,232,0.3)', fontFamily: "'Barlow Condensed'", letterSpacing: '0.1em' }}>No bettors yet</div>
                        : pool.filter(w => w.pick === side).map(w => (
                          <div key={w.id} style={{ padding: '0.55rem 1rem', borderBottom: '1px solid rgba(245,240,232,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <div>
                              <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.85rem', fontWeight: 600, color: 'var(--off-white)' }}>{w.full_name}</div>
                              <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', color: 'rgba(245,240,232,0.35)' }}>wagered ${Number(w.amount).toLocaleString()}</div>
                            </div>
                            <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.1rem', color: '#4ade80', letterSpacing: '0.05em', flexShrink: 0 }}>
                              ${calcPayout(Number(w.amount), side).toFixed(2)}
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 4 }}>
                  <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'var(--gold)', marginBottom: 4 }}>Payout Formula</div>
                  <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.82rem', color: 'rgba(245,240,232,0.6)', letterSpacing: '0.03em' }}>
                    Your payout = Your wager + (Your wager ÷ Total on your side) × Total on losing side
                  </div>
                </div>
              </div>
            </div>

            {/* All Members Table */}
            <div style={card}>
              <div style={cardHeader}>
                <div style={cardTitle}>All Members</div>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.75rem', letterSpacing: '0.1em', color: 'rgba(245,240,232,0.35)' }}>
                  {pool.length} members confirmed
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
                  <thead>
                    <tr>
                      {['Member', 'Pick', 'Wagered', 'Payout if Win'].map(h => (
                        <th key={h} style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.3)', padding: '0.7rem 1rem', borderBottom: '1px solid rgba(245,240,232,0.07)', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pool.map((entry) => {
                      const initials = entry.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                      const isMe = wager ? entry.id === wager.id : false
                      const payout = calcPayout(Number(entry.amount), entry.pick)
                      return (
                        <tr key={entry.id} style={{ borderBottom: '1px solid rgba(245,240,232,0.05)', background: isMe ? 'rgba(201,168,76,0.04)' : undefined }}>
                          <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Barlow Condensed'", fontSize: '0.65rem', fontWeight: 700, background: 'rgba(201,168,76,0.12)', color: 'var(--gold)', flexShrink: 0 }}>{initials}</div>
                              <span style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.92rem', fontWeight: 600, color: 'var(--off-white)' }}>
                                {entry.full_name}
                                {isMe && <em style={{ fontSize: '0.68rem', color: 'rgba(245,240,232,0.35)', marginLeft: 6 }}>(you)</em>}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: "'Barlow Condensed'", fontSize: '0.88rem', fontWeight: 500, color: entry.pick === 'rousey' ? '#60a5fa' : '#f87171', whiteSpace: 'nowrap' }}>
                            {entry.pick === 'rousey' ? 'Rousey' : 'Carano'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: "'Bebas Neue'", fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>
                            ${Number(entry.amount).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: "'Bebas Neue'", fontSize: '1.1rem', color: '#4ade80', letterSpacing: '0.05em' }}>
                            ${payout.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                    {pool.length === 0 && (
                      <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', fontFamily: "'Barlow Condensed'", fontSize: '0.85rem', color: 'rgba(245,240,232,0.3)', letterSpacing: '0.1em' }}>No confirmed wagers yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit Wager Modal */}
      {editOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }} onClick={() => setEditOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440,
              background: 'var(--dark-gray)', border: '1px solid rgba(201,168,76,0.25)',
              borderRadius: 4, overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{ background: 'rgba(201,168,76,0.07)', borderBottom: '1px solid rgba(201,168,76,0.15)', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.2rem', letterSpacing: '0.08em', color: 'var(--gold)' }}>Edit My Wager</div>
              <button onClick={() => setEditOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.4)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              {/* Fighter picker */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.4)', marginBottom: '0.6rem' }}>Pick Your Fighter</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  {(['rousey', 'carano'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setEditPick(f)}
                      style={{
                        padding: '0.875rem',
                        border: `2px solid ${editPick === f ? (f === 'rousey' ? '#60a5fa' : 'var(--red)') : 'rgba(245,240,232,0.1)'}`,
                        borderRadius: 3, background: editPick === f ? (f === 'rousey' ? 'rgba(96,165,250,0.1)' : 'rgba(200,16,46,0.1)') : 'rgba(245,240,232,0.03)',
                        cursor: 'pointer', transition: 'all 0.2s',
                        fontFamily: "'Bebas Neue'", fontSize: '1.05rem', letterSpacing: '0.06em',
                        color: editPick === f ? (f === 'rousey' ? '#60a5fa' : '#f87171') : 'rgba(245,240,232,0.5)',
                      }}
                    >
                      {f === 'rousey' ? 'Ronda Rousey' : 'Gina Carano'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.4)', marginBottom: '0.6rem' }}>
                  Wager Amount (${MIN_WAGER}–${maxWager})
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    className="btn-sm btn-action"
                    onClick={() => setEditAmount(a => String(Math.max(MIN_WAGER, parseFloat(a || '0') - 5)))}
                    disabled={parseFloat(editAmount || '0') <= MIN_WAGER}
                    style={{ flexShrink: 0, width: 40, padding: '0.4rem 0', textAlign: 'center' }}
                  >−</button>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gold)', fontFamily: "'Bebas Neue'", fontSize: '1.1rem' }}>$</span>
                    <input
                      type="number"
                      value={editAmount}
                      min={MIN_WAGER}
                      max={maxWager}
                      step={1}
                      onChange={e => setEditAmount(e.target.value)}
                      style={{
                        width: '100%', background: 'rgba(245,240,232,0.05)',
                        border: '1px solid rgba(201,168,76,0.3)', borderRadius: 2,
                        color: 'var(--gold)', fontFamily: "'Bebas Neue'", fontSize: '1.2rem',
                        letterSpacing: '0.05em', padding: '0.6rem 0.75rem 0.6rem 1.75rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    className="btn-sm btn-action"
                    onClick={() => setEditAmount(a => String(Math.min(maxWager, parseFloat(a || '0') + 5)))}
                    disabled={parseFloat(editAmount || '0') >= maxWager}
                    style={{ flexShrink: 0, width: 40, padding: '0.4rem 0', textAlign: 'center' }}
                  >+</button>
                </div>
                {isAdminUser && (
                  <div style={{ marginTop: '0.4rem', fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', color: 'rgba(201,168,76,0.6)' }}>
                    Admin exception: up to ${MAX_WAGER_ADMIN}
                  </div>
                )}
              </div>

              {/* Payout preview */}
              {(() => {
                const previewAmt = parseFloat(editAmount || '0')
                if (previewAmt >= MIN_WAGER) {
                  const previewPool = pool.map(p =>
                    p.id === wager?.id ? { ...p, pick: editPick, amount: previewAmt } : p
                  )
                  const pr = previewPool.filter(p => p.pick === 'rousey').reduce((s, p) => s + Number(p.amount), 0)
                  const pc = previewPool.filter(p => p.pick === 'carano').reduce((s, p) => s + Number(p.amount), 0)
                  const win = editPick === 'rousey' ? pr : pc
                  const lose = editPick === 'rousey' ? pc : pr
                  const payout = win > 0 ? previewAmt + (previewAmt / win) * lose : previewAmt
                  return (
                    <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 3 }}>
                      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'rgba(74,222,128,0.7)', marginBottom: 4 }}>Estimated payout if you win</div>
                      <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.6rem', color: '#4ade80', letterSpacing: '0.05em' }}>${payout.toFixed(2)}</div>
                      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.72rem', color: 'rgba(245,240,232,0.35)', marginTop: 2 }}>
                        Net profit: +${(payout - previewAmt).toFixed(2)}
                      </div>
                    </div>
                  )
                }
                return null
              })()}

              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button className="btn-outline" style={{ flex: 1, padding: '0.75rem' }} onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button className="btn-primary" style={{ flex: 2, padding: '0.75rem' }} onClick={saveWagerEdit} disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save Wager →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Request Modal ── */}
      {reqOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setReqOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--dark-gray)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 4, overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ background: 'rgba(201,168,76,0.07)', borderBottom: '1px solid rgba(201,168,76,0.15)', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.2rem', letterSpacing: '0.08em', color: 'var(--gold)' }}>Request Wager Change</div>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.7rem', letterSpacing: '0.1em', color: 'rgba(245,240,232,0.35)', marginTop: 2 }}>Admin will review and apply if approved</div>
              </div>
              <button onClick={() => setReqOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.4)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem' }}>✕</button>
            </div>

            <div style={{ padding: '1.5rem' }}>

              {/* Fighter picker — visual cards */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.4)', marginBottom: '0.6rem' }}>Pick Your Fighter</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  {(['rousey', 'carano'] as const).map(f => {
                    const isSelected = reqPick === f
                    const color = f === 'rousey' ? '#60a5fa' : '#f87171'
                    const borderColor = f === 'rousey' ? 'rgba(96,165,250,0.6)' : 'rgba(248,113,113,0.6)'
                    const bgColor = f === 'rousey' ? 'rgba(96,165,250,0.1)' : 'rgba(248,113,113,0.1)'
                    const isCurrent = wager?.pick === f
                    return (
                      <button key={f} onClick={() => setReqPick(f)} style={{ padding: '1rem 0.75rem', border: `2px solid ${isSelected ? borderColor : 'rgba(245,240,232,0.1)'}`, borderRadius: 3, background: isSelected ? bgColor : 'rgba(245,240,232,0.02)', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' as const, position: 'relative' as const }}>
                        {isCurrent && (
                          <div style={{ position: 'absolute' as const, top: 5, right: 6, fontFamily: "'Barlow Condensed'", fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(245,240,232,0.4)' }}>CURRENT</div>
                        )}
                        <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.15rem', letterSpacing: '0.06em', color: isSelected ? color : 'rgba(245,240,232,0.45)', marginBottom: 2 }}>
                          {f === 'rousey' ? 'Ronda Rousey' : 'Gina Carano'}
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.65rem', letterSpacing: '0.1em', color: isSelected ? color : 'rgba(245,240,232,0.25)', fontWeight: 600 }}>
                          {f === 'rousey' ? "Women's Featherweight" : "Women's Featherweight"}
                        </div>
                        {isSelected && (
                          <div style={{ marginTop: 6, width: 6, height: 6, borderRadius: '50%', background: color, margin: '6px auto 0' }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Amount input */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.4)', marginBottom: '0.6rem' }}>
                  Wager Amount (${MIN_WAGER}–${MAX_WAGER_MEMBER})
                  {wager && <span style={{ marginLeft: '0.5rem', color: 'rgba(245,240,232,0.25)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· current: ${Number(wager.amount).toLocaleString()}</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button className="btn-sm btn-action" onClick={() => setReqAmount(a => String(Math.max(MIN_WAGER, parseFloat(a || '0') - 1)))} disabled={parseFloat(reqAmount || '0') <= MIN_WAGER} style={{ flexShrink: 0, width: 40, padding: '0.4rem 0', textAlign: 'center' as const }}>−</button>
                  <div style={{ position: 'relative' as const, flex: 1 }}>
                    <span style={{ position: 'absolute' as const, left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gold)', fontFamily: "'Bebas Neue'", fontSize: '1.1rem' }}>$</span>
                    <input type="number" value={reqAmount} min={MIN_WAGER} max={MAX_WAGER_MEMBER} step={1} onChange={e => setReqAmount(e.target.value)} style={{ width: '100%', background: 'rgba(245,240,232,0.05)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 2, color: 'var(--gold)', fontFamily: "'Bebas Neue'", fontSize: '1.2rem', letterSpacing: '0.05em', padding: '0.6rem 0.75rem 0.6rem 1.75rem', outline: 'none' }} />
                  </div>
                  <button className="btn-sm btn-action" onClick={() => setReqAmount(a => String(Math.min(MAX_WAGER_MEMBER, parseFloat(a || '0') + 1)))} disabled={parseFloat(reqAmount || '0') >= MAX_WAGER_MEMBER} style={{ flexShrink: 0, width: 40, padding: '0.4rem 0', textAlign: 'center' as const }}>+</button>
                </div>
              </div>

              {/* Live payout preview */}
              {(() => {
                const previewAmt = parseFloat(reqAmount || '0')
                if (previewAmt >= MIN_WAGER) {
                  const pr = pool.filter(p => p.pick === 'rousey').reduce((s, p) => s + Number(p.amount), 0)
                  const pc = pool.filter(p => p.pick === 'carano').reduce((s, p) => s + Number(p.amount), 0)
                  const win = reqPick === 'rousey' ? pr : pc
                  const lose = reqPick === 'rousey' ? pc : pr
                  const payout = win > 0 ? previewAmt + (previewAmt / win) * lose : previewAmt
                  const currentPayout = myPayout
                  const diff = payout - currentPayout
                  return (
                    <div style={{ marginBottom: '1.25rem', padding: '0.875rem 1rem', background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.12)', borderRadius: 3 }}>
                      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'rgba(74,222,128,0.7)', marginBottom: 6 }}>If approved — estimated payout if you win</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' as const }}>
                        <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.6rem', color: '#4ade80', letterSpacing: '0.05em' }}>${payout.toFixed(2)}</div>
                        {diff !== 0 && (
                          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.75rem', color: diff > 0 ? '#4ade80' : 'var(--red)', fontWeight: 600 }}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(2)} vs current
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
                return null
              })()}

              {/* Reason textarea */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.4)', marginBottom: '0.6rem' }}>
                  Reason <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgba(245,240,232,0.25)' }}>(optional)</span>
                </div>
                <textarea value={reqReason} onChange={e => setReqReason(e.target.value)} maxLength={200} placeholder="e.g. I changed my mind after watching the weigh-in..." rows={2} style={{ width: '100%', background: 'rgba(245,240,232,0.05)', border: '1px solid rgba(245,240,232,0.12)', borderRadius: 2, color: 'var(--off-white)', fontFamily: "'Barlow Condensed'", fontSize: '0.88rem', padding: '0.65rem 0.9rem', outline: 'none', resize: 'vertical' as const, lineHeight: 1.5 }} />
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.65rem', color: 'rgba(245,240,232,0.2)', marginTop: 3, textAlign: 'right' as const }}>{reqReason.length}/200</div>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button className="btn-outline" style={{ flex: 1, padding: '0.75rem' }} onClick={() => setReqOpen(false)}>Cancel</button>
                <button className="btn-primary" style={{ flex: 2, padding: '0.75rem' }} onClick={submitChangeRequest} disabled={reqSaving}>
                  {reqSaving ? 'Sending...' : 'Send Request to Admin →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
