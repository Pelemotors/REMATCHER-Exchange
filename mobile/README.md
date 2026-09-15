# REMATCHER Mobile OS Adapters

Capacitor shell + Android Share Receiver + iOS Share Extension.

## Status

Source adapters are real implementations of receive → durable stage → deep-link handoff.
Signing, App Store / Play distribution, and device install require owner accounts
(`USER DISTRIBUTION: ACTION REQUIRED`).

## Next engineering steps (after Field Test HTTPS URL exists)

1. `npm i -D @capacitor/cli @capacitor/core` at repo or mobile package
2. `npx cap add android` / `npx cap add ios` using this folder
3. Merge `SHARE_MANIFEST_SNIPPET.xml` and iOS Share Extension target + App Group
4. Build signed artifacts for owner device test
