import { useEffect, useState } from 'react'
import './App.css'

const TRIP = {
  title: 'Rally Crew',
  dates: 'May 23 – 30, 2026',
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

// Open-Meteo coords for North Topsail Beach
const LAT = 34.485
const LON = -77.387

// NOAA station: Wilmington, NC (closest with tide data)
const NOAA_STATION = '8658120'

function useWeather() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&temperature_unit=fahrenheit&windspeed_unit=mph`
    )
      .then(r => r.json())
      .then(d => setData(d.current))
      .catch(() => setError(true))
  }, [])

  return { data, error }
}

function useNoaaTides() {
  const [tides, setTides] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const today = new Date()
    const pad = n => String(n).padStart(2, '0')
    const dateStr =
      `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`

    fetch(
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${dateStr}&range=24&station=${NOAA_STATION}&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=web_services&format=json`
    )
      .then(r => r.json())
      .then(d => {
        if (d.predictions) setTides(d.predictions)
        else setError(true)
      })
      .catch(() => setError(true))
  }, [])

  return { tides, error }
}
function useMarine() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(
      `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=wave_height,wave_direction,sea_surface_temperature&length_unit=imperial&temperature_unit=fahrenheit`
    )
      .then(r => r.json())
      .then(d => setData(d.current))
      .catch(() => setError(true))
  }, [])

  return { data, error }
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

export default function App() {
   const weather = useWeather()
  const marine = useMarine()
  const { tides, error: tideError } = useNoaaTides()

  return (
    <div className="app">
      {/* HERO */}
      <div className="hero">
        <div className="hero-eyebrow">Beach Trip 2025</div>
        <div className="hero-title">{TRIP.title}</div>
        <div className="hero-dates">{TRIP.dates}</div>
        <a className="hero-address" href={TRIP.mapsUrl} target="_blank" rel="noreferrer">
          📍 {TRIP.address}
        </a>
      </div>

      <div className="cards">

        {/* WEATHER */}
        <div className="card">
          <div className="card-label">Current Weather</div>
          {weather.error && <div className="error">Unable to load weather</div>}
          {!weather.data && !weather.error && <div className="loading">Loading...</div>}
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
                <div className="card-detail" style={{ marginTop: '10px' }}>
                  <span>Water Temp</span> {Math.round(marine.data.sea_surface_temperature)}°F
                  {'  ·  '}
                  <span>Wave Height</span> {(marine.data.wave_height).toFixed(1)} ft
                </div>
              )}
            </>
          )}
        </div>

        {/* TIDES */}
        <div className="card">
          <div className="card-label">Today's Tides · Wilmington Station</div>
          {tideError && <div className="error">Unable to load tide data</div>}
          {!tides && !tideError && <div className="loading">Loading...</div>}
          {tides && tides.map((t, i) => (
            <div className="tide-row" key={i}>
              <span className={`tide-type ${t.type === 'H' ? 'high' : 'low'}`}>
                {t.type === 'H' ? 'High' : 'Low'}
              </span>
              <span className="tide-time">{formatTideTime(t.t)}</span>
              <span className="tide-height">{parseFloat(t.v).toFixed(1)} ft</span>
            </div>
          ))}
        </div>

        {/* ACTIVITIES */}
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

      <div className="footer">∿ TOPSAIL BEACH · MMX X V ∿</div>
    </div>
  )
}