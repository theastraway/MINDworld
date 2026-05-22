import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || ''
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let initialized = false

// UTM params captured once on landing, then attached to signup_completed so the
// admin attribution funnel can answer "which channels drive qualified users?"
const UTM_STORAGE_KEY = '_mindapp_utm'

function captureUtmFromLocation() {
  try {
    const url = new URL(window.location.href)
    const utm: Record<string, string> = {}
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer']
    let found = false
    for (const k of keys) {
      const v = url.searchParams.get(k)
      if (v) {
        utm[k] = v
        found = true
      }
    }
    if (!utm.referrer && document.referrer && !document.referrer.includes(window.location.host)) {
      utm.referrer = document.referrer
      found = true
    }
    if (found) {
      const existing = localStorage.getItem(UTM_STORAGE_KEY)
      if (!existing) {
        utm.first_seen_at = new Date().toISOString()
        localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm))
      }
    }
  } catch {
    // never let UTM capture break page load
  }
}

/** Read the landing-page UTM attribution for attaching to signup events. */
export function getLandingAttribution(): Record<string, string> {
  try {
    const raw = localStorage.getItem(UTM_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    persistence: 'localStorage+cookie',
    // Disable session replay by default to avoid accidental PII capture.
    // Can be re-enabled per-session via posthog.startSessionRecording() if ever needed.
    disable_session_recording: true,
  })
  initialized = true
  captureUtmFromLocation()
  // Fire a session_start once per mounted app instance. session_end is covered
  // by posthog's own capture_pageleave.
  try {
    posthog.capture('session_start', {
      landed_at: new Date().toISOString(),
      ...getLandingAttribution(),
    })
  } catch {
    // noop
  }
}

export function identifyUser(username: string, properties?: Record<string, any>) {
  if (!POSTHOG_KEY) return
  posthog.identify(username, properties)
}

export function resetAnalytics() {
  if (!POSTHOG_KEY) return
  posthog.reset()
}

export function trackEvent(event: string, properties?: Record<string, any>) {
  if (!POSTHOG_KEY) return
  posthog.capture(event, properties)
}

export function trackPageView(path: string) {
  if (!POSTHOG_KEY) return
  posthog.capture('$pageview', { $current_url: path })
}

// ─── Pre-defined events ──────────────────────────────────────────────────

// Helper: fire an event only once per browser (persisted in localStorage)
function trackOnce(key: string, event: string, properties?: Record<string, any>) {
  const storageKey = `_ph_once_${key}`
  if (localStorage.getItem(storageKey)) return
  trackEvent(event, properties)
  localStorage.setItem(storageKey, '1')
}

export const analytics = {
  // ── Auth ──────────────────────────────────────────────────────────────
  signUp: (method: string) => trackEvent('user_signed_up', { method }),
  signIn: (method: string) => trackEvent('user_signed_in', { method }),
  signOut: () => trackEvent('user_signed_out'),

  // ── Conversion funnel ─────────────────────────────────────────────────
  /** Fired when user initiates sign-up (clicks CTA / submit) */
  signupStarted: (method: 'email' | 'google') =>
    trackEvent('signup_started', { method }),

  /** Fired immediately after account is created. Attaches landing-page UTM
   *  attribution so the admin dashboard attribution funnel can credit the
   *  right channel. */
  signupCompleted: (method: 'email' | 'google', username?: string) =>
    trackEvent('signup_completed', { method, username, ...getLandingAttribution() }),

  /** Fired the very first time a user makes a query — once per browser */
  firstQueryMade: (mode: string) =>
    trackOnce('first_query', 'first_query_made', { mode }),

  /** Fired the very first time a user uploads a document — once per browser */
  firstDocumentUploaded: (fileType?: string) =>
    trackOnce('first_doc', 'first_document_uploaded', { file_type: fileType }),

  /** Fired when user clicks Upgrade on a paywall/upsell modal */
  upgradeClicked: (tier: string, source: string) =>
    trackEvent('upgrade_clicked', { tier, source }),

  /** Fired when the paywall/upsell modal is shown to the user */
  paywallHit: (reason: string, details?: Record<string, any>) =>
    trackEvent('paywall_hit', { reason, ...details }),

  /** Fired when a user closes a paywall modal WITHOUT clicking upgrade — key
   *  funnel-leakage signal. */
  paywallAbandoned: (reason: string, details?: Record<string, any>) =>
    trackEvent('paywall_abandoned', { reason, ...details }),

  // ── Queries ───────────────────────────────────────────────────────────
  query: (mode: string, model?: string) => trackEvent('query_sent', { mode, model }),
  queryStreamed: (mode: string, model?: string) => trackEvent('query_streamed', { mode, model }),

  /** Fired when user invokes Agent mode for a query (distinct from plain query) */
  agentModeTriggered: (toolCount?: number) =>
    trackEvent('agent_mode_triggered', { tool_count: toolCount }),

  // ── Documents ─────────────────────────────────────────────────────────
  documentUploaded: (type: string) => trackEvent('document_uploaded', { file_type: type }),
  documentTrained: () => trackEvent('document_trained'),

  // ── Social / sharing / thoughts ───────────────────────────────────────
  /** User posted a thought to the feed. */
  thoughtCreated: (hasImage?: boolean) => trackEvent('thought_created', { has_image: !!hasImage }),
  /** User clicked the AI "generate thought" flow. */
  thoughtGenerated: () => trackEvent('thought_generated'),
  thoughtShared: (platform: string) => trackEvent('thought_shared', { platform }),
  shareAsImage: () => trackEvent('share_as_image'),

  publicMindEnabled: () => trackEvent('public_mind_enabled'),
  publicMindDisabled: () => trackEvent('public_mind_disabled'),
  publicMindQueried: (username: string) => trackEvent('public_mind_queried', { mind_username: username }),

  // ── Life board ────────────────────────────────────────────────────────
  lifeItemCreated: (stage: string) => trackEvent('life_item_created', { stage }),
  lifeItemCompleted: (stage?: string) => trackEvent('life_item_completed', { stage }),
  lifeItemMoved: (fromStage: string, toStage: string) =>
    trackEvent('life_item_moved', { from_stage: fromStage, to_stage: toStage }),

  // ── CRM / Automation ──────────────────────────────────────────────────
  crmContactCreated: (type?: string) => trackEvent('crm_contact_created', { contact_type: type }),
  crmDealWon: () => trackEvent('crm_deal_won'),

  automationCreated: (interval: string) => trackEvent('automation_created', { interval }),

  // ── Billing ───────────────────────────────────────────────────────────
  /** Fired on SubscriptionSuccessPage — the browser's post-checkout confirmation.
   *  Stripe-webhook-sourced `stripe_subscription_created` is the authoritative
   *  revenue event, but this fires the moment the user returns from checkout. */
  subscriptionStarted: (plan: string) => trackEvent('subscription_started', { plan }),
  /** Fired on SubscriptionCancelPage — user returned without completing. */
  checkoutCancelled: (plan?: string) => trackEvent('checkout_cancelled', { plan }),
  creditsPurchased: (amount: number) => trackEvent('credits_purchased', { amount }),

  // ── Onboarding ────────────────────────────────────────────────────────
  tourCompleted: (stepsViewed: number) => trackEvent('tour_completed', { steps_viewed: stepsViewed }),
  tourSkipped: (skippedAtStep: number, totalSteps: number) =>
    trackEvent('tour_skipped', { skipped_at_step: skippedAtStep, total_steps: totalSteps }),

  // ── MINDsense ─────────────────────────────────────────────────────────
  mindsenseSignalProcessed: (emotion?: string, valence?: number) =>
    trackEvent('mindsense_signal_processed', { emotion, valence }),

  // ── Errors ────────────────────────────────────────────────────────────
  /** Standard shape for API failures across the app. `feature` is a short slug
   *  (e.g. 'chat_query', 'doc_upload', 'crm_create'). `status` is the HTTP code
   *  where applicable. `code` is an app-level error code if the API returns one. */
  apiError: (feature: string, status?: number, code?: string) =>
    trackEvent('api_error', { feature, status, code }),

  featureUsed: (feature: string) => trackEvent('feature_used', { feature }),
  pageViewed: (page: string) => trackPageView(page),
}
