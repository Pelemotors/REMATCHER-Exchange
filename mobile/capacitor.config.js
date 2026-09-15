/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "co.rematcher.exchange",
  appName: "REMATCHER Exchange",
  webDir: "www",
  server: {
    // Field Test / Production URL injected at build time — never hardcode secrets
    url: process.env.MOBILE_WEB_URL || "http://127.0.0.1:3100",
    cleartext: true,
  },
};

module.exports = config;
