export type Pick = 'rousey' | 'carano'
export type WagerStatus = 'pending' | 'confirmed' | 'cancelled'
export type UserRole = 'admin' | 'member'
export type UserStatus = 'pending' | 'approved' | 'denied'
export type RequestStatus = 'pending' | 'approved' | 'denied'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface Wager {
  id: string
  user_id: string
  pick: Pick
  amount: number
  status: WagerStatus
  admin_notes?: string
  created_at: string
  updated_at: string
}

export interface WagerReservation {
  id: string
  full_name: string
  email: string
  pick: Pick
  amount: number
  status: WagerStatus
  fulfilled_user_id?: string | null
  created_at: string
  updated_at: string
}

export interface WagerPoolEntry {
  id: string
  full_name: string
  pick: Pick
  amount: number
  status: WagerStatus
}

export interface AccessRequest {
  id: string
  full_name: string
  email: string
  referred_by?: string
  status: RequestStatus
  created_at: string
}

export interface EventInfo {
  id: number
  fight_name: string
  fight_date: string
  venue: string
  broadcast: string
  rousey_odds: string
  carano_odds: string
  result?: string
  winner?: Pick
  betting_locked: boolean
  payout_settled?: boolean
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'>; Update: Partial<Profile> }
      wagers: { Row: Wager; Insert: Omit<Wager, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Wager> }
      wager_reservations: { Row: WagerReservation; Insert: Omit<WagerReservation, 'id' | 'created_at' | 'updated_at'>; Update: Partial<WagerReservation> }
      access_requests: { Row: AccessRequest; Insert: Omit<AccessRequest, 'id' | 'created_at'>; Update: Partial<AccessRequest> }
      event_info: { Row: EventInfo; Insert: Partial<EventInfo>; Update: Partial<EventInfo> }
    }
    Views: {
      wager_pool: { Row: WagerPoolEntry }
    }
  }
}

// Constants
export const ADMIN_EMAIL = 'goldeneric0807@gmail.com'
export const MAX_WAGER_MEMBER = 20
export const MIN_WAGER = 1
export const MAX_WAGER_ADMIN = 100

export type ChangeRequestStatus = 'pending' | 'approved' | 'denied'

export interface WagerChangeRequest {
  id: string
  user_id: string
  current_pick: Pick
  current_amount: number
  requested_pick: Pick
  requested_amount: number
  reason?: string
  status: ChangeRequestStatus
  admin_response?: string
  created_at: string
  updated_at: string
}
