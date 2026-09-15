# ADR-001 — Mobile Share Architecture (Search-First Intake)

**Status:** Accepted  
**Date:** 2026-09-15  
**Branch:** `rebuild/search-first-vnext`  
**Baseline:** `ddd3d8de0bd4fb58c096ed604fe15a7c057b2975`

## Context

REMATCHER Exchange must support:

```
WhatsApp → Share → REMATCHER → durable ACK → dealer is done
```

on both iPhone and Android, while remaining **one Web-first product**. Native code is an OS adapter only.

## Decision

**Architecture: Capacitor shell + platform Share receivers** wrapping the shared Next.js/web product and shared backend Intake APIs.

| Layer | Responsibility |
|-------|----------------|
| Shared Web (Next.js) | Inventory, Intake review, auth UI, Matching UX |
| Shared Backend | Intake, media pipeline, GOV, OCR/AI with provenance, Matching, privacy |
| Android adapter | `ACTION_SEND` / `ACTION_SEND_MULTIPLE` receiver → durable local persist → authenticated upload → ACK |
| iOS adapter | Share Extension + App Group + containing app → same handoff contract |

**Rejected as primary paths:**
- PWA `share_target` alone — insufficient / inconsistent for WhatsApp on iOS; not a substitute for Share Extension
- Full native rewrite of REMATCHER — violates single-product rule
- Web-only “save then upload” as Happy Path — violates UX north star

## Track A — Mobile Architecture

**MOBILE ARCHITECTURE: GO**

The Share → Intake → ACK contract is implementable on both platforms with thin native adapters and shared APIs.

## Track B — User Distribution (not an architecture blocker)

**USER DISTRIBUTION: ACTION REQUIRED** (at signing/distribution time)

### Android — what a normal user needs eventually

1. **Google Play Console** account (one-time org registration / fee as required by Google)
2. App signing key (Play App Signing recommended)
3. Listing + release track: **Internal testing** (email list) → **Closed/Open testing** → Production
4. User installs from Play Store (or Play testing link), opens app once, logs in, grants OS permissions
5. WhatsApp Share Sheet then lists REMATCHER

**Not acceptable end-user paths:** UDID lists, developer USB sideload as the product path, MDM, manual per-dealer binary.

### iPhone — what a normal user needs eventually

1. **Apple Developer Program** membership (annual)
2. App ID with capabilities: App Groups, Share Extension
3. Distribution via **TestFlight (External)** after Beta App Review, or **App Store**
4. User installs via TestFlight/App Store link, opens containing app once, logs in, grants permissions
5. WhatsApp Share Sheet then lists REMATCHER Share Extension

**Not acceptable:** Ad Hoc UDID provisioning, Xcode-per-device installs, MDM, manual invite-as-only-path for every dealer forever (TestFlight external link after review is OK).

### Owner actions (when we reach device install)

| When | Owner action |
|------|----------------|
| Before first signed Android build | Create/confirm Google Play Console access |
| Before first signed iOS build | Create/confirm Apple Developer Program + App IDs/capabilities |
| Before external testers | Complete store listing / TestFlight beta review as required |

Until those exist, engineering continues: Intake domain, Field Test backend, adapters source, unsigned/local developer builds for engineering only.

## Authentication handoff (architecture)

- Dealer identity comes only from authenticated session/token minted by the server after login in the containing app
- Share Extension / receiver never accepts client-supplied `dealerId` as authority
- If Share arrives while logged out: durable local staging → open app → login → attach Batch (when platform-safe)

## Checkpoint

```
MOBILE ARCHITECTURE: GO
USER DISTRIBUTION: ACTION REQUIRED
```

Continue server + adapter implementation until signing/distribution is the only remaining step for owner device test.
