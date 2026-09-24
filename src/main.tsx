import { StrictMode, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import gsap from 'gsap'
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import world from 'world-atlas/countries-110m.json'
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
const WORLD_FEATURE = feature(world as never, world.objects.countries as never) as never

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

function fetchObject(id: number) {
  return Promise.all([fetch(CATALOG_URL(id)), fetch(TLE_URL(id))]).then(async ([catalogResponse, tleResponse]) => {
    if (!catalogResponse.ok || !tleResponse.ok) throw new Error(`NORAD ${id} returned an HTTP error`)
    const catalog = (await catalogResponse.json() as OrbitalObject[])[0]
    const tleLines = (await tleResponse.text()).trim().split(/\r?\n/)
    if (!catalog || tleLines.length < 3) throw new Error(`NORAD ${id} returned incomplete orbital data`)
    return { ...catalog, tle1: tleLines[1], tle2: tleLines[2] }
  })
}

function WorldGlobe({ objects, positions, selected, onSelect, simulationTime }: { objects: OrbitalObject[]; positions: Record<number, Position>; selected: OrbitalObject | null; onSelect: (item: OrbitalObject) => void; simulationTime: Date }) {
  const [rotation, setRotation] = useState<[number, number, number]>([0, -18, 0])
  const dragStart = useRef<{ x: number; y: number; rotation: [number, number, number] } | null>(null)
  const projection = geoOrthographic().rotate(rotation).translate([300, 300]).scale(278)
  const path = geoPath(projection)
  const graticule = path(geoGraticule10()) ?? ''
  const project = (position: Position) => projection([position.longitude, position.latitude])
  const trailFor = (item: OrbitalObject) => {
    const segments: string[] = []
    let segment: string[] = []
    for (let minutes = 0; minutes <= 100; minutes += 2) {
      const point = propagatePosition(item, new Date(simulationTime.getTime() + minutes * 60000))
      const projected = point ? project(point) : null
      if (projected && Math.hypot(projected[0] - 300, projected[1] - 300) <= 278) {
        segment.push(`${projected[0]},${projected[1]}`)
      } else if (segment.length > 1) {
        segments.push(segment.join(' '))
        segment = []
      } else {
        segment = []
      }
    }
    if (segment.length > 1) segments.push(segment.join(' '))
    return segments
  }
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { x: event.clientX, y: event.clientY, rotation }
  }
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragStart.current) return
    setRotation([dragStart.current.rotation[0] + (event.clientX - dragStart.current.x) * 0.45, dragStart.current.rotation[1] - (event.clientY - dragStart.current.y) * 0.35, 0])
  }
  return <div className="globe-wrap"><svg className="globe-map" viewBox="0 0 600 600" role="img" aria-label="Draggable Earth map" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={() => { dragStart.current = null }} onPointerCancel={() => { dragStart.current = null }}>
    <circle className="globe-surface" cx="300" cy="300" r="278" />
    <path className="graticule" d={graticule} />
    <path className="countries" d={path(WORLD_FEATURE) ?? ''} />
    {objects.map((item) => trailFor(item).map((points, index) => <polyline className="orbit-trail" key={`${item.NORAD_CAT_ID}-${index}`} points={points} />))}
    {objects.map((item) => {
      const position = positions[item.NORAD_CAT_ID]
      const point = position ? project(position) : null
      if (!point || Math.hypot(point[0] - 300, point[1] - 300) > 278) return null
      return <g className={`map-marker ${selected?.NORAD_CAT_ID === item.NORAD_CAT_ID ? 'selected' : ''}`} key={item.NORAD_CAT_ID} transform={`translate(${point[0]} ${point[1]})`} role="button" tabIndex={0} aria-label={`Select ${item.OBJECT_NAME}`} onClick={() => onSelect(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(item) }}><circle className="marker-halo" r="11" /><circle className="marker-core" r="4" /><text x="9" y="3">{item.NORAD_CAT_ID}</text></g>
    })}
    <circle className="globe-edge" cx="300" cy="300" r="278" />
  </svg><p className="globe-caption">Drag to rotate the world<br /><span>Live propagated positions · {new Date().toLocaleTimeString()}</span></p></div>
}

function App() {
  const [objects, setObjects] = useState<OrbitalObject[]>([])
  const [positions, setPositions] = useState<Record<number, Position>>({})
  const [selected, setSelected] = useState<OrbitalObject | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [timeOffsetMinutes, setTimeOffsetMinutes] = useState(0)
  const [playing, setPlaying] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.allSettled(NORAD_IDS.map(fetchObject))
      .then((results) => {
        const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
        setObjects(loaded)
        if (loaded.length < NORAD_IDS.length) setError(`${NORAD_IDS.length - loaded.length} object(s) could not be loaded; showing the records that responded.`)
        setStatus(loaded.length ? 'ready' : 'error')
        if (!loaded.length) setError('CelesTrak returned no usable records for this watchlist.')
      })
  }, [])

  useEffect(() => {
    const updatePositions = () => {
      const now = new Date(Date.now() + timeOffsetMinutes * 60000)
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
  }, [objects, timeOffsetMinutes])

  useEffect(() => {
    if (!playing) return
    const interval = window.setInterval(() => setTimeOffsetMinutes((offset) => offset >= 100 ? 0 : offset + 1), 100)
    return () => window.clearInterval(interval)
  }, [playing])

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
          <WorldGlobe objects={objects} positions={positions} selected={selected} onSelect={setSelected} simulationTime={lastUpdated} />
          <div className="time-control"><button onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause' : 'Play path'}</button><input type="range" min="0" max="100" value={timeOffsetMinutes} onChange={(event) => setTimeOffsetMinutes(Number(event.target.value))} /><span>{timeOffsetMinutes === 0 ? 'NOW' : `+${timeOffsetMinutes} MIN`}</span></div>
        </div>
      </section>

      <section id="explore" className="explorer">
        <div className="section-heading">
          <div><p className="eyebrow">NORAD watchlist / live propagation</p><h2>Objects in <em>orbit.</em></h2></div>
          <p className="source-note">Source: <a href="https://celestrak.org/" target="_blank" rel="noreferrer">CelesTrak GP data</a><br />Refreshes every 5 seconds</p>
        </div>
        <div className="stats"><div><strong>{objects.length}</strong><span>selected objects</span></div><div><strong>{Object.keys(positions).length}</strong><span>positions available</span></div><div><strong>{averageAltitude.toLocaleString()} km</strong><span>mean altitude</span></div><div><strong>{lastUpdated.toLocaleTimeString()}</strong><span>last calculation</span></div></div>
        {error && <div className="error">{status === 'error' ? `Could not load live CelesTrak data: ${error}` : error}</div>}
        {status === 'loading' ? <div className="loading">Fetching ten TLE records<span>···</span></div> : <div className="object-grid">{objects.map((item) => <button className={`object-card ${selected?.NORAD_CAT_ID === item.NORAD_CAT_ID ? 'active-card' : ''}`} key={item.NORAD_CAT_ID} onClick={() => setSelected(item)}><span className="type-dot" /><strong>{item.OBJECT_NAME}</strong><small>NORAD {item.NORAD_CAT_ID} · {positions[item.NORAD_CAT_ID]?.altitude.toFixed(0) ?? '—'} km altitude</small></button>)}</div>}
        <p className="result-note">Tracking only the 10 NORAD catalog IDs supplied for this phase. “Right now” is an estimate propagated from each object’s latest published TLE.</p>
      </section>

      {selected && <div className="detail-backdrop" onClick={() => setSelected(null)}><aside className="detail-panel" onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">NORAD {selected.NORAD_CAT_ID} / selected object</p><h2>{selected.OBJECT_NAME}</h2>{selectedPosition && <div className="position-readout"><strong>{selectedPosition.latitude.toFixed(2)}° <small>LAT</small></strong><strong>{selectedPosition.longitude.toFixed(2)}° <small>LON</small></strong></div>}<dl><div><dt>Estimated altitude</dt><dd>{selectedPosition?.altitude.toFixed(1) ?? altitudeKm(selected.MEAN_MOTION)} km</dd></div><div><dt>Inclination</dt><dd>{selected.INCLINATION.toFixed(2)}°</dd></div><div><dt>Element epoch</dt><dd>{formatAge(selected.EPOCH)}</dd></div></dl><a href={`https://celestrak.org/NORAD/elements/gp.php?CATNR=${selected.NORAD_CAT_ID}&FORMAT=json`} target="_blank" rel="noreferrer">View live source record ↗</a></aside></div>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
