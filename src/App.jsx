import { useEffect, useState } from 'react'
import { db } from './firebase'
import { ref, onValue, set, push, remove } from 'firebase/database'
import './App.css'

const TRIP = {
  title: 'Rally Crew',
  dates: 'May 23 – 30, 2026',
  checkin: new Date('2026-05-23T16:00:00'),
  checkout: new Date('2026-05-30T10:00:00'),
  address: '1113 New River Inlet Rd, North Topsail Beach, NC 28460',
  mapsUrl: 'https://maps.apple.com/?address=1113+New+River+Inlet+Rd,+North+Topsail+Beach,+NC+28460',
  activities: [
    { name: 'Taco Night', emoji: '🌮' },
    { name: 'Murder Mystery Party', emoji: '🔍' },
    { name: 'Fancy Dinner', emoji: '🍽️' },
    { name: 'Birthday Celebrations', emoji: '🎂' },
    { name: 'Pokey Stix', emoji: '🍕' },
    { name: 'Disc Golf', emoji: '🥏' },
    { name: 'Oysters', emoji: '🦪' },
    { name: 'Party Punch', emoji: '🍹' },
  ],
}

const LAT = 34.508277
const LON = -77.389672
const NOAA_STATION = '8658120'

// --- DATA HOOKS ---

function useWeather() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const fetch_ = () =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&temperature_unit=fahrenheit&windspeed_unit=mph`)
        .then(r => r.json()).then(d => setData(d.current)).catch(() => setError(true))
    fetch_()
    const id = setInterval(fetch_, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return { data, error }
}

function useMarine() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const fetch_ = () =>
      fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=wave_height,wave_direction,sea_surface_temperature&length_unit=imperial&temperature_unit=fahrenheit`)
        .then(r => r.json()).then(d => setData(d.current)).catch(() => setError(true))
    fetch_()
    const id = setInterval(fetch_, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return { data, error }
}

function useNoaaTides() {
  const [tides, setTides] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const fetch_ = () => {
      const today = new Date()
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const pad = n => String(n).padStart(2, '0')
      const fmt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
      const fetchDay = (date) =>
        fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${fmt(date)}&range=24&station=${NOAA_STATION}&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=web_services&format=json`)
          .then(r => r.json())
          .then(d => d.predictions || [])
      Promise.all([fetchDay(today), fetchDay(tomorrow)])
        .then(([todayTides, tomorrowTides]) => setTides({ today: todayTides, tomorrow: tomorrowTides }))
        .catch(() => setError(true))
    }
    fetch_()
    const id = setInterval(fetch_, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return { tides, error }
}

// --- BEACH SCORE ---
function getPrecipScore(prob) {
  if (prob <= 10) return 1.0
  if (prob <= 25) return 0.75
  if (prob <= 40) return 0.45
  if (prob <= 60) return 0.2
  if (prob <= 80) return 0.08
  return 0.02
}

function getTempScore(temp) {
  if (temp >= 80 && temp <= 88) return 1.0
  if ((temp >= 75 && temp < 80) || (temp > 88 && temp <= 93)) return 0.8
  if ((temp >= 70 && temp < 75) || (temp > 93 && temp <= 98)) return 0.55
  if ((temp >= 65 && temp < 70) || (temp > 98 && temp <= 103)) return 0.3
  return 0.1
}

function getWindScore(wind) {
  if (wind >= 5 && wind <= 15) return 1.0
  if ((wind > 15 && wind <= 18) || (wind >= 3 && wind < 5)) return 0.9
  if ((wind > 18 && wind <= 24) || (wind >= 1 && wind < 3)) return 0.75
  if ((wind > 24 && wind <= 30) || wind === 0) return 0.45
  return 0.1
}

function calcBeachScore(temp, precip, wind) {
  const raw = getPrecipScore(precip) * getTempScore(temp) * getWindScore(wind)
  return Math.round(Math.cbrt(raw) * 100) / 10
}

function getBeachScores(forecast, dayIndex) {
  if (!forecast?.hourly?.temperature_2m || !forecast?.hourly?.precipitation_probability || !forecast?.hourly?.windspeed_10m) return null
  const hours = [9, 11, 13, 15]
  const baseIndex = dayIndex * 24
  const results = hours.map(hour => {
    const i = baseIndex + hour
    const temp = forecast.hourly.temperature_2m?.[i]
    const precip = forecast.hourly.precipitation_probability?.[i]
    const wind = forecast.hourly.windspeed_10m?.[i]
    if (temp == null || precip == null || wind == null) return null
    return {
      hour,
      label: hour === 9 ? '9AM' : hour === 11 ? '11AM' : hour === 13 ? '1PM' : '3PM',
      score: calcBeachScore(temp, precip, wind)
    }
  }).filter(Boolean)
  return results.length === 4 ? results : null
}

function getDailyAvgBeachScore(forecast, dayIndex) {
  const scores = getBeachScores(forecast, dayIndex)
  if (!scores || scores.length === 0) return null
  const avg = scores.reduce((a, b) => a + b.score, 0) / scores.length
  return Math.round(avg * 10) / 10
}

const WX_LABELS = {
  0: { label: 'Clear Sky', emoji: '☀️' },
  1: { label: 'Mainly Clear', emoji: '🌤️' },
  2: { label: 'Partly Cloudy', emoji: '⛅' },
  3: { label: 'Overcast', emoji: '☁️' },
  45: { label: 'Foggy', emoji: '🌫️' },
  48: { label: 'Icy Fog', emoji: '🌫️' },
  51: { label: 'Light Drizzle', emoji: '🌦️' },
  53: { label: 'Drizzle', emoji: '🌦️' },
  55: { label: 'Heavy Drizzle', emoji: '🌧️' },
  61: { label: 'Light Rain', emoji: '🌧️' },
  63: { label: 'Rain', emoji: '🌧️' },
  65: { label: 'Heavy Rain', emoji: '🌧️' },
  71: { label: 'Light Snow', emoji: '🌨️' },
  73: { label: 'Snow', emoji: '❄️' },
  75: { label: 'Heavy Snow', emoji: '❄️' },
  80: { label: 'Rain Showers', emoji: '🌦️' },
  81: { label: 'Showers', emoji: '🌧️' },
  82: { label: 'Heavy Showers', emoji: '⛈️' },
  95: { label: 'Thunderstorm', emoji: '⛈️' },
}

function formatTideTime(timeStr) {
  const [, time] = timeStr.split(' ')
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

// --- TABS ---

function BeachScoreCard({ forecast }) {
  const scores = getBeachScores(forecast, 0)
  if (!forecast?.hourly || !scores || scores.length === 0) return null

  const maxScore = Math.max(...scores.map(s => s.score))
  const bestWindow = scores.find(s => s.score === maxScore)

  const chartW = 260
  const chartH = 80
  const padL = 8
  const padR = 8
  const padT = 8
  const padB = 8
  const innerW = chartW - padL - padR
  const innerH = chartH - padT - padB

  const xPos = (i) => padL + (i / (scores.length - 1)) * innerW
  const yPos = (score) => padT + innerH - (score / 10) * innerH

  // Build path
  const linePath = scores.map((s, i) =>
    `${i === 0 ? 'M' : 'L'} ${xPos(i)} ${yPos(s.score)}`
  ).join(' ')

  // Shaded area under line
  const areaPath = `${linePath} L ${xPos(scores.length - 1)} ${padT + innerH} L ${xPos(0)} ${padT + innerH} Z`

  // Best window shading — find best consecutive pair
  let bestPairStart = 0
  let bestPairScore = -1
  for (let i = 0; i < scores.length - 1; i++) {
    const avg = (scores[i].score + scores[i + 1].score) / 2
    if (avg > bestPairScore) { bestPairScore = avg; bestPairStart = i }
  }
  const shadeX1 = xPos(bestPairStart)
  const shadeX2 = xPos(bestPairStart + 1)

  const scoreColor = maxScore >= 8 ? '#00e5ff' : maxScore >= 6 ? '#ff6ec7' : maxScore >= 4 ? '#ffc800' : '#ff4444'

  return (
    <div className="card">
      <div className="card-label">🏖️ Today's Beach Score</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{maxScore}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>peak · {bestWindow?.label}</div>
      </div>

      {/* Sparkline */}
      <div style={{ margin: '12px 0 4px' }}>
        <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} style={{ overflow: 'visible' }}>
          {/* Best window shading */}
          <rect
            x={shadeX1}
            y={padT}
            width={shadeX2 - shadeX1}
            height={innerH}
            fill="rgba(0, 229, 255, 0.08)"
            rx="4"
          />
          <rect
            x={shadeX1}
            y={padT}
            width={shadeX2 - shadeX1}
            height={innerH}
            fill="none"
            stroke="rgba(0, 229, 255, 0.2)"
            strokeWidth="1"
            rx="4"
          />

          {/* Area fill under line */}
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={scoreColor} stopOpacity="0.3"/>
              <stop offset="100%" stopColor={scoreColor} stopOpacity="0.02"/>
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#areaGrad)"/>

          {/* Line */}
          <path d={linePath} fill="none" stroke={scoreColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>

          {/* Dots */}
          {scores.map((s, i) => (
            <circle key={i} cx={xPos(i)} cy={yPos(s.score)} r="3" fill={scoreColor}/>
          ))}

          {/* Time labels */}
          {scores.map((s, i) => (
            <text
              key={i}
              x={xPos(i)}
              y={chartH}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(255,255,255,0.35)"
              fontFamily="Orbitron, monospace"
            >{s.label}</text>
          ))}
        </svg>
      </div>

      <div style={{ fontSize: 10, color: 'rgba(0,229,255,0.5)', fontFamily: 'Orbitron, monospace', letterSpacing: 1 }}>
        BEST WINDOW · {scores[bestPairStart].label}–{scores[bestPairStart + 1].label}
      </div>
    </div>
  )
}

function HouseNeeds() {
  const [needs, setNeeds] = useState([])
  const [newNeed, setNewNeed] = useState('')

  useEffect(() => {
    const needsRef = ref(db, 'house-needs')
    const unsub = onValue(needsRef, snap => {
      const val = snap.val()
      setNeeds(val ? Object.entries(val).map(([key, data]) => ({ key, ...data })) : [])
    })
    return () => unsub()
  }, [])

  const addNeed = () => {
    const trimmed = newNeed.trim()
    if (!trimmed) return
    push(ref(db, 'house-needs'), { text: trimmed, done: false })
    setNewNeed('')
  }

  const toggleNeed = (key, done) => {
    set(ref(db, `house-needs/${key}/done`), !done)
  }

  const removeNeed = (key) => {
    remove(ref(db, `house-needs/${key}`))
  }

  return (
    <div className="card">
      <div className="card-label">🏠 House Needs</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={newNeed}
          onChange={e => setNewNeed(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNeed()}
          placeholder="Add item..."
          style={{
            flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,110,199,0.3)',
            borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 13,
            outline: 'none', fontFamily: 'Exo 2, sans-serif'
          }}
        />
        <button onClick={addNeed} style={{
          background: 'linear-gradient(135deg, #ff6ec7, #00e5ff)', border: 'none',
          borderRadius: 10, padding: '8px 14px', color: '#0a0015',
          fontWeight: 700, fontSize: 18, cursor: 'pointer'
        }}>+</button>
      </div>
      {needs.length === 0 && <div className="card-sub">No items yet</div>}
      {needs.map((n) => (
        <div key={n.key} className="activity-item" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }} onClick={() => toggleNeed(n.key, n.done)}>
            <div style={{
              width: 18, height: 18, borderRadius: 4, border: '2px solid rgba(255,110,199,0.5)',
              background: n.done ? 'linear-gradient(135deg, #ff6ec7, #00e5ff)' : 'transparent',
              flexShrink: 0, cursor: 'pointer'
            }} />
            <div style={{ fontSize: 14, color: n.done ? 'rgba(255,255,255,0.35)' : '#ffd6f0', textDecoration: n.done ? 'line-through' : 'none', cursor: 'pointer' }}>
              {n.text}
            </div>
          </div>
          <button onClick={() => removeNeed(n.key)} style={{
            background: 'none', border: 'none', color: 'rgba(255,110,199,0.4)',
            fontSize: 16, cursor: 'pointer', padding: '0 4px'
          }}>✕</button>
        </div>
      ))}
    </div>
  )
}
function HomeTab() {
  const { data: forecast } = useForecast()
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const msToCheckin = TRIP.checkin - now
  const tripDuration = TRIP.checkout - TRIP.checkin
  const elapsed = now - TRIP.checkin
  const tripProgress = Math.min(100, Math.max(0, (elapsed / tripDuration) * 100))
  const started = now >= TRIP.checkin
  const ended = now >= TRIP.checkout

  const daysLeft = Math.floor(msToCheckin / (1000 * 60 * 60 * 24))
  const hoursLeft = Math.floor((msToCheckin % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutesLeft = Math.floor((msToCheckin % (1000 * 60 * 60)) / (1000 * 60))

  return (
    <div>
      <div className="hero">
        <div className="hero-eyebrow">Beach Trip 2026</div>
        <div className="hero-title">{TRIP.title}</div>
        <div className="hero-dates">{TRIP.dates}</div>
        <a className="hero-address" href={TRIP.mapsUrl} target="_blank" rel="noreferrer">
          📍 {TRIP.address}
        </a>
      </div>

      <div className="cards">
        {/* Countdown / Progress */}
        <div className="card">
          <div className="card-label">
            {ended ? 'Trip Complete' : started ? 'Trip Progress' : 'Countdown to Check-In'}
          </div>
          {!started && (
            <div className="card-main">{daysLeft}d {hoursLeft}h {minutesLeft}m</div>
          )}
          {!started && <div className="card-sub">until check-in</div>}
          {started && !ended && (
            <>
              <div className="card-sub" style={{ marginBottom: 12 }}>You're on the beach! 🌊</div>
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', height: 8 }}>
                <div style={{
                  height: '100%',
                  width: `${tripProgress}%`,
                  background: 'linear-gradient(90deg, #ff6ec7, #00e5ff)',
                  borderRadius: 999,
                  transition: 'width 1s ease'
                }} />
              </div>
              <div className="card-detail" style={{ marginTop: 8 }}>
                <span>{tripProgress.toFixed(0)}%</span> of the trip complete
              </div>
            </>
          )}
          {ended && <div className="card-sub">See you next year 🤙</div>}
        </div>

        <BeachScoreCard forecast={forecast} />

        {/* Activities */}
        <div className="card">
          <div className="card-label">Trip Activities</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 4 }}>
            {TRIP.activities.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{a.emoji}</span>
                <span style={{ fontSize: 13, color: '#ffd6f0' }}>{a.name}</span>
              </div>
            ))}
          </div>
        </div>
        {/* HOUSE NEEDS */}
        <HouseNeeds />
      </div>
    </div>
  )
}

function useForecast() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const fetch_ = () =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset&hourly=uv_index,precipitation_probability,temperature_2m,windspeed_10m&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America/New_York`)
        .then(r => r.json()).then(d => setData(d)).catch(() => setError(true))
    fetch_()
    const id = setInterval(fetch_, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return { data, error }
}

function useMoonPhase() {
  const [data, setData] = useState(null)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    fetch(`https://api.sunrise-sunset.org/json?lat=${LAT}&lng=${LON}&date=${today}&formatted=0`)
      .then(r => r.json()).then(d => setData(d.results)).catch(() => {})
  }, [])
  return data
}

function useRipCurrent() {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch(`https://api.weather.gov/products?type=SRF&location=MHX`, {
      headers: { 'Accept': 'application/ld+json' }
    })
      .then(r => r.json())
      .then(d => {
        const latest = d['@graph']?.[0]
        if (!latest) return
        return fetch(latest['@id'], { headers: { 'Accept': 'application/ld+json' } })
      })
      .then(r => r?.json())
      .then(d => {
        if (!d?.productText) return
        const onslow = d.productText.split('NCZ199')[1] || ''
        const match = onslow.match(/Rip Current Risk[^a-zA-Z]*([A-Za-z]+)/)
        if (match) setData(match[1].trim())
      })
      .catch(() => {})
  }, [])
  return data
}

const UV_LABELS = ['Low','Low','Low','Moderate','Moderate','Moderate','High','High','Very High','Very High','Extreme']

function formatTime12(isoString) {
  if (!isoString) return '--'
  const d = new Date(isoString)
  let h = d.getHours(), m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const MOON_PHASES = [
  '🌑','🌒','🌒','🌒','🌓','🌔','🌔','🌔',
  '🌕','🌖','🌖','🌖','🌗','🌘','🌘','🌘','🌑'
]

function getMoonEmoji() {
  const known = new Date('2026-01-01')
  const cycle = 29.53
  const diff = (new Date() - known) / (1000 * 60 * 60 * 24)
  const phase = ((diff % cycle) + cycle) % cycle
  return MOON_PHASES[Math.floor(phase / cycle * MOON_PHASES.length)]
}

function WeatherTab() {
  const weather = useWeather()
  const marine = useMarine()
  const { tides, error: tideError } = useNoaaTides()
  const { data: forecast } = useForecast()
  const sunMoon = useMoonPhase()
  const ripRisk = useRipCurrent()

  const now = new Date()
  const currentHour = now.getHours()
  const uvIndex = forecast?.hourly?.uv_index?.[currentHour]
  const uvLabel = uvIndex != null ? (UV_LABELS[Math.min(Math.floor(uvIndex), 10)] ?? 'Extreme') : null
  const uvPct = uvIndex != null ? Math.min(100, (uvIndex / 11) * 100) : 0

  const ripClass = ripRisk
    ? ripRisk.toLowerCase().includes('high') ? 'rip-high'
    : ripRisk.toLowerCase().includes('moderate') ? 'rip-moderate'
    : 'rip-low'
    : 'rip-low'

  return (
    <div className="cards" style={{ paddingTop: 24 }}>

      {/* CURRENT CONDITIONS */}
      <div className="card">
        <div className="card-label">Current Conditions</div>
        {!weather.data && !weather.error && <div className="loading">Loading...</div>}
        {weather.error && <div className="error">Unable to load weather</div>}
        {weather.data && (
          <>
            <div className="card-main">{Math.round(weather.data.temperature_2m)}°F</div>
            <div className="card-sub">{WX_LABELS[weather.data.weathercode]?.emoji} {WX_LABELS[weather.data.weathercode]?.label ?? 'Unknown'}</div>
            <div className="card-detail">
              <span>Humidity</span> {weather.data.relativehumidity_2m}%
              {'  ·  '}
              <span>Wind</span> {Math.round(weather.data.windspeed_10m)} mph
            </div>
            {marine.data && (
              <div className="card-detail" style={{ marginTop: 10 }}>
                <span>Water Temp</span> {Math.round(marine.data.sea_surface_temperature)}°F
                {'  ·  '}
                <span>Waves</span> {marine.data.wave_height.toFixed(1)} ft
              </div>
            )}
          </>
        )}
      </div>

      {/* UV INDEX */}
      {uvIndex != null && (
        <div className="card">
          <div className="card-label">UV Index</div>
          <div className="card-main" style={{ fontSize: 28 }}>{uvIndex.toFixed(1)} <span style={{ fontSize: 16, color: '#ff6ec7' }}>{uvLabel}</span></div>
          <div className="uv-bar-bg">
            <div className="uv-bar-fill" style={{ width: `${uvPct}%` }} />
          </div>
          <div className="card-detail">Scale 0–11+. Reapply SPF every 2 hrs.</div>
        </div>
      )}

      {/* RIP CURRENT */}
      <div className="card">
        <div className="card-label">Rip Current Risk · Coastal Onslow</div>
        {!ripRisk && <div className="loading">Loading...</div>}
        {ripRisk && (
          <>
            <div className={`rip-badge ${ripClass}`}>{ripRisk}</div>
            <div className="card-detail">Source: NOAA NWS Newport/Morehead City</div>
          </>
        )}
      </div>

      {/* SUNRISE / SUNSET / MOON */}
      <div className="card">
        <div className="card-label">Sun & Moon</div>
        <div className="sun-moon-grid">
          <div className="sun-moon-item">
            <div className="sun-moon-label">Sunrise</div>
            <div className="sun-moon-value">
              {forecast?.daily?.sunrise?.[0] ? formatTime12(forecast.daily.sunrise[0]) : '--'}
            </div>
          </div>
          <div className="sun-moon-item">
            <div className="sun-moon-label">Sunset</div>
            <div className="sun-moon-value">
              {forecast?.daily?.sunset?.[0] ? formatTime12(forecast.daily.sunset[0]) : '--'}
            </div>
          </div>
          <div className="sun-moon-item">
            <div className="sun-moon-label">Moon Phase</div>
            <div className="sun-moon-value">{getMoonEmoji()}</div>
          </div>
          <div className="sun-moon-item">
            <div className="sun-moon-label">Golden Hour</div>
            <div className="sun-moon-value">
              {forecast?.daily?.sunset?.[0] ? formatTime12(new Date(new Date(forecast.daily.sunset[0]).getTime() - 60 * 60 * 1000)) : '--'}
            </div>
          </div>
        </div>
      </div>

      {/* 7-DAY FORECAST */}
      <div className="card">
       <div className="card-label">7-Day Forecast</div>
       {!forecast && <div className="loading">Loading...</div>}
       {forecast?.daily && forecast.daily.time.map((date, i) => {
          const wx = WX_LABELS[forecast.daily.weathercode[i]]
          // Get hourly precip for this day (24 hours starting at index i*24)
          const hourlyPrecip = forecast?.hourly?.precipitation_probability?.slice(i * 24, i * 24 + 24) || []
          const amPrecip = hourlyPrecip.slice(6, 12)   // 6am-12pm
          const pmPrecip = hourlyPrecip.slice(12, 18)  // 12pm-6pm
          const evePrecip = hourlyPrecip.slice(18, 24) // 6pm-12am
          const amMax = Math.max(...amPrecip, 0)
          const pmMax = Math.max(...pmPrecip, 0)
          const eveMax = Math.max(...evePrecip, 0)
          const threshold = 30
          const rainTimes = [
            amMax >= threshold && 'AM',
            pmMax >= threshold && 'PM',
            eveMax >= threshold && 'Eve',
          ].filter(Boolean)

          return (
            <div className="forecast-row" key={date}>
              <div className="forecast-day">{i === 0 ? 'Today' : DAYS[new Date(date + 'T12:00:00').getDay()]}</div>
              <div className="forecast-desc">
                <span style={{ marginRight: 4 }}>{wx?.emoji}</span>
                {rainTimes.length > 0
                  ? <span style={{ color: '#00e5ff', fontSize: 11 }}>Rain {rainTimes.join(' · ')}</span>
                  : <span>{wx?.label ?? '—'}</span>
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div className="forecast-temps">
                  {Math.round(forecast.daily.temperature_2m_max[i])}°
                  <span className="low">{Math.round(forecast.daily.temperature_2m_min[i])}°</span>
                </div>
                {(() => {
                  const avg = getDailyAvgBeachScore(forecast, i)
                  const color = avg >= 8 ? '#00e5ff' : avg >= 6 ? '#ff6ec7' : avg >= 4 ? '#ffc800' : '#ff4444'
                  return avg != null
                    ? <span style={{ fontSize: 10, color, fontFamily: 'Orbitron, monospace' }}>Avg Score: {avg}</span>
                    : null
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {/* TIDES */}
      <div className="card">
        <div className="card-label">Tides · Wilmington Station</div>
        {tideError && <div className="error">Unable to load tide data</div>}
        {!tides && !tideError && <div className="loading">Loading...</div>}
        {tides && (
          <>
            <div style={{ marginBottom: 8, fontFamily: 'Orbitron, monospace', fontSize: 9, letterSpacing: 2, color: '#ff6ec7' }}>TODAY</div>
            {tides.today.map((t, i) => (
              <div className="tide-row" key={i}>
                <span className={`tide-type ${t.type === 'H' ? 'high' : 'low'}`}>
                  {t.type === 'H' ? 'High' : 'Low'}
                </span>
                <span className="tide-time">{formatTideTime(t.t)}</span>
                <span className="tide-height">{parseFloat(t.v).toFixed(1)} ft</span>
              </div>
            ))}
            <div style={{ margin: '12px 0 8px', fontFamily: 'Orbitron, monospace', fontSize: 9, letterSpacing: 2, color: '#ff6ec7' }}>TOMORROW</div>
            {tides.tomorrow.map((t, i) => (
              <div className="tide-row" key={i}>
                <span className={`tide-type ${t.type === 'H' ? 'high' : 'low'}`}>
                  {t.type === 'H' ? 'High' : 'Low'}
                </span>
                <span className="tide-time">{formatTideTime(t.t)}</span>
                <span className="tide-height">{parseFloat(t.v).toFixed(1)} ft</span>
</div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

const VIBES = [
  { emoji: '🏖️', label: 'Beach' },
  { emoji: '🏊', label: 'Pool' },
  { emoji: '😴', label: 'Nap' },
  { emoji: '🍔', label: 'Food' },
  { emoji: '🥃', label: 'Shots' },
  { emoji: '🎉', label: 'Party' },
  { emoji: '🎲', label: 'Board Games' },
  { emoji: '🎬', label: 'Movie' },
  { emoji: '🍺', label: 'Brews Cruise' },
]

function usePassiveAccumulation(selectedVibe, vibeVotes, getTodayKey) {
  useEffect(() => {
    const interval = setInterval(() => {
      const dateKey = getTodayKey()

      // Each device only accumulates its own active vote
      if (!selectedVibe) return
      const key = selectedVibe.toLowerCase().replace(/[^a-z0-9]/g, '_')
      const myVoteRef = ref(db, `crew/vibes/${key}/votes/${deviceId}`)

      onValue(myVoteRef, snap => {
        const vote = snap.val()
        if (!vote?.timestamp) return
        const ageMinutes = (Date.now() - vote.timestamp) / (1000 * 60)
        if (ageMinutes > 120) return

        // Add 5 minutes for this device's vote
        const statsRef = ref(db, `crew/daily/${dateKey}/stats/${key}/totalMinutes`)
        onValue(statsRef, snap2 => {
          set(statsRef, (snap2.val() || 0) + 5)
        }, { onlyOnce: true })

        // Recalculate rally from current stats
        const allStatsRef = ref(db, `crew/daily/${dateKey}/stats`)
        onValue(allStatsRef, snap3 => {
          const stats = snap3.val() || {}
          const VIBE_POINTS = {
            brews_cruise: 2, shots: 2, party: 2,
            beach: 0, pool: 0, food: 0,
            nap: -1, board_games: -1, movie: -1,
          }
          let totalMinutes = 0
          let weightedPoints = 0
          for (const [k, val] of Object.entries(stats)) {
            const rawMins = val.totalMinutes || 0
            const hasActive = vibeVotes[k]?.votes &&
              Object.values(vibeVotes[k].votes).some(v =>
                v.timestamp && (Date.now() - v.timestamp) / (1000 * 60) <= 120
              )
            const decayedMins = hasActive ? rawMins : Math.max(0, rawMins - 10)
            totalMinutes += decayedMins
            weightedPoints += (VIBE_POINTS[k] ?? 0) * decayedMins
          }
          const participationScore = Math.min(1, totalMinutes / 840)
          const positivityRaw = totalMinutes > 0 ? weightedPoints / totalMinutes : 0
          const positivityScore = (Math.max(-1, Math.min(2, positivityRaw)) + 1) / 3
          const rally = Math.round((participationScore * 60) + (positivityScore * 40))
          set(ref(db, `crew/daily/${dateKey}/rally`), Math.min(100, Math.max(0, rally)))
        }, { onlyOnce: true })
      }, { onlyOnce: true })
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [vibeVotes])
}

function updateRallyFromStats(dateKey, stats) {
  const VIBE_POINTS = {
    brews_cruise: 2, shots: 2, party: 2,
    beach: 0, pool: 0, food: 0,
    nap: -1, board_games: -1, movie: -1,
  }

  let totalMinutes = 0
  let weightedPoints = 0

  for (const [key, val] of Object.entries(stats)) {
    const mins = val.totalMinutes || 0
    totalMinutes += mins
    weightedPoints += (VIBE_POINTS[key] ?? 0) * mins
  }

  const participationScore = Math.min(1, totalMinutes / 840)
  const positivityRaw = totalMinutes > 0 ? weightedPoints / totalMinutes : 0
  const positivityScore = (Math.max(-1, Math.min(2, positivityRaw)) + 1) / 3
  const rally = Math.round((participationScore * 60) + (positivityScore * 40))

  set(ref(db, `crew/daily/${dateKey}/rally`), Math.min(100, Math.max(0, rally)))
}

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function getVibeOpacity(timestamp, now) {
  if (!timestamp) return 1
  const ageMinutes = (now - timestamp) / (1000 * 60)
  if (ageMinutes > 120) return 0.25
  if (ageMinutes > 60) return 0.5
  if (ageMinutes > 30) return 0.75
  return 1
}

function getVibeAge(timestamp, now) {
  if (!timestamp) return null
  const ageMinutes = Math.floor((now - timestamp) / (1000 * 60))
  if (ageMinutes < 1) return 'just now'
  if (ageMinutes < 60) return `${ageMinutes}m ago`
  const hours = Math.floor(ageMinutes / 60)
  const mins = ageMinutes % 60
  return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`
}

function getDeviceId() {
  let id = localStorage.getItem('device-id')
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('device-id', id)
  }
  return id
}

const deviceId = getDeviceId()

function CrewTab() {
  const [vibeVotes, setVibeVotes] = useState({})
  const [sessions, setSessions] = useState([])
  const [selectedVibe, setSelectedVibe] = useState(null)
  const now = useNow()

  const getTodayKey = () => {
    const n = new Date()
    const est = new Date(n.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    if (est.getHours() < 3) est.setDate(est.getDate() - 1)
    return `${est.getFullYear()}-${String(est.getMonth() + 1).padStart(2, '0')}-${String(est.getDate()).padStart(2, '0')}`
  }

  const dateKey = getTodayKey()

  const VIBE_POINTS = {
    brews_cruise: 2, shots: 2, party: 2,
    beach: 0, pool: 0, food: 0,
    nap: -1, board_games: -1, movie: -1,
  }

  useEffect(() => {
    const vibeRef = ref(db, 'crew/vibes')
    const sessionsRef = ref(db, `crew/daily/${dateKey}/sessions`)

    const unsubVibes = onValue(vibeRef, snap => {
      setVibeVotes(snap.val() || {})
    })

    const unsubSessions = onValue(sessionsRef, snap => {
      const val = snap.val() || {}
      setSessions(Object.values(val))
    })

    // Load this device's existing vote on mount
    onValue(vibeRef, snap => {
      const val = snap.val() || {}
      for (const [key, data] of Object.entries(val)) {
        if (data?.votes?.[deviceId]) {
          const matchedVibe = VIBES.find(v =>
            v.label.toLowerCase().replace(/[^a-z0-9]/g, '_') === key
          )
          if (matchedVibe) setSelectedVibe(matchedVibe.label)
          break
        }
      }
    }, { onlyOnce: true })

    // Cleanup stale votes and write sessions for auto-cleared votes
    const runCleanup = () => {
      onValue(vibeRef, snap => {
        const val = snap.val() || {}
        for (const [vibeKey, vibeData] of Object.entries(val)) {
          const votes = vibeData?.votes || {}
          for (const [dKey, voteData] of Object.entries(votes)) {
            const ageMinutes = voteData.timestamp
              ? (Date.now() - voteData.timestamp) / (1000 * 60)
              : 999
            if (ageMinutes > 120) {
              // Write completed session before clearing
              const mins = Math.min(120, Math.round(ageMinutes))
              push(ref(db, `crew/daily/${dateKey}/sessions`), {
                vibe: vibeKey,
                deviceId: dKey,
                start: voteData.timestamp,
                end: voteData.timestamp + mins * 60 * 1000,
                minutes: mins,
              })
              remove(ref(db, `crew/vibes/${vibeKey}/votes/${dKey}`))
              if (dKey === deviceId) setSelectedVibe(null)
            }
          }
        }
      }, { onlyOnce: true })
    }
    runCleanup()
    const cleanup = setInterval(runCleanup, 5 * 60 * 1000)

    return () => { unsubVibes(); unsubSessions(); clearInterval(cleanup) }
  }, [])

  const writeSession = (label, timestamp) => {
    if (!timestamp) return
    const mins = Math.round((Date.now() - timestamp) / (1000 * 60))
    if (mins < 1) return
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_')
    push(ref(db, `crew/daily/${dateKey}/sessions`), {
      vibe: key,
      deviceId,
      start: timestamp,
      end: Date.now(),
      minutes: Math.min(120, mins),
    })
  }

  const voteVibe = (label) => {
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_')

    if (selectedVibe === label) {
      onValue(ref(db, `crew/vibes/${key}/votes/${deviceId}`), snap => {
        const vote = snap.val()
        if (vote?.timestamp) writeSession(label, vote.timestamp)
        remove(ref(db, `crew/vibes/${key}/votes/${deviceId}`))
      }, { onlyOnce: true })
      setSelectedVibe(null)
    } else {
      if (selectedVibe) {
        const oldKey = selectedVibe.toLowerCase().replace(/[^a-z0-9]/g, '_')
        onValue(ref(db, `crew/vibes/${oldKey}/votes/${deviceId}`), snap => {
          const vote = snap.val()
          if (vote?.timestamp) writeSession(selectedVibe, vote.timestamp)
          remove(ref(db, `crew/vibes/${oldKey}/votes/${deviceId}`))
        }, { onlyOnce: true })
      }

      // Shots immediate bump — once per device per day
      if (label === 'Shots') {
        const shotsKey = `shots-bump-${dateKey}`
        if (!localStorage.getItem(shotsKey)) {
          push(ref(db, `crew/daily/${dateKey}/sessions`), {
            vibe: 'shots',
            deviceId,
            start: Date.now(),
            end: Date.now(),
            minutes: 10,
            isBump: true,
          })
          localStorage.setItem(shotsKey, '1')
        }
      }

      set(ref(db, `crew/vibes/${key}/votes/${deviceId}`), { timestamp: Date.now() })
      setSelectedVibe(label)
    }
  }

  // Calculate vibe log totals from completed sessions
  const vibeTotals = sessions.reduce((acc, s) => {
    acc[s.vibe] = (acc[s.vibe] || 0) + (s.minutes || 0)
    return acc
  }, {})

  // Add currently active votes to totals (live, not yet written as sessions)
  for (const [vibeKey, vibeData] of Object.entries(vibeVotes)) {
    const votes = vibeData?.votes || {}
    for (const [, voteData] of Object.entries(votes)) {
      if (!voteData?.timestamp) continue
      const ageMinutes = (Date.now() - voteData.timestamp) / (1000 * 60)
      if (ageMinutes <= 120) {
        vibeTotals[vibeKey] = (vibeTotals[vibeKey] || 0) + Math.round(ageMinutes)
      }
    }
  }

  // Calculate rally score from sessions + active votes
  const totalUniqueDevices = new Set([
    ...sessions.map(s => s.deviceId),
    ...Object.values(vibeVotes).flatMap(v =>
      Object.keys(v?.votes || {})
    )
  ]).size

  let totalMinutes = 0
  let weightedPoints = 0
  for (const [key, mins] of Object.entries(vibeTotals)) {
    // Apply decay for inactive vibes
    const hasActive = vibeVotes[key]?.votes &&
      Object.values(vibeVotes[key].votes).some(v =>
        v.timestamp && (Date.now() - v.timestamp) / (1000 * 60) <= 120
      )
    const decayFactor = hasActive ? 1 : Math.max(0,
      1 - (sessions
        .filter(s => s.vibe === key)
        .reduce((latest, s) => Math.max(latest, s.end || 0), 0)
        ? (Date.now() - sessions
            .filter(s => s.vibe === key)
            .reduce((latest, s) => Math.max(latest, s.end || 0), 0)) / (1000 * 60 * 60)
        : 0)
    )
    const effectiveMins = mins * decayFactor
    totalMinutes += effectiveMins
    weightedPoints += (VIBE_POINTS[key] ?? 0) * effectiveMins
  }

  const participationScore = Math.min(1, totalMinutes / 840)
  const positivityRaw = totalMinutes > 0 ? weightedPoints / totalMinutes : 0
  const positivityScore = (Math.max(-1, Math.min(2, positivityRaw)) + 1) / 3
  const rallyScore = Math.round((participationScore * 60) + (positivityScore * 40))

  // Write rally score to Firebase
  useEffect(() => {
    set(ref(db, `crew/daily/${dateKey}/rally`), Math.min(100, Math.max(0, rallyScore)))
  }, [rallyScore])

  const formatMinutes = (mins) => {
    if (mins < 60) return `${Math.round(mins)}m`
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  const VIBE_LABELS = {
    beach: '🏖️ Beach', pool: '🏊 Pool', nap: '😴 Nap',
    food: '🍔 Food', shots: '🥃 Shots', party: '🎉 Party',
    board_games: '🎲 Board Games', movie: '🎬 Movie', brews_cruise: '🍺 Brews Cruise'
  }

  const statsEntries = Object.entries(vibeTotals)
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="cards" style={{ paddingTop: 24 }}>
      <div className="card">
        <div className="card-label">✌️ Crew Vibe</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {VIBES.map(({ emoji, label }) => {
            const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_')
            const data = vibeVotes[key]
            const votes = data?.votes || {}
            const entries = Object.entries(votes)
            const count = entries.length
            const myVote = votes[deviceId]
            const selected = selectedVibe === label
            const myTimestamp = myVote?.timestamp || null
            const opacity = myTimestamp ? getVibeOpacity(myTimestamp, now) : 1
            const age = myTimestamp ? getVibeAge(myTimestamp, now) : null
            const faded = myTimestamp && opacity < 1
            return (
              <div
                key={label}
                onClick={() => voteVibe(label)}
                style={{
                  background: selected ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${selected ? 'rgba(0,229,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 14, padding: '12px 8px', cursor: 'pointer',
                  textAlign: 'center',
                  opacity: selected ? 1 : count > 0 ? Math.max(0.2, opacity) : 0.25,
                  transition: 'opacity 0.5s ease'
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 4 }}>{emoji}</div>
                <div style={{ fontSize: 10, color: selected ? '#00e5ff' : 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{label}</div>
                {count > 0 && (
                  <>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{count}</div>
                    {age && <div style={{ fontSize: 9, color: faded ? '#ff6ec7' : 'rgba(255,255,255,0.3)', marginTop: 2 }}>{age}</div>}
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'Orbitron, monospace', letterSpacing: 1 }}>
          VIBES FADE AFTER 30M · CLEAR AFTER 2H
        </div>
      </div>

      {/* RALLY GAUGE */}
      <div className="card">
        <div className="card-label" style={{ fontFamily: 'Orbitron, monospace', letterSpacing: 3 }}>
          ⚡ RALLY LEVEL
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <div style={{
            fontSize: 42, fontWeight: 900, lineHeight: 1,
            fontFamily: 'Orbitron, monospace',
            color: rallyScore >= 70 ? '#00e5ff' : rallyScore >= 40 ? '#ff6ec7' : '#b450dc'
          }}>{rallyScore}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'Orbitron, monospace' }}>/100</div>
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
          {Array.from({ length: 20 }).map((_, i) => {
            const lit = Math.round((rallyScore / 100) * 20)
            const pct = i / 20
            const color = i < lit
              ? pct < 0.4 ? 'rgba(180,80,220,1)' : pct < 0.7 ? 'rgba(255,110,199,1)' : 'rgba(0,229,255,1)'
              : pct < 0.4 ? 'rgba(180,80,220,0.12)' : pct < 0.7 ? 'rgba(255,110,199,0.12)' : 'rgba(0,229,255,0.12)'
            return (
              <div key={i} style={{
                flex: 1, height: 18, borderRadius: 2,
                background: color,
                boxShadow: i < lit ? `0 0 6px ${color}` : 'none',
                transition: 'background 0.3s ease'
              }} />
            )
          })}
        </div>
        <div style={{
          fontFamily: 'Orbitron, monospace', fontSize: 10, letterSpacing: 2,
          color: rallyScore >= 80 ? '#00e5ff' : rallyScore >= 60 ? '#ff6ec7' : rallyScore >= 40 ? '#b450dc' : 'rgba(255,255,255,0.3)',
          marginBottom: 20
        }}>
          {rallyScore >= 80 ? '🔥 FULL SEND' :
           rallyScore >= 60 ? '⚡ WE RALLYING' :
           rallyScore >= 40 ? '🌊 WARMING UP' :
           rallyScore >= 20 ? '😴 SLOW START' : '💤 DEAD HOUR'}
        </div>

        {/* Daily vibe log */}
        {statsEntries.length > 0 && (
          <>
            <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
              TODAY'S VIBE LOG
            </div>
            {statsEntries.map(([key, mins]) => (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                  {VIBE_LABELS[key] ?? key}
                </span>
                <span style={{ fontSize: 12, color: '#ff6ec7', fontFamily: 'Orbitron, monospace' }}>
                  {formatMinutes(mins)}
                </span>
              </div>
            ))}
          </>
        )}
        {statsEntries.length === 0 && (
          <div className="card-sub">No vibe activity yet today</div>
        )}
      </div>
    </div>
  )
}

const RESTAURANTS = [
  { name: 'Splash by the Sea', type: 'Seafood & American', area: 'On Island', rating: 4.5, phone: '910-328-3044', maps: 'https://maps.apple.com/?q=Splash+by+the+Sea+North+Topsail+Beach+NC' },
  { name: 'Seaview Pier Restaurant', type: 'Seafood', area: 'On Island', rating: 4.4, phone: '910-328-3172', maps: 'https://maps.apple.com/?q=Seaview+Pier+Restaurant+North+Topsail+Beach+NC' },
  { name: 'Aarrr Pirate Bar & Grill', type: 'Bar & Grill', area: 'On Island', rating: 4.3, phone: '910-541-0619', maps: 'https://maps.apple.com/?q=Aarrr+Pirate+Bar+Grill+North+Topsail+Beach+NC' },
  { name: 'Tiki Bar at North End Market', type: 'Bar', area: 'On Island', rating: 4.5, phone: null, maps: 'https://maps.apple.com/?q=Tiki+Bar+North+End+Market+North+Topsail+Beach+NC' },
  { name: 'Riverview Cafe', type: 'Seafood', area: 'Sneads Ferry', rating: 4.6, phone: '910-327-2011', maps: 'https://maps.apple.com/?q=Riverview+Cafe+Sneads+Ferry+NC' },
  { name: 'Spiaggia Ristobar', type: 'Italian', area: 'Sneads Ferry', rating: 4.6, phone: '910-741-0179', maps: 'https://maps.apple.com/?q=Spiaggia+Ristobar+Sneads+Ferry+NC' },
  { name: 'Lo-re-Lei Pub & Grill', type: 'Bar & Grill', area: 'Sneads Ferry', rating: 4.4, phone: '910-327-0900', maps: 'https://maps.apple.com/?q=Lo-re-Lei+Pub+Grill+Sneads+Ferry+NC' },
  { name: 'Voodoo Brewing Co', type: 'Brewery', area: 'Sneads Ferry', rating: 4.5, phone: '910-741-0155', maps: 'https://maps.apple.com/?q=Voodoo+Brewing+Sneads+Ferry+NC' },
  { name: 'Low Tide Steakhouse & SandBar', type: 'Steak & Seafood', area: 'Surf City', rating: 4.5, phone: '910-803-2304', maps: 'https://maps.apple.com/?q=Low+Tide+Steakhouse+Surf+City+NC' },
  { name: "Daddy Mac's Beach Grille", type: 'Seafood & American', area: 'Surf City', rating: 4.3, phone: '910-328-5577', maps: 'https://maps.apple.com/?q=Daddy+Macs+Beach+Grille+Surf+City+NC' },
  { name: 'Sears Landing', type: 'Seafood', area: 'Surf City', rating: 4.3, phone: '910-328-1312', maps: 'https://maps.apple.com/?q=Sears+Landing+Surf+City+NC' },
  { name: 'Wildfire Pizza', type: 'Pizza', area: 'Surf City', rating: 4.2, phone: '910-541-0232', maps: 'https://maps.apple.com/?q=Wildfire+Pizza+Surf+City+NC' },
]

const STORES = [
  { name: 'Food Lion', type: 'Grocery', address: '965 Old Folkstone Rd, Sneads Ferry', phone: null, maps: 'https://maps.apple.com/?address=965+Old+Folkstone+Rd,+Sneads+Ferry,+NC+28460' },
  { name: 'ABC Store', type: 'Liquor', address: '987 NC-210, Sneads Ferry', phone: null, maps: 'https://maps.apple.com/?address=987+NC-210,+Sneads+Ferry,+NC+28460' },
  { name: 'Publix', type: 'Grocery', address: '2765 NC-210, Hampstead', phone: null, maps: 'https://maps.apple.com/?address=2765+NC-210,+Hampstead,+NC+28443' },
]

const AREAS = ['On Island', 'Sneads Ferry', 'Surf City']

function ExploreTab() {

  return (
    <div className="cards" style={{ paddingTop: 24 }}>

      {/* RESTAURANTS */}
      {AREAS.map(area => (
        <div className="card" key={area}>
          <div className="card-label">🍽 {area}</div>
          {RESTAURANTS.filter(r => r.area === area).map((r, i) => (
            <div key={i} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginBottom: 2 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{r.type}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#ff6ec7' }}>⭐ {r.rating}</span>
                  <a href={r.maps} target="_blank" rel="noreferrer" style={{ fontSize: 16, textDecoration: 'none' }}>📍</a>
                  {r.phone && <a href={`tel:${r.phone}`} style={{ fontSize: 16, textDecoration: 'none' }}>📞</a>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* STORES */}
      <div className="card">
        <div className="card-label">🛒 Stores</div>
        {STORES.map((s, i) => (
          <div key={i} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: i < STORES.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{s.type} · {s.address}</div>
              </div>
              <a href={s.maps} target="_blank" rel="noreferrer" style={{ fontSize: 16, textDecoration: 'none' }}>📍</a>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}

function GamesTab() {
  const [teams, setTeams] = useState([])
  const [matches, setMatches] = useState([])
  const [newTeam, setNewTeam] = useState('')
  const [winner, setWinner] = useState('')
  const [loser, setLoser] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    const teamsRef = ref(db, 'kubb/teams')
    const matchesRef = ref(db, 'kubb/matches')
    const unsubTeams = onValue(teamsRef, snap => {
      const val = snap.val()
      setTeams(val ? Object.values(val) : [])
    })
    const unsubMatches = onValue(matchesRef, snap => {
      const val = snap.val()
      setMatches(val ? Object.values(val).reverse() : [])
    })
    return () => { unsubTeams(); unsubMatches() }
  }, [])

  const addTeam = () => {
    const trimmed = newTeam.trim()
    if (!trimmed || teams.includes(trimmed)) return
    push(ref(db, 'kubb/teams'), trimmed)
    setNewTeam('')
  }

  const removeTeam = (team) => {
    const teamsRef = ref(db, 'kubb/teams')
    onValue(teamsRef, snap => {
      const val = snap.val()
      if (!val) return
      const key = Object.keys(val).find(k => val[k] === team)
      if (key) remove(ref(db, `kubb/teams/${key}`))
    }, { onlyOnce: true })
  }

  const logMatch = () => {
    if (!winner || !loser || winner === loser) return
    push(ref(db, 'kubb/matches'), {
      winner,
      loser,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
    })
    setWinner('')
    setLoser('')
  }

  const clearAll = () => {
    set(ref(db, 'kubb'), null)
    setConfirmClear(false)
  }

  const standings = teams.map(team => {
    const wins = matches.filter(m => m.winner === team).length
    const losses = matches.filter(m => m.loser === team).length
    return { team, wins, losses }
  }).sort((a, b) => b.wins - a.wins || a.losses - b.losses)

  const inputStyle = {
    flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,110,199,0.3)',
    borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 13,
    outline: 'none', fontFamily: 'Exo 2, sans-serif'
  }

  const btnStyle = {
    background: 'linear-gradient(135deg, #ff6ec7, #00e5ff)', border: 'none',
    borderRadius: 10, padding: '8px 14px', color: '#0a0015',
    fontWeight: 700, fontSize: 16, cursor: 'pointer'
  }

  const selectStyle = { ...inputStyle, flex: 1, cursor: 'pointer' }

  return (
    <div className="cards" style={{ paddingTop: 24 }}>

      <div className="card">
        <div className="card-label">⚔️ Teams</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={newTeam}
            onChange={e => setNewTeam(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTeam()}
            placeholder="Team name..."
            style={inputStyle}
          />
          <button onClick={addTeam} style={btnStyle}>+</button>
        </div>
        {teams.length === 0 && <div className="card-sub">No teams yet — add some above</div>}
        {teams.map((t, i) => (
          <div key={i} className="activity-item" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="activity-dot" />
              <div style={{ fontSize: 14, color: '#ffd6f0' }}>{t}</div>
            </div>
            <button onClick={() => removeTeam(t)} style={{
              background: 'none', border: 'none', color: 'rgba(255,110,199,0.4)',
              fontSize: 16, cursor: 'pointer', padding: '0 4px'
            }}>✕</button>
          </div>
        ))}
      </div>

      {teams.length >= 2 && (
        <div className="card">
          <div className="card-label">🏆 Log a Match</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 44, fontFamily: 'Orbitron, monospace', fontSize: 9, letterSpacing: 1, color: '#00e5ff' }}>WINNER</span>
              <select value={winner} onChange={e => setWinner(e.target.value)} style={selectStyle}>
                <option value="">Select...</option>
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 44, fontFamily: 'Orbitron, monospace', fontSize: 9, letterSpacing: 1, color: '#ff6ec7' }}>LOSER</span>
              <select value={loser} onChange={e => setLoser(e.target.value)} style={selectStyle}>
                <option value="">Select...</option>
                {teams.filter(t => t !== winner).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button
              onClick={logMatch}
              disabled={!winner || !loser}
              style={{
                ...btnStyle,
                opacity: (!winner || !loser) ? 0.4 : 1,
                marginTop: 4, padding: '10px',
                fontSize: 13, letterSpacing: 1,
                fontFamily: 'Orbitron, monospace'
              }}
            >LOG MATCH</button>
          </div>
        </div>
      )}

      {standings.length > 0 && (
        <div className="card">
          <div className="card-label">📊 Leaderboard</div>
          {standings.map((s, i) => (
            <div key={s.team} className="tide-row">
              <span style={{
                fontFamily: 'Orbitron, monospace', fontSize: 10,
                color: i === 0 ? '#ffc800' : i === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)',
                width: 20
              }}>#{i + 1}</span>
              <span style={{ flex: 1, fontSize: 14, color: i === 0 ? '#fff' : 'rgba(255,255,255,0.7)' }}>{s.team}</span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: '#00e5ff' }}>{s.wins}W</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>·</span>
                <span style={{ color: '#ff6ec7' }}>{s.losses}L</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {matches.length > 0 && (
        <div className="card">
          <div className="card-label">📜 Match History</div>
          {matches.map((m, i) => (
            <div key={i} className="tide-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: 13, color: '#fff' }}>
                  <span style={{ color: '#00e5ff' }}>{m.winner}</span>
                  <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 6px' }}>def.</span>
                  <span style={{ color: '#ff6ec7' }}>{m.loser}</span>
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{m.date} {m.time}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {(teams.length > 0 || matches.length > 0) && (
        <div style={{ textAlign: 'center', paddingBottom: 8 }}>
          {!confirmClear
            ? <button onClick={() => setConfirmClear(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,110,199,0.3)', fontSize: 11, cursor: 'pointer', fontFamily: 'Orbitron, monospace', letterSpacing: 1 }}>RESET ALL DATA</button>
            : <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={clearAll} style={{ ...btnStyle, background: '#ff4444', fontSize: 11, padding: '6px 12px' }}>CONFIRM RESET</button>
                <button onClick={() => setConfirmClear(false)} style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', fontSize: 11, padding: '6px 12px' }}>CANCEL</button>
              </div>
          }
        </div>
      )}

    </div>
  )
}

// --- APP ---

const TABS = [
  { id: 'home',    label: 'Home',    icon: '🏠' },
  { id: 'weather', label: 'Weather', icon: '🌤' },
  { id: 'crew',    label: 'Crew',    icon: '🤙' },
  { id: 'explore', label: 'Explore', icon: '🗺' },
  { id: 'games',   label: 'Kubb',   icon: '🏆' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('home')

  return (
    <div className="app">
      <div style={{ paddingBottom: 80 }}>
        {activeTab === 'home'    && <HomeTab />}
        {activeTab === 'weather' && <WeatherTab />}
        {activeTab === 'crew'    && <CrewTab />}
        {activeTab === 'explore' && <ExploreTab />}
        {activeTab === 'games'   && <GamesTab />}
      </div>

      <nav className="nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}