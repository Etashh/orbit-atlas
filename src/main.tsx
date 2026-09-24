import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import gsap from 'gsap'
import { eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from 'satellite.js'
import './styles.css'

type OrbitalObject = {
  OBJECT_NAME: string
  OBJECT_ID: string
  NORAD_CAT_ID: number
  EPOCH: string
  MEAN_MOTION: number
  INCLINATION: number
  tle1: string
  tle2: string
}

type Position = { latitude: number; longitude: number; altitude: number }
type Status = 'loading' | 'ready' | 'error'

const NORAD_IDS = [36441, 35462, 33916, 37218, 31698, 11, 61446, 38761, 49119, 48274]
const CATALOG_URL = (id: number) => `https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=json`
const TLE_URL = (id: number) => `https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=tle`
const EARTH_RADIUS_KM = 6378.137
const EARTH_GRAVITATIONAL_PARAMETER = 398600.4418

function altitudeKm(meanMotion: number) {
  const semiMajorAxis = Math.cbrt(EARTH_GRAVITATIONAL_PARAMETER / ((meanMotion * 2 * Math.PI / 86400) ** 2))
  return Math.round(semiMajorAxis - EARTH_RADIUS_KM)
}

function formatAge(epoch: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epoch))
}

function propagatePosition(item: OrbitalObject, date = new Date()): Position | null {
  try {
    const satrec: SatRec = twoline2satrec(item.tle1, item.tle2)
    const propagated = propagate(satrec, date)
    if (!propagated || !propagated.position || typeof propagated.position === 'boolean') return null
    const geodetic = eciToGeodetic(propagated.position, gstime(date))
    return { latitude: geodetic.latitude * 180 / Math.PI, longitude: geodetic.longitude * 180 / Math.PI, altitude: geodetic.height }
  } catch {
    return null
  }
}

function markerStyle(position: Position) {
  return { left: `${50 + position.longitude / 3.6}%`, top: `${50 - position.latitude / 1.8}%` }
}

function App() {
  const [objects, setObjects] = useState<OrbitalObject[]>([])
  const [positions, setPositions] = useState<Record<number, Position>>({})
  const [selected, setSelected] = useState<OrbitalObject | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all(NORAD_IDS.map(async (id) => {
      const [catalogResponse, tleResponse] = await Promise.all([fetch(CATALOG_URL(id)), fetch(TLE_URL(id))])
      if (!catalogResponse.ok || !tleResponse.ok) throw new Error(`CelesTrak could not load NORAD ${id}`)
      const catalog = (await catalogResponse.json() as OrbitalObject[])[0]
      const tleLines = (await tleResponse.text()).trim().split(/\r?\n/)
      return { ...catalog, tle1: tleLines[1], tle2: tleLines[2] }
    }))
      .then((data) => {
        setObjects(data)
        setStatus('ready')
      })
      .catch((fetchError: Error) => {
        setError(fetchError.message)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    const updatePositions = () => {
      const now = new Date()
      const next: Record<number, Position> = {}
      objects.forEach((item) => {
        const position = propagatePosition(item, now)
        if (position) next[item.NORAD_CAT_ID] = position
      })
      setPositions(next)
      setLastUpdated(now)
    }
    updatePositions()
    const interval = window.setInterval(updatePositions, 5000)
    return () => window.clearInterval(interval)
  }, [objects])

  useEffect(() => {
    if (!heroRef.current) return
    gsap.fromTo(heroRef.current.querySelectorAll('.hero-copy > *'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: .8, stagger: .1, ease: 'power3.out' })
  }, [])

  const selectedPosition = selected ? positions[selected.NORAD_CAT_ID] : null
  const averageAltitude = useMemo(() => objects.length ? Math.round(objects.reduce((sum, item) => sum + altitudeKm(item.MEAN_MOTION), 0) / objects.length) : 0, [objects])

  return (
    <main className="site-shell">
      <nav className="nav">
        <a className="wordmark" href="/">ORBIT<span>ATLAS</span></a>
        <span className={`nav-status ${status}`}><i /> {status === 'loading' ? 'Loading selected objects' : status === 'ready' ? `${objects.length} objects · live positions` : 'Data unavailable'}</span>
      </nav>

      <section ref={heroRef} className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Your orbital watchlist</p>
          <h1>Ten objects<br /><em>right now.</em></h1>
          <p className="lede">A focused live view of the NORAD catalog IDs you provided. Positions are propagated from their latest CelesTrak two-line elements.</p>
          <a className="cta" href="#explore">Inspect the watchlist <span>↓</span></a>
        </div>
        <div className="globe-wrap">
          <div className="globe">
            <div className="latitude latitude-one" /><div className="latitude latitude-two" /><div className="longitude longitude-one" /><div className="longitude longitude-two" />
            {objects.map((item) => positions[item.NORAD_CAT_ID] && <button className={`globe-marker ${selected?.NORAD_CAT_ID === item.NORAD_CAT_ID ? 'selected' : ''}`} key={item.NORAD_CAT_ID} style={markerStyle(positions[item.NORAD_CAT_ID])} title={item.OBJECT_NAME} onClick={() => setSelected(item)}><span /></button>)}
            <div className="globe-shine" />
          </div>
          <span className="globe-label label-n">N</span><span className="globe-label label-s">S</span>
          <p className="globe-caption">Live propagated positions<br /><span>{lastUpdated.toLocaleTimeString()}</span></p>
        </div>
      </section>

      <section id="explore" className="explorer">
        <div className="section-heading">
          <div><p className="eyebrow">NORAD watchlist / live propagation</p><h2>Objects in <em>orbit.</em></h2></div>
          <p className="source-note">Source: <a href="https://celestrak.org/" target="_blank" rel="noreferrer">CelesTrak GP data</a><br />Refreshes every 5 seconds</p>
        </div>
        <div className="stats"><div><strong>{objects.length}</strong><span>selected objects</span></div><div><strong>{Object.keys(positions).length}</strong><span>positions available</span></div><div><strong>{averageAltitude.toLocaleString()} km</strong><span>mean altitude</span></div><div><strong>{lastUpdated.toLocaleTimeString()}</strong><span>last calculation</span></div></div>
        {status === 'error' && <div className="error">Could not load live CelesTrak data: {error}. Check your connection and try again.</div>}
        {status === 'loading' ? <div className="loading">Fetching ten TLE records<span>···</span></div> : <div className="object-grid">{objects.map((item) => <button className={`object-card ${selected?.NORAD_CAT_ID === item.NORAD_CAT_ID ? 'active-card' : ''}`} key={item.NORAD_CAT_ID} onClick={() => setSelected(item)}><span className="type-dot" /><strong>{item.OBJECT_NAME}</strong><small>NORAD {item.NORAD_CAT_ID} · {positions[item.NORAD_CAT_ID]?.altitude.toFixed(0) ?? '—'} km altitude</small></button>)}</div>}
        <p className="result-note">Tracking only the 10 NORAD catalog IDs supplied for this phase. “Right now” is an estimate propagated from each object’s latest published TLE.</p>
      </section>

      {selected && <div className="detail-backdrop" onClick={() => setSelected(null)}><aside className="detail-panel" onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">NORAD {selected.NORAD_CAT_ID} / selected object</p><h2>{selected.OBJECT_NAME}</h2>{selectedPosition && <div className="position-readout"><strong>{selectedPosition.latitude.toFixed(2)}° <small>LAT</small></strong><strong>{selectedPosition.longitude.toFixed(2)}° <small>LON</small></strong></div>}<dl><div><dt>Estimated altitude</dt><dd>{selectedPosition?.altitude.toFixed(1) ?? altitudeKm(selected.MEAN_MOTION)} km</dd></div><div><dt>Inclination</dt><dd>{selected.INCLINATION.toFixed(2)}°</dd></div><div><dt>Element epoch</dt><dd>{formatAge(selected.EPOCH)}</dd></div></dl><a href={`https://celestrak.org/NORAD/elements/gp.php?CATNR=${selected.NORAD_CAT_ID}&FORMAT=json`} target="_blank" rel="noreferrer">View live source record ↗</a></aside></div>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
