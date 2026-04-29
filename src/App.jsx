import { useEffect, useState } from 'react'
import './App.css'

const TRIP = {
  title: 'Rally Crew',
  dates: 'May 23 – 30, 2026',
  checkin: new Date('2026-05-23T16:00:00'),
  checkout: new Date('2026-05-30T10:00:00'),
  address: '1113 New River Inlet Rd, North Topsail Beach, NC 28460',
  mapsUrl: 'https://maps.apple.com/?address=1113+New+River+Inlet+Rd,+North+Topsail+Beach,+NC+28460',
  activities: [
    'Beach Days',
    'Brews Cruise',
    'Taco Night',
    'Fancy Dinner',
    'Board Games',
    'Pier Fishing',
  ],
}

const LAT = 34.485
const LON = -77.387
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

const WX_LABELS = {
  0: 'Clear Sky', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy Fog', 51: 'Light Drizzle', 53: 'Drizzle',
  55: 'Heavy Drizzle', 61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 80: 'Rain Showers',
  81: 'Rain Showers', 82: 'Violent Showers', 95: 'Thunderstorm',
}

function formatTideTime(timeStr) {
  const [, time] = timeStr.split(' ')
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

// --- TABS ---

function HomeTab() {
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

        {/* Activities */}
        <div className="card">
          <div className="card-label">Trip Activities</div>
          {TRIP.activities.map((a, i) => (
            <div className="activity-item" key={i}>
              <div className="activity-dot" />
              <div className="activity-name">{a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function useForecast() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const fetch_ = () =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset&hourly=uv_index&temperature_unit=fahrenheit&timezone=America/New_York`)
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
            <div className="card-sub">{WX_LABELS[weather.data.weathercode] ?? 'Unknown'}</div>
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
        {forecast?.daily && forecast.daily.time.map((date, i) => (
          <div className="forecast-row" key={date}>
            <div className="forecast-day">{i === 0 ? 'Now' : DAYS[new Date(date).getDay()]}</div>
            <div className="forecast-desc">{WX_LABELS[forecast.daily.weathercode[i]] ?? '—'}</div>
            <div className="forecast-temps">
              {Math.round(forecast.daily.temperature_2m_max[i])}°
              <span className="low">{Math.round(forecast.daily.temperature_2m_min[i])}°</span>
            </div>
          </div>
        ))}
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

function CrewTab() {
  return (
    <div className="cards" style={{ paddingTop: 24 }}>
      <div className="card">
        <div className="card-label">Crew</div>
        <div className="card-sub">Coming soon — poll & vibe check</div>
      </div>
    </div>
  )
}

function ExploreTab() {
  return (
    <div className="cards" style={{ paddingTop: 24 }}>
      <div className="card">
        <div className="card-label">Explore</div>
        <div className="card-sub">Coming soon — restaurants & stores</div>
      </div>
    </div>
  )
}

function GamesTab() {
  return (
    <div className="cards" style={{ paddingTop: 24 }}>
      <div className="card">
        <div className="card-label">Games</div>
        <div className="card-sub">Coming soon — Kubb scoreboard</div>
      </div>
    </div>
  )
}

// --- APP ---

const TABS = [
  { id: 'home',    label: 'Home',    icon: '🏠' },
  { id: 'weather', label: 'Weather', icon: '🌤' },
  { id: 'crew',    label: 'Crew',    icon: '🤙' },
  { id: 'explore', label: 'Explore', icon: '🗺' },
  { id: 'games',   label: 'Games',   icon: '🏆' },
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