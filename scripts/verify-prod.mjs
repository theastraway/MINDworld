// Verify the production MIND World deployment at https://mindworld.vercel.app.
// Same instrumentation as scripts/verify.mjs, but pinned to the live URL
// so the F1+F2 handoff can confirm the standalone is healthy from a real
// browser context (full Chrome for Testing, WebGL via Metal/ANGLE).
process.env.VERIFY_URL = 'https://mindworld.vercel.app/LandingV2'
await import('./verify.mjs')
