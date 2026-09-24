# Orbit Atlas

An interactive, no-login guide to the objects circling Earth.

Orbit Atlas is planned as a scroll-driven data story combining live orbital data with launch history, operators, debris research, and carefully labeled Kessler-syndrome scenarios. The frontend will use React, GSAP, and Spline.

## Getting started

```bash
npm install
npm run dev
```

## Data source

- [CelesTrak GP API](https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json) for current active-object orbital data. The browser requests this public endpoint directly, so no visitor login or API key is needed.
- [Launch Library 2](https://thespacedevs.com/llapi) for launch history
- NASA and ESA publications for orbital debris and re-entry research

The application should cache upstream data and display source timestamps. Object ownership and future-collision scenarios must be presented with uncertainty rather than implied as definitive facts.
