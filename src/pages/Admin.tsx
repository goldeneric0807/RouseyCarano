import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import type { AccessRequest, Profile, Wager, WagerReservation, EventInfo, WagerChangeRequest } from '../types/database'
import { ADMIN_EMAIL } from '../types/database'

type Tab = 'pending' | 'wagers' | 'members' | 'invite' | 'controls' | 'requests'
type PickType = 'rousey' | 'carano'

interface WagerWithProfile extends Wager {
  profiles: Pick<Profile, 'full_name' | 'email'>
}

export default function Admin() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Guard: redirect non-admins
  useEffect(() => {
    if (!isAdmin && user?.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAdmin, user, navigate])

  const [tab, setTab] = useState<Tab>('pending')
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [wagers, setWagers] = useState<WagerWithProfile[]>([])
  const [reservations, setReservations] = useState<WagerReservation[]>([])
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [loadingWagers, setLoadingWagers] = useState(true)
  const [changeRequests, setChangeRequests] = useState<(WagerChangeRequest & { profiles: Pick<Profile, 'full_name' | 'email'> })[]>([])
  const [loadingChangeRequests, setLoadingChangeRequests] = useState(true)
  const [denyResponseMap, setDenyResponseMap] = useState<Record<string, string>>({})

  // Winner confirmation modal
  const [winnerModalOpen, setWinnerModalOpen] = useState(false)
  const [winnerModalPick, setWinnerModalPick] = useState<PickType | null>(null)
  const [payoutSettling, setPayoutSettling] = useState(false)

  // Invite tab
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteAmount, setInviteAmount] = useState('')
  const [invitePick, setInvitePick] = useState<PickType>('rousey')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)

  // Pending approvals per-row state
  const [requestAmounts, setRequestAmounts] = useState<Record<string, string>>({})
  const [requestPicks, setRequestPicks] = useState<Record<string, PickType>>({})

  // Controls tab — admin's own wager
  const [adminWagerPick, setAdminWagerPick] = useState<PickType>('rousey')
  const [adminWagerAmount, setAdminWagerAmount] = useState('')
  const [adminWagerSaving, setAdminWagerSaving] = useState(false)

  // Controls tab — manual pool adjustment
  const [poolAdjustAmount, setPoolAdjustAmount] = useState('')
  const [poolAdjustPick, setPoolAdjustPick] = useState<PickType>('rousey')
  const [poolAdjustName, setPoolAdjustName] = useState('')
  const [poolAdjustEmail, setPoolAdjustEmail] = useState('')
  const [poolAdjustSaving, setPoolAdjustSaving] = useState(false)

  useEffect(() => {
    loadAll()

    const channel = supabase
      .channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wagers' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wager_reservations' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, loadRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_info' }, loadEventInfo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wager_change_requests' }, loadChangeRequests)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function loadAll() {
    loadRequests()
    loadWagers()
    loadReservations()
    loadProfiles()
    loadEventInfo()
    loadChangeRequests()
  }

  async function loadRequests() {
    setLoadingRequests(true)
    const { data } = await supabase.from('access_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false })
    if (data) setRequests(data as AccessRequest[])
    setLoadingRequests(false)
  }

  async function loadWagers() {
    setLoadingWagers(true)
    const { data } = await supabase.from('wagers').select('*, profiles(full_name, email)').order('created_at', { ascending: true })
    if (data) setWagers(data as WagerWithProfile[])
    setLoadingWagers(false)
  }

  async function loadReservations() {
    const { data } = await supabase.from('wager_reservations').select('*').order('created_at', { ascending: true })
    if (data) setReservations(data as WagerReservation[])
  }

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (data) setAllProfiles(data as Profile[])
  }

  async function loadEventInfo() {
    const { data } = await supabase.from('event_info').select('*').eq('id', 1).maybeSingle()
    if (data) setEventInfo(data as EventInfo)
  }

  async function loadChangeRequests() {
    setLoadingChangeRequests(true)
    const { data } = await supabase
      .from('wager_change_requests')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: false })
    if (data) setChangeRequests(data as any)
    setLoadingChangeRequests(false)
  }

  async function approveChangeRequest(req: WagerChangeRequest & { profiles: Pick<Profile, 'full_name' | 'email'> }) {
    // Apply the change to the wager
    const { error: wagerErr } = await (supabase.from('wagers') as any)
      .update({ pick: req.requested_pick, amount: req.requested_amount })
      .eq('user_id', req.user_id)
    if (wagerErr) { toast('Failed to update wager.'); return }

    // Mark request approved
    await (supabase.from('wager_change_requests') as any)
      .update({ status: 'approved' })
      .eq('id', req.id)

    toast(`✓ Approved — ${req.profiles?.full_name}'s wager updated!`)
    loadChangeRequests()
    loadWagers()
  }

  async function denyChangeRequest(req: WagerChangeRequest & { profiles: Pick<Profile, 'full_name' | 'email'> }) {
    const response = denyResponseMap[req.id]?.trim() || null
    await (supabase.from('wager_change_requests') as any)
      .update({ status: 'denied', admin_response: response })
      .eq('id', req.id)
    toast(`${req.profiles?.full_name}'s request denied.`)
    loadChangeRequests()
  }

  // ── Pending approvals ──
  async function approveRequest(req: AccessRequest) {
    const amount = parseFloat(requestAmounts[req.id] || '0')
    const pick = requestPicks[req.id] || 'rousey'
    if (!amount || amount <= 0) { toast('Enter a wager amount before approving.'); return }

    const { error: reserveError } = await (supabase.from('wager_reservations') as any).upsert({
      full_name: req.full_name,
      email: req.email.toLowerCase().trim(),
      amount,
      pick,
      status: 'confirmed',
    }, { onConflict: 'email' })

    if (reserveError) { toast('Could not save wager reservation.'); return }
    await (supabase.from('access_requests') as any).update({ status: 'approved' }).eq('id', req.id)
    setRequests(prev => prev.filter(r => r.id !== req.id))
    loadReservations()
    toast(`✓ ${req.full_name} approved. Send invite from the Invite tab.`)
  }

  async function denyRequest(req: AccessRequest) {
    await (supabase.from('access_requests') as any).update({ status: 'denied' }).eq('id', req.id)
    setRequests(prev => prev.filter(r => r.id !== req.id))
    toast(`${req.full_name} denied.`)
  }

  // ── Wager management ──
  async function updateWager(wagerId: string, amount: number, pick: PickType, status: string) {
    const { error } = await (supabase.from('wagers') as any).update({ amount, pick, status }).eq('id', wagerId)
    if (error) { toast('Failed to update wager.'); return }
    toast('✓ Wager updated!')
    loadWagers()
  }

  async function deleteWager(wagerId: string, name: string) {
    if (!confirm(`Remove ${name}'s wager? This cannot be undone.`)) return
    const { error } = await (supabase.from('wagers') as any).delete().eq('id', wagerId)
    if (error) { toast('Failed to remove wager.'); return }
    toast(`${name}'s wager removed.`)
    loadWagers()
  }

  async function cancelReservation(reservationId: string, name: string) {
    const { error } = await (supabase.from('wager_reservations') as any).update({ status: 'cancelled' }).eq('id', reservationId)
    if (error) { toast('Failed to cancel.'); return }
    toast(`${name}'s reservation cancelled.`)
    loadReservations()
  }

  // ── Invite ──
  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(inviteAmount)
    if (!amount || amount <= 0) { toast('Enter a valid wager amount.'); return }
    if (!inviteName.trim() || !inviteEmail.trim()) { toast('Name and email are required.'); return }
    setInviteLoading(true)

    const { error } = await (supabase.from('wager_reservations') as any).upsert({
      full_name: inviteName.trim(),
      email: inviteEmail.toLowerCase().trim(),
      amount,
      pick: invitePick,
      status: 'confirmed',
    }, { onConflict: 'email' })

    setInviteLoading(false)
    if (error) { toast('Could not save wager.'); return }

    const loginUrl = `${window.location.origin}/login`
    setGeneratedLink(loginUrl)
    loadReservations()
    toast(`✓ ${inviteName}'s wager saved. Send invite link below.`)
    setInviteName(''); setInviteEmail(''); setInviteAmount('')
  }

  function copyLink() {
    navigator.clipboard.writeText(generatedLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Pool controls ──
  async function toggleBettingLock() {
    const newVal = !eventInfo?.betting_locked
    const { error } = await (supabase.from('event_info') as any).update({ betting_locked: newVal }).eq('id', 1)
    if (error) { toast('Failed to update betting status.'); return }
    toast(newVal ? '🔒 Betting locked.' : '✅ Betting re-opened.')
    loadEventInfo()
  }

  async function addManualPoolEntry() {
    const amount = parseFloat(poolAdjustAmount)
    if (!amount || amount <= 0) { toast('Enter a valid amount.'); return }
    if (!poolAdjustEmail.trim()) { toast('Enter the member\'s email address.'); return }
    setPoolAdjustSaving(true)

    // Look up the user_id from profiles by email
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('email', poolAdjustEmail.toLowerCase().trim())
      .maybeSingle()

    if (profileError || !profileData) {
      toast('No account found for that email. Make sure the user has signed up first.')
      setPoolAdjustSaving(false)
      return
    }

    const name = poolAdjustName.trim() || profileData.full_name
    const userId = profileData.id

    // Check if they already have a wager
    const { data: existingWager } = await supabase
      .from('wagers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (existingWager) {
      const { error } = await (supabase.from('wagers') as any).update({ pick: poolAdjustPick, amount, status: 'confirmed' }).eq('user_id', userId)
      if (error) { toast('Failed to update wager.'); setPoolAdjustSaving(false); return }
      toast(`✓ Updated ${name}\'s wager: $${amount} on ${poolAdjustPick === 'rousey' ? 'Rousey' : 'Carano'}`)
    } else {
      const { error } = await (supabase.from('wagers') as any).insert({ user_id: userId, pick: poolAdjustPick, amount, status: 'confirmed' })
      if (error) { toast('Failed to add wager.'); setPoolAdjustSaving(false); return }
      toast(`✓ Added wager for ${name}: $${amount} on ${poolAdjustPick === 'rousey' ? 'Rousey' : 'Carano'}`)
    }

    setPoolAdjustSaving(false)
    setPoolAdjustName(''); setPoolAdjustAmount(''); setPoolAdjustEmail('')
    loadWagers()
    loadReservations()
  }

  async function saveAdminWager() {
    if (!user) return
    const amount = parseFloat(adminWagerAmount)
    if (!amount || amount <= 0) { toast('Enter a valid wager amount.'); return }
    setAdminWagerSaving(true)

    // Hard 8-second timeout so the button can never hang permanently
    const timeout = window.setTimeout(() => {
      setAdminWagerSaving(false)
      toast('Request timed out — check your connection and try again.')
    }, 8000)

    try {
      // Use upsert — no pre-check select needed, avoids RLS policy conflicts
      const { error } = await (supabase.from('wagers') as any).upsert(
        { user_id: user.id, pick: adminWagerPick, amount, status: 'confirmed' },
        { onConflict: 'user_id', ignoreDuplicates: false }
      )

      if (error) {
        toast(`Failed to save wager: ${error.message}`)
        return
      }

      toast(`✓ Wager saved: $${amount} on ${adminWagerPick === 'rousey' ? 'Rousey' : 'Carano'}`)
      setAdminWagerAmount('')
      loadWagers()
      loadReservations()
    } catch (err: any) {
      toast(`Error: ${err?.message || 'Something went wrong'}`)
    } finally {
      window.clearTimeout(timeout)
      setAdminWagerSaving(false)
    }
  }


  async function setWinner(winner: PickType) {
    setWinnerModalPick(winner)
    setWinnerModalOpen(true)
  }

  async function confirmSetWinner() {
    if (!winnerModalPick) return
    const { error } = await (supabase.from('event_info') as any).update({
      winner: winnerModalPick,
      result: `${winnerModalPick === 'rousey' ? 'Ronda Rousey' : 'Gina Carano'} wins`,
      betting_locked: true,
    }).eq('id', 1)
    if (error) { toast('Failed to set winner.'); return }
    toast(`✓ ${winnerModalPick === 'rousey' ? 'Rousey' : 'Carano'} recorded as winner! Betting locked.`)
    setWinnerModalOpen(false)
    setWinnerModalPick(null)
    loadEventInfo()
  }

  async function markPayoutSettled() {
    if (!confirm('Mark all payouts as settled? This confirms you have paid out all winners.')) return
    setPayoutSettling(true)
    const { error } = await (supabase.from('event_info') as any)
      .update({ payout_settled: true })
      .eq('id', 1)
    setPayoutSettling(false)
    if (error) { toast('Failed to mark settled.'); return }
    toast('✓ Payouts marked as settled!')
    loadEventInfo()
  }

  // ── Computed stats ──
  const allConfirmedPool = [
    ...wagers.filter(w => w.status === 'confirmed'),
    ...reservations.filter(r => r.status === 'confirmed' && !r.fulfilled_user_id),
  ]
  const totalPool = allConfirmedPool.reduce((s, w) => s + Number(w.amount), 0)
  const onRousey = allConfirmedPool.filter(w => w.pick === 'rousey').reduce((s, w) => s + Number(w.amount), 0)
  const onCarano = allConfirmedPool.filter(w => w.pick === 'carano').reduce((s, w) => s + Number(w.amount), 0)
  const daysLeft = Math.max(0, Math.ceil((new Date('2026-05-16T21:00:00').getTime() - Date.now()) / 86400000))
  const pendingReservations = reservations.filter(r => r.status === 'confirmed' && !r.fulfilled_user_id)

  const sc = (label: string, val: string, color?: string) => (
    <div key={label} style={{ background: 'var(--dark-gray)', padding: '1rem 1.25rem' }}>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(1.4rem,3vw,1.8rem)', letterSpacing: '0.04em', color: color || 'var(--gold)' }}>{val}</div>
    </div>
  )

  const panel: React.CSSProperties = { background: 'var(--dark-gray)', border: '1px solid rgba(245,240,232,0.07)', borderRadius: 4, overflow: 'hidden', marginBottom: '1.5rem' }
  const panelHeader: React.CSSProperties = { padding: '0.875rem 1.25rem', borderBottom: '1px solid rgba(245,240,232,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }
  const panelTitle: React.CSSProperties = { fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', letterSpacing: '0.08em', color: 'var(--off-white)' }

  const pendingChangeRequests = changeRequests.filter(r => r.status === 'pending')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'pending', label: 'Pending' },
    { id: 'wagers', label: 'Wagers' },
    { id: 'members', label: 'Members' },
    { id: 'invite', label: 'Invite' },
    { id: 'controls', label: 'Controls' },
    { id: 'requests', label: 'Changes' },
  ]

  return (
    <>
    <div style={{ minHeight: '100vh', background: 'var(--near-black)', paddingTop: 56 }}>
      {/* Admin Header */}
      <div style={{ background: 'var(--dark-gray)', borderBottom: '1px solid rgba(200,16,46,0.3)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(1.1rem,3vw,1.4rem)', letterSpacing: '0.08em', color: 'var(--red)' }}>Admin Panel</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', letterSpacing: '0.08em', color: 'rgba(245,240,232,0.35)', marginTop: 2 }}>
            Rousey vs Carano · Full control · {user?.email}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {eventInfo?.betting_locked ? (
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, background: 'rgba(245,240,232,0.1)', color: 'rgba(245,240,232,0.5)', border: '1px solid rgba(245,240,232,0.2)', padding: '0.2rem 0.65rem', borderRadius: 2 }}>
              🔒 Betting Locked
            </span>
          ) : (
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', padding: '0.2rem 0.65rem', borderRadius: 2 }}>
              ✓ Betting Open
            </span>
          )}
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, background: 'rgba(200,16,46,0.15)', color: 'var(--red)', border: '1px solid rgba(200,16,46,0.3)', padding: '0.2rem 0.65rem', borderRadius: 2 }}>ADMIN</span>
          <button className="btn-outline" style={{ padding: '0.35rem 0.8rem', fontSize: '0.72rem' }} onClick={() => navigate('/')}>View site</button>
          <button className="btn-outline" style={{ padding: '0.35rem 0.8rem', fontSize: '0.72rem' }} onClick={() => navigate('/dashboard')}>My Wager</button>
          <button className="btn-outline" style={{ padding: '0.35rem 0.8rem', fontSize: '0.72rem' }} onClick={async () => { await signOut(); window.location.href = '/' }}>Sign Out</button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem 1.5rem 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 1, background: 'rgba(245,240,232,0.07)', border: '1px solid rgba(245,240,232,0.07)', borderRadius: 4, overflow: 'hidden', marginBottom: '1.25rem' }}>
          {sc('Total members', String(wagers.length + pendingReservations.length))}
          {sc('Total pool', `$${totalPool.toLocaleString()}`)}
          {sc('Pending approvals', String(requests.length), requests.length > 0 ? 'var(--gold)' : undefined)}
          {sc('On Rousey', `$${onRousey.toLocaleString()}`, '#60a5fa')}
          {sc('On Carano', `$${onCarano.toLocaleString()}`, 'var(--red)')}
          {sc('Days to fight', String(daysLeft))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ display: 'flex', gap: 0, background: 'var(--dark-gray)', borderBottom: '1px solid rgba(245,240,232,0.07)', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.78rem', fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase' as const, padding: '0.85rem 1.1rem',
              cursor: 'pointer', background: 'none', border: 'none', whiteSpace: 'nowrap',
              borderBottom: tab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
              color: tab === t.id ? 'var(--gold)' : 'rgba(245,240,232,0.4)', transition: 'all 0.2s',
            }}>
              {t.label}
              {t.id === 'pending' && requests.length > 0 && (
                <span className="pill pill-pending" style={{ marginLeft: 6, fontSize: '0.58rem', padding: '1px 5px' }}>{requests.length}</span>
              )}
              {t.id === 'requests' && pendingChangeRequests.length > 0 && (
                <span className="pill pill-pending" style={{ marginLeft: 6, fontSize: '0.58rem', padding: '1px 5px' }}>{pendingChangeRequests.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.5rem 4rem' }}>

        {/* ── PENDING APPROVALS ── */}
        {tab === 'pending' && (
          <div style={panel}>
            <div style={panelHeader}>
              <div style={panelTitle}>Users Awaiting Approval</div>
            </div>
            {loadingRequests
              ? <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(245,240,232,0.3)', fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: '0.1em' }}>Loading...</div>
              : requests.length === 0
                ? <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(245,240,232,0.3)', fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: '0.1em' }}>No pending requests.</div>
                : requests.map(req => (
                  <div key={req.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(245,240,232,0.05)' }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '1rem', fontWeight: 600, color: 'var(--off-white)' }}>{req.full_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(245,240,232,0.35)', marginTop: 2 }}>
                        {req.email}{req.referred_by && ` · Referred by: ${req.referred_by}`}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(245,240,232,0.25)', marginTop: 2 }}>
                        Submitted: {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div className="field" style={{ marginBottom: 0, minWidth: 90 }}>
                        <label>Wager $</label>
                        <input type="number" placeholder="0" min={1} max={20} style={{ width: '100%' }} value={requestAmounts[req.id] || ''} onChange={e => setRequestAmounts(p => ({ ...p, [req.id]: e.target.value }))} />
                      </div>
                      <div className="field" style={{ marginBottom: 0, minWidth: 110 }}>
                        <label>Pick</label>
                        <select style={{ width: '100%' }} value={requestPicks[req.id] || 'rousey'} onChange={e => setRequestPicks(p => ({ ...p, [req.id]: e.target.value as PickType }))}>
                          <option value="rousey">Rousey</option>
                          <option value="carano">Carano</option>
                        </select>
                      </div>
                      <button className="btn-sm btn-approve" onClick={() => approveRequest(req)}>✓ Approve</button>
                      <button className="btn-sm btn-deny" onClick={() => denyRequest(req)}>✗ Deny</button>
                    </div>
                  </div>
                ))
            }
            <div style={{ padding: '0.875rem 1.25rem', fontSize: '0.72rem', color: 'rgba(245,240,232,0.25)', lineHeight: 1.6, borderTop: '1px solid rgba(245,240,232,0.05)' }}>
              Set amount and pick, then approve. After approving, go to Invite tab to send login link.
            </div>
          </div>
        )}

        {/* ── ALL WAGERS ── */}
        {tab === 'wagers' && (
          <div style={panel}>
            <div style={panelHeader}>
              <div style={panelTitle}>All Confirmed Wagers</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.35)' }}>{wagers.length} accounts · ${totalPool.toLocaleString()} total</div>
            </div>
            {loadingWagers
              ? <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(245,240,232,0.3)', fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: '0.1em' }}>Loading...</div>
              : <WagerTable wagers={wagers} onUpdate={updateWager} onDelete={deleteWager} />
            }
          </div>
        )}

        {/* ── PENDING MEMBERS ── */}
        {tab === 'members' && (
          <>
            {/* Pending reservations */}
            <div style={panel}>
              <div style={panelHeader}>
                <div style={panelTitle}>Invited — Awaiting Signup</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.35)' }}>{pendingReservations.length} pending</div>
              </div>
              {pendingReservations.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(245,240,232,0.3)', fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: '0.1em' }}>None pending.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                    <thead>
                      <tr>
                        {['Name', 'Email', 'Pick', 'Amount', 'Status', ''].map(h => (
                          <th key={h} style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.25)', padding: '0.7rem 1rem', borderBottom: '1px solid rgba(245,240,232,0.07)', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingReservations.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(245,240,232,0.04)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.92rem', fontWeight: 600, color: 'var(--off-white)' }}>{r.full_name}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'rgba(245,240,232,0.35)', fontSize: '0.78rem' }}>{r.email}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.85rem', color: r.pick === 'rousey' ? '#60a5fa' : '#f87171', fontWeight: 600 }}>{r.pick === 'rousey' ? 'Rousey' : 'Carano'}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>${Number(r.amount).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem 1rem' }}><span className="pill pill-pending">Awaiting signup</span></td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <button className="btn-sm btn-deny" onClick={() => cancelReservation(r.id, r.full_name)}>Cancel</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* All profiles */}
            <div style={panel}>
              <div style={panelHeader}>
                <div style={panelTitle}>All User Accounts</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.35)' }}>{allProfiles.length} accounts</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Role', 'Status', 'Joined'].map(h => (
                        <th key={h} style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.25)', padding: '0.7rem 1rem', borderBottom: '1px solid rgba(245,240,232,0.07)', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allProfiles.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(245,240,232,0.04)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.92rem', fontWeight: 600, color: 'var(--off-white)' }}>{p.full_name}</td>
                        <td style={{ padding: '0.75rem 1rem', color: 'rgba(245,240,232,0.45)', fontSize: '0.8rem' }}>{p.email}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className={`pill ${p.role === 'admin' ? 'pill-confirmed' : 'pill-pending'}`} style={{ fontSize: '0.6rem' }}>{p.role}</span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className={`pill pill-${p.status === 'approved' ? 'confirmed' : p.status === 'denied' ? 'denied' : 'pending'}`} style={{ fontSize: '0.6rem' }}>{p.status}</span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'rgba(245,240,232,0.35)', fontSize: '0.78rem' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── INVITE ── */}
        {tab === 'invite' && (
          <div style={panel}>
            <div style={panelHeader}>
              <div style={panelTitle}>Invite a New Member</div>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <form onSubmit={sendInvite}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'end', marginBottom: '1rem' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Full name</label>
                    <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jordan Smith" required />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Email</label>
                    <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jordan@email.com" required />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Wager amount ($)</label>
                    <input type="number" value={inviteAmount} onChange={e => setInviteAmount(e.target.value)} placeholder="20" required min="1" max="100" />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Their pick</label>
                    <select value={invitePick} onChange={e => setInvitePick(e.target.value as PickType)}>
                      <option value="rousey">Ronda Rousey</option>
                      <option value="carano">Gina Carano</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' as const, padding: '0.7rem 1.25rem', fontSize: '0.82rem' }} disabled={inviteLoading}>
                    {inviteLoading ? 'Saving...' : 'Save & Generate Link →'}
                  </button>
                </div>
              </form>

              <div style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, padding: '1.25rem', marginTop: '0.5rem' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', letterSpacing: '0.06em', color: 'var(--gold)', marginBottom: '0.75rem' }}>
                  How to send an invite
                </div>
                {[
                  '1. Fill in the form above and click Save. The wager is now reserved.',
                  '2. Go to Supabase Dashboard → Authentication → Users → Invite user.',
                  '3. Enter their email. Supabase sends a magic link automatically.',
                  '4. When they click and sign up, their wager is instantly linked.',
                ].map(s => (
                  <div key={s} style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.6)', letterSpacing: '0.03em', lineHeight: 1.5, marginBottom: '0.4rem' }}>{s}</div>
                ))}

                {generatedLink && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(201,168,76,0.15)' }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.35)', marginBottom: '0.5rem' }}>Login page link</div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180, background: 'rgba(245,240,232,0.05)', border: '1px solid rgba(245,240,232,0.12)', borderRadius: 2, padding: '0.6rem 0.9rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'rgba(245,240,232,0.7)', wordBreak: 'break-all' as const }}>
                        {generatedLink}
                      </div>
                      <button onClick={copyLink} className="btn-sm btn-action" style={{ flexShrink: 0 }}>
                        {copied ? '✓ Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CONTROLS ── */}
        {tab === 'controls' && (
          <>
            {/* Betting lock */}
            <div style={panel}>
              <div style={panelHeader}>
                <div style={panelTitle}>Betting Controls</div>
              </div>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.25rem', background: 'rgba(245,240,232,0.03)', border: '1px solid rgba(245,240,232,0.08)', borderRadius: 4 }}>
                  <div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--off-white)', marginBottom: 4 }}>
                      Betting is currently{' '}
                      <span style={{ color: eventInfo?.betting_locked ? 'var(--red)' : '#4ade80' }}>
                        {eventInfo?.betting_locked ? 'LOCKED' : 'OPEN'}
                      </span>
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.75rem', color: 'rgba(245,240,232,0.4)' }}>
                      {eventInfo?.betting_locked ? 'Users cannot edit wagers.' : 'Users can edit their wager amount and pick.'}
                    </div>
                  </div>
                  <button
                    className={eventInfo?.betting_locked ? 'btn-sm btn-approve' : 'btn-sm btn-deny'}
                    onClick={toggleBettingLock}
                    style={{ minWidth: 140 }}
                  >
                    {eventInfo?.betting_locked ? '✓ Re-open Betting' : '🔒 Lock Betting'}
                  </button>
                </div>

                {/* Set winner */}
                <div style={{ padding: '1rem 1.25rem', background: 'rgba(245,240,232,0.03)', border: `1px solid ${eventInfo?.winner ? 'rgba(74,222,128,0.2)' : 'rgba(245,240,232,0.08)'}`, borderRadius: 4 }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--off-white)', marginBottom: 4 }}>
                    Record Fight Result
                  </div>
                  {eventInfo?.winner ? (
                    <div>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem', color: '#4ade80', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                        🏆 Winner: {eventInfo.winner === 'rousey' ? 'Ronda Rousey' : 'Gina Carano'}
                      </div>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.78rem', color: 'rgba(245,240,232,0.4)', marginBottom: '0.875rem' }}>
                        Betting is locked. Pay out all winners and mark settled below.
                      </div>
                      {eventInfo?.payout_settled ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 2, fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: '#4ade80' }}>
                          ✓ Payouts settled
                        </div>
                      ) : (
                        <button className="btn-sm btn-approve" onClick={markPayoutSettled} disabled={payoutSettling} style={{ padding: '0.5rem 1.25rem' }}>
                          {payoutSettling ? 'Saving...' : '💰 Mark Payouts Settled'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.75rem', color: 'rgba(245,240,232,0.4)', marginBottom: '0.75rem' }}>
                        This locks betting and records the official result. <strong style={{ color: 'var(--red)' }}>This cannot be undone.</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <button className="btn-sm" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', padding: '0.5rem 1.25rem' }} onClick={() => setWinner('rousey')}>
                          🥊 Rousey Wins
                        </button>
                        <button className="btn-sm" style={{ background: 'rgba(200,16,46,0.1)', color: 'var(--red)', border: '1px solid rgba(200,16,46,0.3)', padding: '0.5rem 1.25rem' }} onClick={() => setWinner('carano')}>
                          🥊 Carano Wins
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Admin's own wager */}
            <div style={panel}>
              <div style={panelHeader}>
                <div style={panelTitle}>My Wager</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.35)' }}>Set your own wager in the pool</div>
              </div>
              <div style={{ padding: '1.5rem' }}>
                {/* Show current wager if exists */}
                {(() => {
                  const myWager = wagers.find(w => w.profiles?.email?.toLowerCase() === user?.email?.toLowerCase())
                  if (myWager) {
                    return (
                      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.6)' }}>
                        Current wager: <span style={{ color: myWager.pick === 'rousey' ? '#60a5fa' : '#f87171', fontWeight: 700 }}>{myWager.pick === 'rousey' ? 'Rousey' : 'Carano'}</span> · <span style={{ color: 'var(--gold)', fontWeight: 700 }}>${Number(myWager.amount).toLocaleString()}</span> · <span className={`pill pill-${myWager.status}`} style={{ fontSize: '0.6rem' }}>{myWager.status}</span>
                      </div>
                    )
                  }
                  return null
                })()}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Pick</label>
                    <select value={adminWagerPick} onChange={e => setAdminWagerPick(e.target.value as PickType)}>
                      <option value="rousey">Ronda Rousey</option>
                      <option value="carano">Gina Carano</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Amount ($)</label>
                    <input type="number" placeholder="100" min="1" max="100" value={adminWagerAmount} onChange={e => setAdminWagerAmount(e.target.value)} />
                  </div>
                  <button className="btn-sm btn-action" onClick={saveAdminWager} disabled={adminWagerSaving} style={{ padding: '0.7rem 1rem' }}>
                    {adminWagerSaving ? 'Saving...' : '💾 Save My Wager'}
                  </button>
                </div>
                <div style={{ marginTop: '0.6rem', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.25)', lineHeight: 1.5 }}>
                  Max $100 (admin limit). Saves directly to your user account and appears in the pool.
                </div>
              </div>
            </div>

                        {/* Manual pool adjustment */}
            <div style={panel}>
              <div style={panelHeader}>
                <div style={panelTitle}>Manual Pool Adjustment</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.35)' }}>Set or update a wager for any existing member</div>
              </div>
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', alignItems: 'end', marginBottom: '0.75rem' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Member Email</label>
                    <input type="email" placeholder="member@email.com" value={poolAdjustEmail} onChange={e => setPoolAdjustEmail(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Display Name (optional)</label>
                    <input type="text" placeholder="Leave blank to use profile name" value={poolAdjustName} onChange={e => setPoolAdjustName(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Amount ($)</label>
                    <input type="number" placeholder="20" min="1" value={poolAdjustAmount} onChange={e => setPoolAdjustAmount(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Pick</label>
                    <select value={poolAdjustPick} onChange={e => setPoolAdjustPick(e.target.value as PickType)}>
                      <option value="rousey">Rousey</option>
                      <option value="carano">Carano</option>
                    </select>
                  </div>
                  <button className="btn-sm btn-action" onClick={addManualPoolEntry} disabled={poolAdjustSaving} style={{ padding: '0.7rem 1rem' }}>
                    {poolAdjustSaving ? 'Saving...' : '+ Set Wager'}
                  </button>
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.25)', lineHeight: 1.5 }}>
                  Looks up the member by email and creates or updates their wager directly on their account.
                </div>
              </div>
            </div>

            {/* Event info summary */}
            <div style={panel}>
              <div style={panelHeader}>
                <div style={panelTitle}>Event Info</div>
              </div>
              {eventInfo && (
                <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1rem' }}>
                  {[
                    ['Fight', eventInfo.fight_name],
                    ['Date', new Date(eventInfo.fight_date).toLocaleDateString()],
                    ['Venue', eventInfo.venue],
                    ['Broadcast', eventInfo.broadcast],
                    ['Rousey odds', eventInfo.rousey_odds],
                    ['Carano odds', eventInfo.carano_odds],
                    ['Winner', eventInfo.winner || 'TBD'],
                    ['Betting', eventInfo.betting_locked ? 'Locked' : 'Open'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>{k}</div>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.9rem', color: 'var(--off-white)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── CHANGE REQUESTS ── */}
        {tab === 'requests' && (
          <div style={panel}>
            <div style={panelHeader}>
              <div style={panelTitle}>Member Wager Change Requests</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.35)' }}>
                {pendingChangeRequests.length} pending · {changeRequests.length} total
              </div>
            </div>
            {loadingChangeRequests ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(245,240,232,0.3)', fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: '0.1em' }}>Loading...</div>
            ) : changeRequests.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.3)', letterSpacing: '0.1em' }}>No change requests yet.</div>
            ) : (
              <div style={{ padding: '0.5rem 1.25rem 1.5rem' }}>
                {/* Pending first */}
                {pendingChangeRequests.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '0.75rem' }}>Awaiting Action</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {pendingChangeRequests.map(req => (
                        <div key={req.id} style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, padding: '1rem 1.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.875rem' }}>
                            <div>
                              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.95rem', fontWeight: 700, color: 'var(--off-white)', marginBottom: 2 }}>{req.profiles?.full_name}</div>
                              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.35)' }}>{req.profiles?.email} · {new Date(req.created_at).toLocaleDateString()}</div>
                            </div>
                            <span className="pill pill-pending" style={{ fontSize: '0.6rem' }}>⏳ Pending</span>
                          </div>

                          {/* Change details */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.75rem', marginBottom: req.reason ? '0.875rem' : '1rem', padding: '0.875rem', background: 'rgba(245,240,232,0.03)', borderRadius: 3 }}>
                            <div>
                              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>Current Pick</div>
                              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', letterSpacing: '0.05em', color: req.current_pick === 'rousey' ? '#60a5fa' : '#f87171' }}>{req.current_pick === 'rousey' ? 'Rousey' : 'Carano'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(245,240,232,0.2)' }}>→</div>
                            <div>
                              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>Requested Pick</div>
                              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', letterSpacing: '0.05em', color: req.requested_pick === 'rousey' ? '#60a5fa' : '#f87171' }}>{req.requested_pick === 'rousey' ? 'Rousey' : 'Carano'}</div>
                            </div>
                            <div>
                              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>Current Amount</div>
                              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', color: 'var(--off-white)', letterSpacing: '0.05em' }}>${Number(req.current_amount).toLocaleString()}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(245,240,232,0.2)' }}>→</div>
                            <div>
                              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.3)', marginBottom: 3 }}>Requested Amount</div>
                              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>${Number(req.requested_amount).toLocaleString()}</div>
                            </div>
                          </div>

                          {req.reason && (
                            <div style={{ marginBottom: '1rem', padding: '0.65rem 0.875rem', background: 'rgba(245,240,232,0.03)', border: '1px solid rgba(245,240,232,0.06)', borderRadius: 3, fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.5)', fontStyle: 'italic' }}>
                              "{req.reason}"
                            </div>
                          )}

                          {/* Deny response input + action buttons */}
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              placeholder="Optional denial reason..."
                              value={denyResponseMap[req.id] || ''}
                              onChange={e => setDenyResponseMap(prev => ({ ...prev, [req.id]: e.target.value }))}
                              style={{ flex: 1, minWidth: 160, background: 'rgba(245,240,232,0.05)', border: '1px solid rgba(245,240,232,0.1)', borderRadius: 2, color: 'var(--off-white)', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.82rem', padding: '0.5rem 0.75rem', outline: 'none' }}
                            />
                            <button className="btn-sm btn-deny" onClick={() => denyChangeRequest(req)} style={{ whiteSpace: 'nowrap' }}>✕ Deny</button>
                            <button className="btn-sm btn-approve" onClick={() => approveChangeRequest(req)} style={{ whiteSpace: 'nowrap' }}>✓ Approve & Apply</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolved requests */}
                {changeRequests.filter(r => r.status !== 'pending').length > 0 && (
                  <div style={{ marginTop: pendingChangeRequests.length > 0 ? '1.5rem' : '1rem' }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.3)', marginBottom: '0.75rem' }}>Resolved</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                        <thead>
                          <tr>
                            {['Member', 'Requested', 'Status', 'Admin Response', 'Date'].map(h => (
                              <th key={h} style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.25)', padding: '0.6rem 0.875rem', borderBottom: '1px solid rgba(245,240,232,0.07)', textAlign: 'left' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {changeRequests.filter(r => r.status !== 'pending').map(req => (
                            <tr key={req.id} style={{ borderBottom: '1px solid rgba(245,240,232,0.04)' }}>
                              <td style={{ padding: '0.65rem 0.875rem', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.88rem', fontWeight: 600, color: 'var(--off-white)' }}>{req.profiles?.full_name}</td>
                              <td style={{ padding: '0.65rem 0.875rem', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.5)' }}>
                                <span style={{ color: req.requested_pick === 'rousey' ? '#60a5fa' : '#f87171', fontWeight: 600 }}>{req.requested_pick === 'rousey' ? 'Rousey' : 'Carano'}</span> · <span style={{ color: 'var(--gold)' }}>${Number(req.requested_amount).toLocaleString()}</span>
                              </td>
                              <td style={{ padding: '0.65rem 0.875rem' }}>
                                <span className={`pill pill-${req.status === 'approved' ? 'confirmed' : 'denied'}`} style={{ fontSize: '0.6rem' }}>{req.status}</span>
                              </td>
                              <td style={{ padding: '0.65rem 0.875rem', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.78rem', color: 'rgba(245,240,232,0.35)', fontStyle: req.admin_response ? 'italic' : 'normal' }}>{req.admin_response || '—'}</td>
                              <td style={{ padding: '0.65rem 0.875rem', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.75rem', color: 'rgba(245,240,232,0.3)', whiteSpace: 'nowrap' }}>{new Date(req.updated_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* ── Winner Confirmation Modal ── */}
    {winnerModalOpen && winnerModalPick && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setWinnerModalOpen(false)}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--dark-gray)', border: `2px solid ${winnerModalPick === 'rousey' ? 'rgba(96,165,250,0.4)' : 'rgba(200,16,46,0.4)'}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(245,240,232,0.08)', background: winnerModalPick === 'rousey' ? 'rgba(96,165,250,0.07)' : 'rgba(200,16,46,0.07)' }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.4rem', letterSpacing: '0.08em', color: winnerModalPick === 'rousey' ? '#60a5fa' : 'var(--red)' }}>
              🏆 Confirm Fight Result
            </div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.72rem', letterSpacing: '0.1em', color: 'rgba(245,240,232,0.4)', marginTop: 3 }}>
              This action cannot be undone
            </div>
          </div>
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.95rem', color: 'rgba(245,240,232,0.7)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              You are about to declare <strong style={{ color: winnerModalPick === 'rousey' ? '#60a5fa' : '#f87171', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.05rem', letterSpacing: '0.05em' }}>
                {winnerModalPick === 'rousey' ? 'Ronda Rousey' : 'Gina Carano'}
              </strong> as the winner.
            </div>
            <div style={{ padding: '0.875rem 1rem', background: 'rgba(200,16,46,0.06)', border: '1px solid rgba(200,16,46,0.2)', borderRadius: 3, fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.8rem', color: 'rgba(245,240,232,0.5)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              ⚠️ This will immediately lock betting for all members and record the official result. Only do this once the fight is confirmed.
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn-outline" style={{ flex: 1, padding: '0.75rem' }} onClick={() => { setWinnerModalOpen(false); setWinnerModalPick(null) }}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ flex: 2, padding: '0.75rem', background: winnerModalPick === 'rousey' ? '#60a5fa' : 'var(--red)', color: '#fff' }}
                onClick={confirmSetWinner}
              >
                ✓ Confirm — {winnerModalPick === 'rousey' ? 'Rousey' : 'Carano'} Wins
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function WagerTable({ wagers, onUpdate, onDelete }: {
  wagers: WagerWithProfile[]
  onUpdate: (id: string, amount: number, pick: PickType, status: string) => void
  onDelete: (id: string, name: string) => void
}) {
  type EditState = { amount: string; pick: PickType; status: string }
  const [edits, setEdits] = useState<Record<string, EditState>>({})

  function getEdit(w: WagerWithProfile): EditState {
    return edits[w.id] || { amount: String(w.amount), pick: w.pick, status: w.status }
  }

  function setEdit(id: string, field: keyof EditState, val: string) {
    setEdits(prev => ({ ...prev, [id]: { ...getEdit({ id } as WagerWithProfile), [field]: val } }))
  }

  if (wagers.length === 0) return (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.3)', letterSpacing: '0.1em' }}>No wagers yet.</div>
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
        <thead>
          <tr>
            {['Member', 'Email', 'Pick', 'Amount', 'Status', 'Save', 'Remove'].map(h => (
              <th key={h} style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(245,240,232,0.25)', padding: '0.7rem 1rem', borderBottom: '1px solid rgba(245,240,232,0.07)', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wagers.map(w => {
            const e = getEdit(w)
            const initials = (w.profiles?.full_name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase()
            return (
              <tr key={w.id} style={{ borderBottom: '1px solid rgba(245,240,232,0.04)' }}>
                <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.62rem', fontWeight: 700, background: 'rgba(201,168,76,0.12)', color: 'var(--gold)', flexShrink: 0 }}>{initials}</div>
                    <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.9rem', fontWeight: 600, color: 'var(--off-white)' }}>{w.profiles?.full_name || 'Unknown'}</span>
                  </div>
                </td>
                <td style={{ padding: '0.875rem 1rem', color: 'rgba(245,240,232,0.35)', fontSize: '0.76rem' }}>{w.profiles?.email || '—'}</td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <select value={e.pick} onChange={ev => setEdit(w.id, 'pick', ev.target.value)}
                    style={{ background: 'rgba(245,240,232,0.05)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 2, color: e.pick === 'rousey' ? '#60a5fa' : '#f87171', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.82rem', padding: '0.3rem 0.55rem', outline: 'none' }}>
                    <option value="rousey">Rousey</option>
                    <option value="carano">Carano</option>
                  </select>
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <input type="number" value={e.amount} onChange={ev => setEdit(w.id, 'amount', ev.target.value)}
                    style={{ width: 85, background: 'rgba(245,240,232,0.05)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 2, color: 'var(--gold)', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', letterSpacing: '0.05em', padding: '0.3rem 0.55rem', outline: 'none' }} />
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <select value={e.status} onChange={ev => setEdit(w.id, 'status', ev.target.value)}
                    style={{ background: 'rgba(245,240,232,0.05)', border: '1px solid rgba(245,240,232,0.12)', borderRadius: 2, color: 'var(--off-white)', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '0.82rem', padding: '0.3rem 0.55rem', outline: 'none' }}>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <button className="btn-sm btn-action" onClick={() => onUpdate(w.id, parseFloat(e.amount) || 0, e.pick, e.status)}>Save</button>
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <button className="btn-sm btn-deny" onClick={() => onDelete(w.id, w.profiles?.full_name || 'this user')}>✕</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
