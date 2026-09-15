/**
 * Share → Web handoff bridge (runs inside Capacitor WebView / handoff page).
 * Native adapters stage files + open:
 *   rematcher-exchange://intake?clientBatchId=…&source=IOS_SHARE|ANDROID_SHARE&staged=1
 * which the containing app maps to:
 *   /intake/handoff?clientBatchId=…&source=…&staged=1&text=…
 *
 * Authenticated upload is performed by ShareStaging Capacitor plugin using the
 * dealer session cookie — Share Extension never supplies dealerId.
 */
(function () {
  if (typeof window === "undefined") return;

  function navigateHandoffFromAppUrl(raw) {
    try {
      var url = new URL(raw);
      var isScheme = url.protocol === "rematcher-exchange:";
      var isIntake = url.host === "intake" || /intake/i.test(url.pathname);
      if (!isScheme || !isIntake) return;
      var q = url.search || "";
      if (q.indexOf("staged=") === -1) {
        q += (q ? "&" : "?") + "staged=1";
      }
      if (q.indexOf("source=") === -1) {
        q += "&source=IOS_SHARE";
      }
      window.location.href = "/intake/handoff" + (q.charAt(0) === "?" ? q : "?" + q.replace(/^\?/, ""));
    } catch (_) {
      /* ignore */
    }
  }

  var params = new URLSearchParams(window.location.search || "");
  var staged = params.get("staged");
  var clientBatchId = params.get("clientBatchId");
  if (staged && clientBatchId && window.console) {
    console.info("[rematcher-share-bridge] staged batch", clientBatchId, params.get("source"));
  }

  // Capacitor App plugin (when present) — deep link while app already open.
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener("appUrlOpen", function (event) {
        if (event && event.url) navigateHandoffFromAppUrl(event.url);
      });
    }
  } catch (_) {
    /* optional */
  }
})();
