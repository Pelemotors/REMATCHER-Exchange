/** @type {import('@capacitor/cli').CapacitorConfig} */
const fieldTestHost = "https://field-test-exchange.rematcher.co.il";
const productionHost = "https://exchange.rematcher.co.il";
const webUrl = (process.env.MOBILE_WEB_URL || fieldTestHost).replace(/\/$/, "");

const config = {
  appId: "co.rematcher.exchange",
  appName: "REMATCHER Exchange",
  // Config lives in mobile/ — webDir is relative to this file.
  webDir: "www",
  server: {
    url: webUrl,
    cleartext: false,
    allowNavigation: [
      `${fieldTestHost}/*`,
      `${productionHost}/*`,
      `${webUrl}/*`,
    ],
  },
  android: {
    path: "../android",
    allowMixedContent: false,
  },
  ios: {
    // Generated on macOS: `npx cap add ios` then `bash mobile/ios/apply-share-sources.sh`
    path: "../ios",
    scheme: "REMATCHER Exchange",
    contentInset: "automatic",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#070C14",
    },
  },
};

module.exports = config;
