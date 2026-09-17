# 11 — Account, Privacy, Store

## Lifecycle (Mobile + server)

| State | Meaning | App behavior |
|---|---|---|
| Active | `accountStatus=ACTIVE`, dealer verified, privacy AI done | Main tabs |
| Email unverified | | `AUTH.VERIFY` |
| Pending dealer | `verificationStatus=PENDING` | `AUTH.PENDING` |
| Rejected | | `AUTH.REJECTED` |
| Suspended | `User.accountStatus=SUSPENDED` | no login/refresh; `AUTH.SUSPENDED` |
| Disabled | dealer `isActive=false` / DISABLED | `PERMISSION_DEALER_DISABLED` |
| Deletion requested | `AccountDeletionRequest.PENDING` | limited? **OPEN PRODUCT** — recommend: still usable until confirm |
| Deletion processing | PROCESSING | logged out; cannot login |
| Deleted/anonymized | COMPLETED per policy | cannot login |

Entitlement/paywall is orthogonal (`FREE`/`TRIAL`/…). Monetization is **off** in Production; keep `BILL.PAYWALL` implemented behind flag.

---

## Deletion workflow (spec only)

Today’s code: owner request/confirm → forget memory, delete push subs, disable dealer. JWT still valid. Rows remain. **Not Store-ready.**

Target workflow (no legal invention):

```
reauth
  → POST request (PENDING)
  → confirm
  → revoke all Mobile refresh + Web session epoch
  → immediate access removal (cannot /me)
  → async job: apply POLICY
  → processor cleanup (OpenAI: UNKNOWN; Resend: UNKNOWN; APNs/FCM token delete)
  → COMPLETED or FAILED (retryable)
```

Per data class: see `docs/mobile-audit/phase-3b-data-map.md`.  
Anything without a written policy: **POLICY DECISION REQUIRED**.

App Store / Play require an in-app deletion path **and** a web/URL path. Web already has `/account/privacy`. Keep that URL working.

---

## Store compliance track (not implementation)

Owner = product/legal unless noted. Status = not started.

### Apple

| Item | Owner | Dependency | Status |
|---|---|---|---|
| Privacy Policy URL | Legal | existing `/privacy` | existing Web |
| App Privacy nutrition | Legal + eng | data map | **POLICY** |
| Account deletion | Eng B16 + policy | policy decisions | gap |
| Sign in with Apple if other OAuth | Eng | Google OAuth retained? | **OPEN PRODUCT** |
| AI disclosure / consent | Privacy AI screen | already a gate | preserve |
| Camera / photos / notifications permissions strings | Eng | Capture, Push | |
| Review demo dealer | Ops | Field Test account | |
| Screenshots / metadata Hebrew | Product | Gate 6 | |
| Age rating | Legal | | |
| IAP | Product | monetization off | **OPEN PRODUCT** — ship without IAP unless flag on |
| Export compliance / encryption | Eng | HTTPS only | |

### Google

| Item | Owner | Dependency | Status |
|---|---|---|---|
| Data Safety form | Legal + eng | data map | **POLICY** |
| Privacy Policy | Legal | | |
| In-app + external deletion | B16 | policy | gap |
| Permissions | Eng | camera, notifications, photos | |
| targetSDK current | Eng M04 | | |
| Closed Testing 14 days / 20 testers (policy as of 2023+; **verify at submission time**) | Ops | Gate 6 | UNKNOWN / verify |
| Content rating IARC | Legal | | |
| Play Billing if paid | Product | | **OPEN PRODUCT** |

Do not invent retention years. `getRetentionPolicy()` is product intent, not a legal opinion.

---

## Permissions (product)

| Permission | Why | When to ask |
|---|---|---|
| Camera | Capture | on first shutter, not at login |
| Photo library | gallery intake | on first gallery |
| Notifications | matches/opps | after first successful login, not before value |
| Network | all | implicit |

No location permission. No contacts. No Bluetooth.
