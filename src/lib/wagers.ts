import { supabase } from './supabase'
import type { WagerPoolEntry } from '../types/database'

export function payoutFor(amount: number, pick: 'rousey' | 'carano', pool: WagerPoolEntry[]) {
  const totalRousey = pool.filter(w => w.pick === 'rousey').reduce((s, w) => s + Number(w.amount), 0)
  const totalCarano = pool.filter(w => w.pick === 'carano').reduce((s, w) => s + Number(w.amount), 0)
  const winningSide = pick === 'rousey' ? totalRousey : totalCarano
  const losingSide = pick === 'rousey' ? totalCarano : totalRousey
  if (winningSide <= 0) return amount
  return amount + (amount / winningSide) * losingSide
}

export async function loadPublicPool() {
  const { data, error } = await supabase.from('wager_pool').select('*')
  if (error) throw error
  return (data || []) as WagerPoolEntry[]
}
