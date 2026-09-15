/**
 * Share → Web handoff bridge (runs inside Capacitor WebView / handoff page).
 * Native adapters stage files + open:
 *   /intake/handoff?clientBatchId=…&source=ANDROID_SHARE|IOS_SHARE&text=…
 *
 * Authenticated upload is performed by the web handoff client using the
 * dealer session cookie — Share Extension never supplies dealerId.
 */
(function () {
  if (typeof window === "undefined") return;
  var params = new URLSearchParams(window.location.search || "");
  var staged = params.get("staged");
  var clientBatchId = params.get("clientBatchId");
  if (staged && clientBatchId && window.console) {
    console.info("[rematcher-share-bridge] staged batch", clientBatchId);
  }
})();
