/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "co.rematcher.exchange",
  appName: "REMATCHER Field Test",
  webDir: "mobile/www",
  server: {
    url: process.env.MOBILE_WEB_URL || "https://field-test-exchange.rematcher.co.il",
    cleartext: false,
    allowNavigation: ["https://field-test-exchange.rematcher.co.il/*"],
  },
  android: {
    allowMixedContent: false,
  },
};
module.exports = config;
