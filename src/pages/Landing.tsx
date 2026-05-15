import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RousseyFighter, CaranoFighter } from '../components/FighterSVG'
import styles from './Landing.module.css'
import { supabase } from '../lib/supabase'
import type { WagerPoolEntry } from '../types/database'

const ODDS_API_KEY = 'd5768e5020e913a9034b80cfa7e298d3'
const ODDS_FALLBACK = { rousey: '-535', carano: '+400' }

async function fetchLiveOdds(): Promise<{ rousey: string; carano: string }> {
  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=american`
    )
    if (!res.ok) return ODDS_FALLBACK
    const events = await res.json()

    const fight = events.find((e: any) =>
      [e.home_team, e.away_team].some((t: string) => t.toLowerCase().includes('rousey')) &&
      [e.home_team, e.away_team].some((t: string) => t.toLowerCase().includes('carano'))
    )
    if (!fight) return ODDS_FALLBACK

    const totals: Record<string, number[]> = {}
    for (const bm of fight.bookmakers) {
      for (const market of bm.markets) {
        if (market.key !== 'h2h') continue
        for (const outcome of market.outcomes) {
          const key = outcome.name.toLowerCase().includes('rousey') ? 'rousey' : 'carano'
          if (!totals[key]) totals[key] = []
          totals[key].push(outcome.price)
        }
      }
    }

    const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
    const fmt = (n: number) => n > 0 ? `+${n}` : `${n}`

    return {
      rousey: totals.rousey?.length ? fmt(avg(totals.rousey)) : ODDS_FALLBACK.rousey,
      carano: totals.carano?.length ? fmt(avg(totals.carano)) : ODDS_FALLBACK.carano,
    }
  } catch {
    return ODDS_FALLBACK
  }
}

const FIGHTS = [
  { div: "Women's Featherweight", a: 'Ronda Rousey', aRec: '12–2', b: 'Gina Carano', bRec: '7–1', main: true },
  { div: 'Heavyweight', a: 'Francis Ngannou', aRec: '18–3', b: 'Philipe Lins', bRec: '18–5' },
  { div: 'Welterweight', a: 'Nate Diaz', aRec: '21–13', b: 'Mike Perry', bRec: '14–8' },
  { div: 'Featherweight', a: 'Salahdine Parnasse', aRec: '22–2', b: 'Kenneth Cross', bRec: '17–4' },
  { div: 'Heavyweight', a: 'Junior dos Santos', aRec: '22–9', b: 'Robelis Despaigne', bRec: '12–3' },
  { div: 'Flyweight', a: 'Muhammad Mokaev', aRec: '12–1', b: 'Adriano Moraes', bRec: '21–5' },
]

const RULES = [
  {
    num: '01',
    title: 'Invitation Only',
    body: 'This is a private pool. You must be invited and approved by the admin to participate. All wager amounts are set and locked by the admin — you cannot change your own amount.',
  },
  {
    num: '02',
    title: 'Pick Your Fighter',
    body: 'Each member picks either Ronda Rousey or Gina Carano. Your pick and wager amount are confirmed by the admin before the fight. No changes after confirmation.',
  },
  {
    num: '03',
    title: 'How Payouts Work',
    body: 'All wagers go into a single pot. The losing side\'s total is distributed to winners proportionally — each winner gets their original wager back plus their share of the losers\' money based on how much they wagered relative to the total winning side.',
  },
  {
    num: '04',
    title: 'Payout Formula',
    body: 'Winner\'s payout = Your wager + (Your wager ÷ Total on your side) × Total on losing side. The more you wagered relative to your fellow winners, the larger your share of the pot.',
  },
  {
    num: '05',
    title: 'Fight Night',
    body: 'The fight streams live on Netflix on Saturday May 16, 2026 at 9 PM ET from Intuit Dome in Inglewood, CA. Results are official once announced. Payouts are settled by the admin within 24 hours of the result.',
  },
  {
    num: '06',
    title: 'New Members',
    body: 'New members may join at any time before the fight. All new entries must be approved by the admin and wager amounts confirmed. The more members that join, the larger the total pot grows for everyone.',
  },
]

export default function Landing() {
  const navigate = useNavigate()

  const daysLeft = Math.max(0, Math.ceil(
    (new Date('2026-05-16T21:00:00').getTime() - Date.now()) / 86400000
  ))

  const [pool, setPool] = useState<WagerPoolEntry[]>([])
  const [poolLoading, setPoolLoading] = useState(true)
  const [odds, setOdds] = useState(ODDS_FALLBACK)

  useEffect(() => {
    async function loadPool() {
      const { data } = await supabase.from('wager_pool').select('*')
      setPool((data as WagerPoolEntry[]) || [])
      setPoolLoading(false)
    }

    loadPool()

    // Fetch live odds on mount, refresh every 5 minutes
    fetchLiveOdds().then(setOdds)
    const oddsInterval = window.setInterval(() => fetchLiveOdds().then(setOdds), 5 * 60 * 1000)

    const channel = supabase
      .channel('landing-live-wagers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wagers' }, loadPool)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wager_reservations' }, loadPool)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadPool)
      .subscribe()

    const interval = window.setInterval(loadPool, 15000)

    return () => {
      window.clearInterval(interval)
      window.clearInterval(oddsInterval)
      supabase.removeChannel(channel)
    }
  }, [])

  const totalPot = pool.reduce((s, m) => s + Number(m.amount), 0)
  const totalRousey = pool.filter(m => m.pick === 'rousey').reduce((s, m) => s + Number(m.amount), 0)
  const totalCarano = pool.filter(m => m.pick === 'carano').reduce((s, m) => s + Number(m.amount), 0)

  function calcPayout(amount: number, side: 'rousey' | 'carano') {
    const winningSide = side === 'rousey' ? totalRousey : totalCarano
    const losingSide = side === 'rousey' ? totalCarano : totalRousey
    if (winningSide <= 0) return amount
    return amount + (amount / winningSide) * losingSide
  }

  return (
    <div>
      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroBg} />
        <div className={styles.heroGrain} />
        <div className={styles.heroDivider} />

        <div className={styles.fighterLeft}>
          <RousseyFighter />
        </div>

        <div className={styles.heroCenter}>
          <div className={`${styles.eyebrow} fade-up`}>MVP MMA 1 · Netflix · May 16, 2026</div>
          <div className={styles.names}>
            <span className={`${styles.nameWhite} fade-up delay-1`}>ROUSEY</span>
            <span className={`${styles.vs} fade-up delay-2`}>— vs —</span>
            <span className={`${styles.nameRed} fade-up delay-3`}>CARANO</span>
          </div>
          <div className={`${styles.meta} fade-up delay-4`}>
            <span className={styles.metaDate}>Intuit Dome · Inglewood, CA</span>
            <div className={styles.liveBadge}>
              <span className={styles.liveDot} />
              Live on Netflix
            </div>
          </div>
        </div>

        <div className={styles.fighterRight}>
          <CaranoFighter />
        </div>

        <div className={styles.scrollHint}>
          <span>Scroll</span>
          <div className={styles.scrollLine} />
        </div>
      </section>

      {/* TICKER */}
      <div className={styles.ticker}>
        <div className={styles.tickerLabel}>MVP MMA 1</div>
        <div className={styles.tickerDivider} />
        <div className={styles.tickerTrack}>
          <div className={styles.tickerItems}>
            {[
              `Rousey ${odds.rousey} · Carano ${odds.carano}`,
              'May 16 2026 · Intuit Dome LA',
              '5 × 5-min rounds · 145 lbs',
              'Nate Diaz vs Mike Perry',
              'Francis Ngannou vs Philipe Lins',
              'Live on Netflix · 9 PM ET',
              `Rousey ${odds.rousey} · Carano ${odds.carano}`,
              'May 16 2026 · Intuit Dome LA',
              '5 × 5-min rounds · 145 lbs',
              'Nate Diaz vs Mike Perry',
              'Francis Ngannou vs Philipe Lins',
              'Live on Netflix · 9 PM ET',
            ].map((t, i) => (
              <span key={i} className={styles.tickerItem}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* TALE OF THE TAPE */}
      <section className={styles.tapeSection}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <span className="section-eyebrow">Official Stats</span>
          <div className="section-heading">Tale of the Tape</div>
        </div>
        <div className={styles.tapeGrid}>
          <div className={styles.tapeFighter}>
            <div className={styles.tapeName} style={{ color: 'var(--off-white)' }}>Ronda Rousey</div>
            <div className={styles.tapeRecord}>Record: 12 Wins · 2 Losses</div>
            {[["5'6\"", 'Height'], ['135 lbs', 'Weight'], ['66.0"', 'Reach'], ['39', 'Age'], ['9', 'Sub wins'], ['Judo / BJJ', 'Style']].map(([v, k]) => (
              <div key={k} className={styles.tapeStat}>
                <span className={styles.tapeVal}>{v}</span>
                <span className={styles.tapeKey}>{k}</span>
              </div>
            ))}
            <div className={styles.tapeOdds} style={{ color: '#4ade80' }}>{odds.rousey}</div>
          </div>

          <div className={styles.tapeCenter}>
            <div className={styles.tapeVsBig}>VS</div>
            <div className={styles.tapeCenterStats}>
              <span style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.7rem', letterSpacing: '0.15em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase' }}>145 lbs · Featherweight</span>
              <span style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.7rem', letterSpacing: '0.15em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase', marginTop: '0.5rem' }}>5 rounds · 5 min each</span>
              <div style={{ width: 40, height: 1, background: 'rgba(201,168,76,0.2)', margin: '1rem auto' }} />
              <span style={{ fontFamily: "'Bebas Neue'", fontSize: '2rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>{daysLeft}</span>
              <span style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.7rem', letterSpacing: '0.15em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase' }}>Days away</span>
            </div>
          </div>

          <div className={`${styles.tapeFighter} ${styles.tapeFighterRight}`}>
            <div className={styles.tapeName} style={{ color: 'var(--red)' }}>Gina Carano</div>
            <div className={styles.tapeRecord}>Record: 7 Wins · 1 Loss</div>
            {[["5'8\"", 'Height'], ['143 lbs', 'Weight'], ['66.5"', 'Reach'], ['43', 'Age'], ['3', 'KO wins'], ['Muay Thai', 'Style']].map(([v, k]) => (
              <div key={k} className={`${styles.tapeStat} ${styles.tapeStatRight}`}>
                <span className={styles.tapeKey}>{k}</span>
                <span className={styles.tapeVal}>{v}</span>
              </div>
            ))}
            <div className={styles.tapeOdds} style={{ color: 'var(--red)', textAlign: 'right' }}>{odds.carano}</div>
          </div>
        </div>
      </section>

      {/* BIOS */}
      <section className={styles.bioSection}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <span className="section-eyebrow">The Fighters</span>
          <div className="section-heading">Pioneers Return</div>
        </div>
        <div className={styles.bioGrid}>
          <div>
            <div className={styles.bioName} style={{ color: 'var(--off-white)' }}>Ronda Rousey</div>
            <div className={styles.bioRecord}>12–2 · Bantamweight Legend · Olympic Bronze Medalist</div>
            <p className={styles.bioText}>The woman who opened the door for women in the UFC. An Olympic judo medalist who turned her mat dominance into a lightning-in-a-bottle run at the top of women's MMA. Six consecutive UFC title defenses. A household name. Now, nearly a decade after her last fight, she returns to settle unfinished business.</p>
            <div className={styles.bioFacts}>
              {[['9', 'Sub wins'], ['6', 'UFC defenses'], ['2012', 'Pro debut']].map(([v, l]) => (
                <div key={l}><div className={styles.bioFactVal}>{v}</div><div className={styles.bioFactLabel}>{l}</div></div>
              ))}
            </div>
          </div>
          <div>
            <div className={styles.bioName} style={{ color: 'var(--red)' }}>Gina Carano</div>
            <div className={styles.bioRecord}>7–1 · WMMA Pioneer · The Original Star</div>
            <p className={styles.bioText}>Before Ronda, there was Gina. The original face of women's MMA, Carano was a mainstream star before the sport even had a mainstream stage. After 17 years away — acting in Fast & Furious, Deadpool, and Star Wars — she steps back into the cage for one last defining moment.</p>
            <div className={styles.bioFacts}>
              {[['3', 'KO wins'], ['17yr', 'Layoff'], ['2006', 'Pro debut']].map(([v, l]) => (
                <div key={l}><div className={styles.bioFactVal}>{v}</div><div className={styles.bioFactLabel}>{l}</div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* WAGER RULES */}
      <section className={styles.rulesSection}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <span className="section-eyebrow">Private Pool</span>
          <div className="section-heading">How the Wager Works</div>
        </div>

        <div className={styles.rulesGrid}>
          {RULES.map((r) => (
            <div key={r.num} className={styles.ruleCard}>
              <div className={styles.ruleNum}>{r.num}</div>
              <div className={styles.ruleTitle}>{r.title}</div>
              <div className={styles.ruleBody}>{r.body}</div>
            </div>
          ))}
        </div>

        {/* PAYOUT EXAMPLE */}
        <div className={styles.payoutExample}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span className="section-eyebrow">Live Example</span>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: '2rem', letterSpacing: '0.05em', color: 'var(--off-white)' }}>
              Live Pool Breakdown
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.9rem', color: 'rgba(245,240,232,0.4)', letterSpacing: '0.1em', marginTop: '0.4rem' }}>
              Total pot: <span style={{ color: 'var(--gold)' }}>${totalPot.toLocaleString()}</span> · Rousey side: <span style={{ color: '#60a5fa' }}>${totalRousey.toLocaleString()}</span> · Carano side: <span style={{ color: 'var(--red)' }}>${totalCarano.toLocaleString()}</span>
            </div>
          </div>

          <div className={styles.payoutScenarios}>
            {/* If Rousey wins */}
            <div className={styles.payoutScenario}>
              <div className={styles.payoutScenarioHeader} style={{ borderColor: 'rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.05)' }}>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.2rem', letterSpacing: '0.08em', color: '#60a5fa' }}>If Rousey Wins</div>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.75rem', letterSpacing: '0.1em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase' }}>Rousey bettors split ${totalPot.toLocaleString()}</div>
              </div>
              <div className={styles.payoutRows}>
                {poolLoading ? (
                  <div className={styles.payoutRow}><span className={styles.payoutName}>Loading live wagers...</span></div>
                ) : pool.filter(m => m.pick === 'rousey').length === 0 ? (
                  <div className={styles.payoutRow}><span className={styles.payoutName}>No Rousey wagers yet</span></div>
                ) : pool.filter(m => m.pick === 'rousey').map((m) => (
                  <div key={m.id} className={styles.payoutRow}>
                    <span className={styles.payoutName}>{m.full_name}</span>
                    <span className={styles.payoutWagered}>wagered ${m.amount}</span>
                    <span className={styles.payoutArrow}>→</span>
                    <span className={styles.payoutAmount} style={{ color: '#4ade80' }}>${calcPayout(m.amount, 'rousey').toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* If Carano wins */}
            <div className={styles.payoutScenario}>
              <div className={styles.payoutScenarioHeader} style={{ borderColor: 'rgba(200,16,46,0.3)', background: 'rgba(200,16,46,0.05)' }}>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.2rem', letterSpacing: '0.08em', color: 'var(--red)' }}>If Carano Wins</div>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.75rem', letterSpacing: '0.1em', color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase' }}>Carano bettors split ${totalPot.toLocaleString()}</div>
              </div>
              <div className={styles.payoutRows}>
                {poolLoading ? (
                  <div className={styles.payoutRow}><span className={styles.payoutName}>Loading live wagers...</span></div>
                ) : pool.filter(m => m.pick === 'carano').length === 0 ? (
                  <div className={styles.payoutRow}><span className={styles.payoutName}>No Carano wagers yet</span></div>
                ) : pool.filter(m => m.pick === 'carano').map((m) => (
                  <div key={m.id} className={styles.payoutRow}>
                    <span className={styles.payoutName}>{m.full_name}</span>
                    <span className={styles.payoutWagered}>wagered ${m.amount}</span>
                    <span className={styles.payoutArrow}>→</span>
                    <span className={styles.payoutAmount} style={{ color: '#4ade80' }}>${calcPayout(m.amount, 'carano').toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.payoutFormula}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.3)', marginBottom: '0.5rem' }}>The Formula</div>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.1rem', letterSpacing: '0.05em', color: 'var(--gold)' }}>
              Payout = Your Wager + (Your Wager ÷ Total on Your Side) × Total on Losing Side
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.8rem', color: 'rgba(245,240,232,0.4)', marginTop: '0.75rem', lineHeight: 1.6 }}>
              Every winner gets their money back plus a proportional share of the losers' pot. The more you wagered relative to your fellow winners, the bigger your cut. New members joining only makes the pot bigger for everyone.
            </div>
          </div>
        </div>
      </section>

      {/* FIGHT CARD */}
      <section className={styles.cardSection}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span className="section-eyebrow">MVP MMA 1</span>
          <div className="section-heading">Full Fight Card</div>
        </div>
        {FIGHTS.map((f, i) => (
          <div key={i} className={`${styles.fightRow} ${f.main ? styles.fightRowMain : ''}`}>
            {f.main && <div className={styles.mainBadge}>Main Event · Women's Featherweight</div>}
            <div className={styles.fightRowInner}>
              <div>
                <div className={styles.feName}>{f.a}</div>
                <div className={styles.feRecord}>{f.aRec}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                {!f.main && <div className={styles.feDivision}>{f.div}</div>}
                <div className={styles.feVs}>VS</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={styles.feName}>{f.b}</div>
                <div className={styles.feRecord}>{f.bRec}</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaInner}>
          <div className={styles.ctaHeadline}>Who do you have?</div>
          <div className={styles.ctaSub}>Private wager pool · Invitation only · Admin-approved members</div>
          <div className={styles.ctaBtns}>
            <button className="btn-primary" onClick={() => navigate('/login')}>View my wager</button>
            <button className="btn-outline" onClick={() => navigate('/request')}>Request an invite</button>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div style={{ fontFamily: "'Bebas Neue'", fontSize: '1.2rem', letterSpacing: '0.1em', color: 'var(--gold)' }}>Rousey vs Carano</div>
        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: '0.75rem', letterSpacing: '0.08em', color: 'rgba(245,240,232,0.3)', textTransform: 'uppercase' }}>Private Wager Pool · May 16, 2026</div>
      </footer>
    </div>
  )
}
