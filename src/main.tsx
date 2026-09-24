import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function App() {
  return (
    <main className="site-shell">
      <nav className="nav">
        <a className="wordmark" href="/">ORBIT<span>ATLAS</span></a>
        <span className="nav-status"><i /> Data layer initializing</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A living map of Earth orbit</p>
          <h1>Everything<br /><em>up there.</em></h1>
          <p className="lede">Explore the machines, fragments, and invisible infrastructure circling our planet—and the choices that shape their future.</p>
          <a className="cta" href="#explore">Enter the atlas <span>↓</span></a>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="earth"><div className="earth-glow" /></div>
          <div className="ring ring-one" /><div className="ring ring-two" /><div className="satellite">✦</div>
        </div>
      </section>

      <section id="explore" className="intro">
        <p className="eyebrow">The orbital commons</p>
        <h2>Earth is surrounded by a<br /><em>shared, crowded frontier.</em></h2>
        <p>Orbit Atlas will connect live orbital elements from CelesTrak with launch histories, operators, and debris research—turning a complicated catalog into something you can feel.</p>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
