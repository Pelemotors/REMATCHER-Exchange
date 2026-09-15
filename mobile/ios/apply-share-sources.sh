#!/usr/bin/env bash
# Copy REMATCHER iOS Share sources into a Capacitor ios/ project (run on macOS after `npx cap add ios`).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS_APP="${1:-$ROOT/ios/App/App}"
EXT_DIR="${2:-$ROOT/ios/App/ShareExtension}"

if [[ ! -d "$IOS_APP" ]]; then
  echo "Capacitor App dir not found: $IOS_APP"
  echo "On a Mac: cd repo && npm i @capacitor/ios && npx cap add ios && re-run this script."
  exit 1
fi

mkdir -p "$IOS_APP/ShareStaging" "$EXT_DIR"

cp -f "$ROOT/mobile/ios/App/ShareStaging/ShareStagingStore.swift" "$IOS_APP/ShareStaging/"
cp -f "$ROOT/mobile/ios/App/ShareStaging/ShareStagingPlugin.swift" "$IOS_APP/ShareStaging/"
cp -f "$ROOT/mobile/ios/App/IntakeShareHandoff.swift" "$IOS_APP/"
cp -f "$ROOT/mobile/ios/App/App.entitlements" "$IOS_APP/App.entitlements"
cp -f "$ROOT/mobile/ios/App/PrivacyInfo.xcprivacy" "$IOS_APP/PrivacyInfo.xcprivacy"

cp -f "$ROOT/mobile/ios/App/ShareExtension/ShareViewController.swift" "$EXT_DIR/"
cp -f "$ROOT/mobile/ios/App/ShareExtension/Info.plist" "$EXT_DIR/"
cp -f "$ROOT/mobile/ios/App/ShareExtension/ShareExtension.entitlements" "$EXT_DIR/"

echo "Copied Share Extension + ShareStaging sources."
echo "Still required in Xcode (cannot automate without pbxproj on Linux):"
echo "  1. Create Share Extension target co.rematcher.exchange.ShareExtension"
echo "  2. Add App Group group.co.rematcher.exchange to App + Extension"
echo "  3. Merge URL scheme rematcher-exchange into App Info.plist (see Info-IntakeShare.plist)"
echo "  4. Wire AppDelegate open-URL → IntakeShareAppBridge (see AppDelegate+IntakeShare.swift.example)"
echo "  5. Add ShareStaging/*.swift to App target membership"
echo "  6. Set RematcherIntakeBaseURL / Capacitor server.url to Field Test or Production"
