import { useState } from 'react'

function RousseyFighterSVG() {
  return (
    <svg viewBox="0 0 300 720" xmlns="http://www.w3.org/2000/svg"
      style={{ height: '88vh', maxHeight: 700, width: 'auto', opacity: 0.92 }}>
      <defs>
        <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5F0E8" stopOpacity="0.9"/>
          <stop offset="70%" stopColor="#D4C9B0" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#F5F0E8" stopOpacity="0"/>
        </linearGradient>
        <filter id="glow-r">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>
      <ellipse cx="148" cy="380" rx="90" ry="260" fill="rgba(245,240,232,0.04)" filter="url(#glow-r)"/>
      <path d="M100 580 Q95 650 88 710 L108 712 Q118 660 125 600 Z" fill="url(#gr)"/>
      <path d="M175 580 Q185 650 192 710 L172 712 Q162 660 155 600 Z" fill="url(#gr)"/>
      <path d="M88 490 Q90 540 100 580 L175 580 Q185 540 190 490 Q170 510 138 510 Q108 510 88 490Z" fill="url(#gr)"/>
      <path d="M80 310 Q70 380 80 440 Q90 490 138 500 Q186 490 195 440 Q208 380 195 310 Q175 290 138 288 Q102 290 80 310Z" fill="url(#gr)"/>
      <path d="M80 310 Q50 300 45 280 Q40 255 55 240 Q72 230 85 250 L90 290Z" fill="url(#gr)"/>
      <path d="M195 310 Q225 300 230 280 Q235 255 220 240 Q203 230 190 250 L188 290Z" fill="url(#gr)"/>
      <path d="M45 280 Q20 270 10 255 Q5 245 12 238 L55 240 Z" fill="url(#gr)"/>
      <path d="M220 240 Q238 220 245 205 Q250 195 242 190 L215 200 Z" fill="url(#gr)"/>
      <path d="M118 288 Q120 255 138 248 Q156 255 158 288 Z" fill="url(#gr)"/>
      <ellipse cx="138" cy="220" rx="38" ry="44" fill="url(#gr)"/>
      <rect x="5" y="232" width="32" height="24" rx="6" fill="url(#gr)" opacity="0.8"/>
      <rect x="235" y="183" width="28" height="22" rx="5" fill="url(#gr)" opacity="0.8"/>
    </svg>
  )
}

function CaranoFighterSVG() {
  return (
    <svg viewBox="0 0 300 720" xmlns="http://www.w3.org/2000/svg"
      style={{ height: '88vh', maxHeight: 700, width: 'auto', opacity: 0.92 }}>
      <defs>
        <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C8102E" stopOpacity="0.95"/>
          <stop offset="60%" stopColor="#8B0A1E" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#C8102E" stopOpacity="0"/>
        </linearGradient>
        <filter id="glow-c">
          <feGaussianBlur stdDeviation="10" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>
      <ellipse cx="155" cy="380" rx="90" ry="260" fill="rgba(200,16,46,0.06)" filter="url(#glow-c)"/>
      <path d="M98 575 Q88 645 82 710 L102 712 Q112 660 125 595 Z" fill="url(#gc)"/>
      <path d="M188 575 Q200 645 205 710 L185 712 Q175 660 162 595 Z" fill="url(#gc)"/>
      <path d="M82 485 Q86 535 98 575 L188 575 Q198 535 202 485 Q180 508 145 508 Q112 508 82 485Z" fill="url(#gc)"/>
      <path d="M75 308 Q62 378 75 438 Q88 492 145 502 Q202 492 215 438 Q228 378 215 308 Q194 285 145 284 Q98 285 75 308Z" fill="url(#gc)"/>
      <path d="M75 308 Q44 296 38 272 Q32 248 50 232 Q70 222 84 245 L90 290Z" fill="url(#gc)"/>
      <path d="M215 308 Q246 296 252 272 Q258 248 240 232 Q220 222 206 245 L200 290Z" fill="url(#gc)"/>
      <path d="M38 272 Q15 258 8 240 Q4 228 14 222 L55 232 Z" fill="url(#gc)"/>
      <path d="M252 272 Q270 285 278 278 Q283 268 278 260 L245 250 Z" fill="url(#gc)"/>
      <path d="M122 284 Q124 252 145 244 Q166 252 168 284 Z" fill="url(#gc)"/>
      <ellipse cx="145" cy="216" rx="40" ry="46" fill="url(#gc)"/>
      <rect x="4" y="216" width="34" height="24" rx="6" fill="url(#gc)" opacity="0.85"/>
      <rect x="263" y="253" width="30" height="22" rx="5" fill="url(#gc)" opacity="0.85"/>
    </svg>
  )
}

const fighterImgStyle = (side: 'left' | 'right', extraFilter: string): React.CSSProperties => ({
  height: 'clamp(260px, 72vh, 700px)',
  width: '100%',
  objectFit: 'contain',
  objectPosition: side === 'left' ? 'bottom right' : 'bottom left',
  filter: extraFilter,
  display: 'block',
})

export function RousseyFighter() {
  const [imgFailed, setImgFailed] = useState(false)
  if (imgFailed) return <RousseyFighterSVG />
  return (
    <img
      src="/assets/rousey.png"
      alt="Ronda Rousey"
      onError={() => setImgFailed(true)}
      style={fighterImgStyle('left', 'drop-shadow(-8px 0px 40px rgba(245,240,232,0.15))')}
    />
  )
}

export function CaranoFighter() {
  const [imgFailed, setImgFailed] = useState(false)
  if (imgFailed) return <CaranoFighterSVG />
  return (
    <img
      src="/assets/carano.png"
      alt="Gina Carano"
      onError={() => setImgFailed(true)}
      style={fighterImgStyle('right', 'drop-shadow(8px 0px 40px rgba(200,16,46,0.2))')}
    />
  )
}
