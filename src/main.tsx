import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster } from 'sonner'

import './index.css'
import App from './App'
import { initAnalytics } from './lib/analytics'

// Initialise PostHog before the first render so the `landingv2_loaded`
// event captured inside LandingV2's mount effect actually flushes.
initAnalytics()

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('MIND World: #root element missing from index.html')
}

// NOTE: <StrictMode> intentionally omitted.
//
// The LandingV2 surface mounts Three.js scenes, joystick controls, audio
// engines, and DOM-mutating head-strip effects (Meta.tsx). StrictMode's
// double-invoke of mount effects causes spurious `removeChild` crashes
// where the head-strip cleanup races Helmet's own DOM patching, and the
// double scene boot leaks WebGL contexts on lower-end devices. The
// MINDapp host also runs without StrictMode for the same reasons.
createRoot(rootEl).render(
  <HelmetProvider>
    <App />
    <Toaster richColors position="top-center" />
  </HelmetProvider>,
)
