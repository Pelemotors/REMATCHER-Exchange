# REMATCHER Mobile OS Adapters

Capacitor shell + Android Share Receiver + iOS Share Extension.

## Status (Field Test)

| Layer | Status |
|-------|--------|
| Android Share Receiver (in real app) | Wired in `android/` Capacitor project |
| ShareStaging → authenticated Intake → ACK | `ShareStagingPlugin` |
| Signed Field Test APK (direct HTTPS) | See `docs/ANDROID_FIELD_TEST_INSTALL.md` |
| Google Play | Not required for Field Test |
| iOS TestFlight | Owner actions: `docs/IOS_TESTFLIGHT_OWNER_ACTIONS.md` |

## Android build (engineering)

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_SDK_ROOT=/opt/rematcher-android-sdk
export ANDROID_HOME=$ANDROID_SDK_ROOT
MOBILE_WEB_URL=https://field-test-exchange.rematcher.co.il npx cap sync android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
# Signing via .secrets/key.properties (gitignored)
```

## Deep link / Share contract

```
/intake/handoff?clientBatchId=<uuid>&source=ANDROID_SHARE|IOS_SHARE&staged=1&text=<optional>
```
