/**
 * Public, non-secret analytics configuration.
 *
 * The Google Analytics measurement ID is designed to be present in browser
 * source. Authentication material never belongs here. The client controller
 * still fails closed: it loads the provider only after explicit consent and
 * only when the rendered page is eligible for public-page measurement.
 */
export const ANALYTICS_CONFIG = {
  measurementId: "G-MLJL08H3M2",
  preferenceStorageKey: "k8p_analytics_consent_v1",
  cookiePrefix: "k8p",
  cookieNamePrefix: "k8p_ga",
  cookieLifetimeSeconds: 90 * 24 * 60 * 60,
} as const;
