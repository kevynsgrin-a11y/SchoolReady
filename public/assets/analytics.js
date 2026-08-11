/**
 * Explicit-consent GA4 controller for eligible public pages.
 *
 * This same-origin script performs no network request by itself. It loads the
 * Google tag only after the visitor opts in, never when a browser privacy
 * signal is active, and only when the server rendered a measurement ID. The
 * server omits that ID from saved-plan and other noindex pages.
 */
(function analyticsConsent() {
  "use strict";

  var panel = document.querySelector("[data-analytics-consent]");
  if (!panel) return;

  var allowButton = panel.querySelector("[data-analytics-allow]");
  var declineButton = panel.querySelector("[data-analytics-decline]");
  var status = panel.querySelector("[data-analytics-status]");
  var privacySignalNote = panel.querySelector("[data-analytics-privacy-signal]");
  var openButtons = document.querySelectorAll("[data-analytics-open]");
  var storageKey = panel.getAttribute("data-storage-key") || "";
  var measurementId = panel.getAttribute("data-measurement-id") || "";
  var cookiePrefix = panel.getAttribute("data-cookie-prefix") || "";
  var cookieNamePrefix = panel.getAttribute("data-cookie-name-prefix") || "";
  var cookieLifetimeSeconds = Number(
    panel.getAttribute("data-cookie-lifetime-seconds") || "0",
  );
  var TAG_SCRIPT_ID = "ga4-public-page-tag";
  var GRANTED = "granted";
  var DENIED = "denied";
  var hasPrivacySignal =
    navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === "1" ||
    window.doNotTrack === "1";
  var tagLoaded = false;
  var currentPreference = readPreference();

  window.dataLayer = window.dataLayer || [];

  function gtag() {
    window.dataLayer.push(arguments);
  }

  function consentState(analyticsStorage) {
    return {
      ad_storage: DENIED,
      ad_user_data: DENIED,
      ad_personalization: DENIED,
      analytics_storage: analyticsStorage,
    };
  }

  function readPreference() {
    if (!storageKey) return null;
    try {
      var stored = window.localStorage.getItem(storageKey);
      return stored === GRANTED || stored === DENIED ? stored : null;
    } catch {
      return null;
    }
  }

  function writePreference(value) {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      /* Storage can be unavailable; the current page still honors the choice. */
    }
  }

  function sanitizedUrl(rawValue) {
    if (!rawValue) return "";
    try {
      var parsed = new URL(rawValue, window.location.href);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
      return parsed.origin + parsed.pathname;
    } catch {
      return "";
    }
  }

  function setStatus(value) {
    if (!status) return;
    var attribute =
      value === GRANTED
        ? "data-status-granted"
        : value === DENIED
          ? "data-status-denied"
          : "data-status-pending";
    status.textContent = panel.getAttribute(attribute) || "";
  }

  function clearAnalyticsCookies() {
    if (!cookieNamePrefix || !document.cookie) return;
    document.cookie.split(";").forEach(function clearCookie(cookie) {
      var name = cookie.split("=")[0].trim();
      if (name.indexOf(cookieNamePrefix) !== 0) return;
      var removal = name + "=; Max-Age=0; Path=/; SameSite=Lax; Secure";
      document.cookie = removal;
      if (window.location.hostname.indexOf(".") !== -1) {
        document.cookie =
          removal + "; Domain=" + window.location.hostname;
      }
    });
  }

  function loadTag() {
    if (
      tagLoaded ||
      hasPrivacySignal ||
      currentPreference !== GRANTED ||
      !/^G-[A-Z0-9]+$/.test(measurementId) ||
      !cookiePrefix ||
      !Number.isFinite(cookieLifetimeSeconds) ||
      cookieLifetimeSeconds <= 0
    ) {
      return;
    }

    if (document.getElementById(TAG_SCRIPT_ID)) {
      tagLoaded = true;
      return;
    }

    gtag("set", "allow_google_signals", false);
    gtag("set", "allow_ad_personalization_signals", false);
    gtag("js", new Date());
    gtag("config", measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_prefix: cookiePrefix,
      cookie_expires: cookieLifetimeSeconds,
      cookie_update: false,
      cookie_flags: "SameSite=Lax;Secure",
      page_location: sanitizedUrl(window.location.href),
      page_referrer: sanitizedUrl(document.referrer),
      send_page_view: true,
    });

    var script = document.createElement("script");
    script.id = TAG_SCRIPT_ID;
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(measurementId);
    document.head.appendChild(script);
    tagLoaded = true;
  }

  function showPanel() {
    setStatus(hasPrivacySignal ? DENIED : currentPreference);
    panel.hidden = false;
  }

  function hidePanel() {
    panel.hidden = true;
  }

  gtag("consent", "default", consentState(DENIED));

  Array.prototype.forEach.call(openButtons, function enablePreferences(button) {
    button.hidden = false;
    button.addEventListener("click", showPanel);
  });

  if (hasPrivacySignal) {
    currentPreference = DENIED;
    if (allowButton) allowButton.disabled = true;
    if (privacySignalNote) privacySignalNote.hidden = false;
    setStatus(DENIED);
  } else if (currentPreference === GRANTED) {
    gtag("consent", "update", consentState(GRANTED));
    loadTag();
  } else if (currentPreference !== DENIED) {
    showPanel();
  }

  if (allowButton) {
    allowButton.addEventListener("click", function allowAnalytics() {
      if (hasPrivacySignal) return;
      currentPreference = GRANTED;
      writePreference(GRANTED);
      gtag("consent", "update", consentState(GRANTED));
      loadTag();
      setStatus(GRANTED);
      hidePanel();
    });
  }

  if (declineButton) {
    declineButton.addEventListener("click", function declineAnalytics() {
      currentPreference = DENIED;
      writePreference(DENIED);
      gtag("consent", "update", consentState(DENIED));
      clearAnalyticsCookies();
      setStatus(DENIED);
      hidePanel();
    });
  }
})();
