import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { LoaderShell } from './pages/LandingV2/ui/Loader'

/**
 * Lazy-import the LandingV2 surface so the loader can paint immediately
 * while Three.js + scene code download. Suspense fallback uses the same
 * branded LoaderShell the post-mount loader uses so visual continuity is
 * preserved across the JS-chunk → asset-load → ready transition.
 */
const LandingV2 = lazy(() => import('./pages/LandingV2'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoaderShell />}>
        <Routes>
          <Route path="/" element={<LandingV2 />} />
          <Route path="/LandingV2" element={<LandingV2 />} />
          <Route path="/landingv2" element={<Navigate to="/LandingV2" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
