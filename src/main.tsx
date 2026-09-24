import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import gsap from 'gsap'
import './styles.css'

type OrbitalObject = {
  OBJECT_NAME: string
  OBJECT_ID: string
  NORAD_CAT_ID: number
  EPOCH: string
  MEAN_MOTION: number
  INCLINATION: number
}

type Filter = 'all' | 'satellite' | 'debris' | 'rocket'

const API_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
const EARTH_RADIUS_KM = 6378.137
const EARTH_GRAVITATIONAL_PARAMETER = 398600.4418

function objectType(name: string): Exclude<Filter, 'all'> {
  const normalized = name.toUpperCase()
  if (normalized.includes('DEB') || normalized.includes('FRAGMENT')) return 'debris'
  if (normalized.includes('R/B') || normalized.includes('ROCKET BODY')) return 'rocket'
  return 'satellite'
}

function altitudeKm(meanMotion: number) {
  const semiMajorAxis = Math.cbrt(EARTH_GRAVITATIONAL_PARAMETER / ((meanMotion * 2 * Math.PI / 86400) ** 2))
  return Math.round(semiMajorAxis - EARTH_RADIUS_KM)
}

function formatAge(epoch: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epoch))
}

function App() {
  const [objects, setObjects] = useState<OrbitalObject[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<OrbitalObject | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(API_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`CelesTrak returned ${response.status}`)
        return response.json() as Promise<OrbitalObject[]>
      })
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
    if (!heroRef.current) return
    gsap.fromTo(heroRef.current.querySelectorAll('.hero-copy > *'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: .8, stagger: .1, ease: 'power3.out' })
  }, [])

  const filteredObjects = useMemo(() => objects
    .filter((item) => filter === 'all' || objectType(item.OBJECT_NAME) === filter)
    .filter((item) => item.OBJECT_NAME.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80), [objects, filter, query])

  const counts = useMemo(() => ({
    all: objects.length,
    satellite: objects.filter((item) => objectType(item.OBJECT_NAME) === 'satellite').length,
    debris: objects.filter((item) => objectType(item.OBJECT_NAME) === 'debris').length,
    rocket: objects.filter((item) => objectType(item.OBJECT_NAME) === 'rocket').length,
  }), [objects])

  return (
    <main className="site-shell">
      <nav className="nav">
        <a className="wordmark" href="/">ORBIT<span>ATLAS</span></a>
        <span className={`nav-status ${status}`}><i /> {status === 'loading' ? 'Connecting to CelesTrak' : status === 'ready' ? `${objects.length.toLocaleString()} active objects` : 'Data unavailable'}</span>
      </nav>

      <section ref={heroRef} className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A living map of Earth orbit</p>
          <h1>Everything<br /><em>up there.</em></h1>
          <p className="lede">Explore the machines, fragments, and invisible infrastructure circling our planet—updated from CelesTrak’s active orbital catalog.</p>
          <a className="cta" href="#explore">Enter the atlas <span>↓</span></a>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="earth"><div className="earth-glow" /></div>
          <div className="ring ring-one" /><div className="ring ring-two" /><div className="satellite">✦</div>
        </div>
      </section>

      <section id="explore" className="explorer">
        <div className="section-heading">
          <div><p className="eyebrow">Live catalog / active group</p><h2>The orbital <em>commons.</em></h2></div>
          <p className="source-note">Source: <a href="https://celestrak.org/" target="_blank" rel="noreferrer">CelesTrak GP data</a><br />Epochs shown per object</p>
        </div>
        <div className="stats">
          <div><strong>{counts.all.toLocaleString()}</strong><span>tracked objects</span></div>
          <div><strong>{counts.satellite.toLocaleString()}</strong><span>satellites</span></div>
          <div><strong>{counts.debris.toLocaleString()}</strong><span>debris records</span></div>
          <div><strong>{counts.rocket.toLocaleString()}</strong><span>rocket bodies</span></div>
        </div>
        {status === 'error' && <div className="error">Could not load live CelesTrak data: {error}. Check your connection and try again.</div>}
        <div className="controls">
          <div className="filters">{(['all', 'satellite', 'debris', 'rocket'] as Filter[]).map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div>
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search object name" /></label>
        </div>
        {status === 'loading' ? <div className="loading">Reading the sky<span>···</span></div> : <div className="object-grid">{filteredObjects.map((item) => <button className="object-card" key={item.NORAD_CAT_ID} onClick={() => setSelected(item)}><span className={`type-dot ${objectType(item.OBJECT_NAME)}`} /><strong>{item.OBJECT_NAME}</strong><small>NORAD {item.NORAD_CAT_ID} · {altitudeKm(item.MEAN_MOTION).toLocaleString()} km</small></button>)}</div>}
        {status === 'ready' && filteredObjects.length === 0 && <div className="loading">No objects match that search.</div>}
        <p className="result-note">Showing {Math.min(filteredObjects.length, 80)} of {objects.length.toLocaleString()} active catalog records.</p>
      </section>

      {selected && <div className="detail-backdrop" onClick={() => setSelected(null)}><aside className="detail-panel" onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">{objectType(selected.OBJECT_NAME)} / selected object</p><h2>{selected.OBJECT_NAME}</h2><dl><div><dt>NORAD catalog ID</dt><dd>{selected.NORAD_CAT_ID}</dd></div><div><dt>Estimated altitude</dt><dd>{altitudeKm(selected.MEAN_MOTION).toLocaleString()} km</dd></div><div><dt>Inclination</dt><dd>{selected.INCLINATION.toFixed(2)}°</dd></div><div><dt>Element epoch</dt><dd>{formatAge(selected.EPOCH)}</dd></div></dl><a href={`https://celestrak.org/NORAD/elements/gp.php?CATNR=${selected.NORAD_CAT_ID}&FORMAT=json`} target="_blank" rel="noreferrer">View source record ↗</a></aside></div>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
