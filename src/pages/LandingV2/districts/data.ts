import type { District } from './types'

/**
 * The MIND World districts.
 *
 * Per MIND_WORLD_VISION § 3:
 *   - 8 main districts at the positions established in Wave 1
 *   - 1 hidden 9th district (MINDsense Sanctuary) at the far north edge
 *
 * Position rule (Wave 2 / B2 cardinal lock): each main district's [x, z] is
 * preserved verbatim from the Wave 1 data.ts so that highways, plaza alignment,
 * and existing screenshots remain pixel-aligned. The new richer monument
 * factories (factories/*.ts) place their geometry RELATIVE to these anchors.
 *
 * Hidden Sanctuary at [0, -105] sits well outside the 240×240 visible band of
 * the world; it's intentionally fog-occluded until the car drives within ~12
 * units (proximity threshold tightened in Wave 4 / D4).
 *
 * Color hexes match the brand palette in § 1 + the provider colors in § 3.
 * Do not edit without product approval.
 */
export const DISTRICTS: District[] = [
  // ─── 1. Memory Atrium (north) ──────────────────────────────────────
  {
    key: 'memory',
    title: 'Memory',
    tagline: 'Where everything lives.',
    detail:
      'Every document, decision, and conversation becomes part of your MIND. Retrievable across every model. Every session. Forever. Patents pending on the memory architecture.',
    cta: 'See your memory',
    ctaPath: '/register',
    position: [0, -42],
    color: 0xf43f3f,
    beacons: [
      'Every doc you add is remembered forever.',
      'Patents pending on the architecture.',
      'Retrievable across 50+ models.',
    ],
  },

  // ─── 2. Knowledge Graph Observatory (northeast) ────────────────────
  {
    key: 'graph',
    title: 'Knowledge Graph',
    tagline: 'Your mind, visualized.',
    detail:
      'A navigable graph of entities and relationships. Click any node, chat scoped to it. See the patterns your brain already had.',
    cta: 'Explore the graph',
    ctaPath: '/register',
    position: [32, -12],
    color: 0x4fb3f7,
    beacons: [
      'Click any node, chat scoped to it.',
      'Your patterns become visible.',
      'Live data — no fake counts.',
    ],
  },

  // ─── 3. Models Boulevard (east) ────────────────────────────────────
  {
    key: 'models',
    title: '50+ AI Models',
    tagline: 'Every frontier model.',
    detail:
      'Claude, GPT, Grok, Gemini, DeepSeek, Llama, Mistral, Qwen — and 40+ more. Switch mid-conversation. Your MIND carries context across every one.',
    cta: 'Compare models',
    ctaPath: '/llmmodels',
    position: [14, 36],
    color: 0xffcc4d,
    beacons: [
      'Switch model mid-conversation.',
      'Your MIND carries context across all of them.',
      'Vendor-agnostic. Future-proof.',
    ],
  },

  // ─── 4. Agent Town (southeast) ─────────────────────────────────────
  {
    key: 'agents',
    title: 'Agent Mode',
    tagline: 'AI that takes action.',
    detail:
      'Read, create, and act — each tier separately gated. Every destructive action requires explicit confirmation. Real work, not chat.',
    cta: 'Try Agent Mode',
    ctaPath: '/register',
    position: [22, -36],
    color: 0x77e8a0,
    beacons: [
      'Read · Create · Act — separately gated.',
      'Every destructive action confirmed.',
      'Tools across every category.',
    ],
  },

  // ─── 5. Creative Studio Quarter (south) ────────────────────────────
  {
    key: 'studio',
    title: 'Creative Studio',
    tagline: 'Built in.',
    detail:
      'Video, image, music, voice — generated inside your MIND, grounded in your knowledge. Veo, Sora, Nano Banana, ElevenLabs, Suno, all native.',
    cta: 'Open the Studio',
    ctaPath: '/register',
    position: [-16, -34],
    color: 0xc78cff,
    beacons: [
      'Veo, Sora, Nano Banana, ElevenLabs, Suno — native.',
      'Grounded in your knowledge.',
      'Studio is built in, not bolted on.',
    ],
  },

  // ─── 6. Life Board City (southwest) ────────────────────────────────
  {
    key: 'life',
    title: 'Life Board',
    tagline: 'Thoughts → done.',
    detail:
      'Capture an idea. MIND turns it into a plan. Schedules it. Tracks it. Learns from what you finish. The board where your life moves.',
    cta: 'Open Life Board',
    ctaPath: '/register',
    position: [-38, -20],
    color: 0xff8b5a,
    beacons: [
      'Capture an idea → plan → schedule → done.',
      'Learns from what you finish.',
      'The board where your life moves.',
    ],
  },

  // ─── 7. Developer Arcade (west) ────────────────────────────────────
  {
    key: 'api',
    title: 'Developer API',
    tagline: 'Build on MIND.',
    detail:
      'Every tool surfaced as a REST API and an official MCP server. Build agents that read and write your MIND from any runtime.',
    cta: 'Read the API docs',
    ctaPath: '/register',
    position: [-32, 12],
    color: 0x44e2c9,
    beacons: [
      'REST + MCP — both shipping.',
      'Build agents that read + write your MIND.',
      'Official npm package available.',
    ],
  },

  // ─── 8. Patents Pavilion (northwest) ───────────────────────────────
  {
    key: 'patents',
    title: 'Patents Pending',
    tagline: 'The moat.',
    detail:
      'Patents pending on the persistent-memory architecture, the agent-confirmation system, and the cross-model context layer.',
    cta: 'About the moat',
    ctaPath: '/register',
    position: [-32, 24],
    color: 0xf6e8d9,
    beacons: [
      'Memory architecture.',
      'Cross-agent MCP.',
      'Autonomous Learning Engine.',
      'Emotion-weighted encoding.',
      'Featured Minds marketplace.',
    ],
  },

  // ─── 9. (HIDDEN) MINDsense Sanctuary — far north ───────────────────
  // Easter egg per § 13 #1. Counter remains 8 / 8 until the car drives
  // past the Memory district to find this; then it morphs to 9 / 9.
  {
    key: 'mindsense',
    title: 'MINDsense',
    tagline: 'The feeling layer.',
    detail:
      'Your MIND remembers how it felt. MINDsense weighs every memory by emotional signal, so the moments that mattered surface first.',
    cta: 'Unlock the feeling layer',
    ctaPath: '/register',
    position: [0, -105],
    color: 0xc8a1ff,
    hidden: true,
    beacons: [
      'Your MIND remembers how it felt.',
      'MINDsense weighs memory by emotion.',
      'Patents pending on the feeling layer.',
    ],
  },
]

/**
 * Backwards-compat: existing code (SceneRoot, ui/index) imports MONUMENTS.
 * Expose the 8 main districts under the old name. Hidden districts (the
 * Sanctuary) are accessed separately via `HIDDEN_DISTRICTS` so the discovery
 * counter shows `X / 8` until the easter egg is found.
 */
export const MONUMENTS = DISTRICTS.filter((d) => !d.hidden)

/** Hidden districts — accessed by the discovery counter + scene loader. */
export const HIDDEN_DISTRICTS = DISTRICTS.filter((d) => d.hidden === true)
