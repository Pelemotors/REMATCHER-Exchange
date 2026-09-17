# 05 — iOS Architecture

**Stack (locked):** Swift, SwiftUI, async/await, URLSession, Keychain, APNs, Universal Links.

Third-party libraries: **none at foundation**. Add only with a written reason in this spec.

Allowed later (not now): a crash SDK at Gate 5 if approved.  
Not allowed: Alamofire “because everyone uses it”, Firebase except FCM is Android, Kingfisher if `URLCache` + `AsyncImage`/thin loader suffice.

---

## App lifecycle

- `@main` `REMATCHERApp` → `AppEnvironment` (injected).
- Cold start: load Keychain session → if refresh present, `GET /me` → route to gate or `MainTabView`.
- `scenePhase` background: cancel non-critical tasks; keep upload task identifiers.
- Foreground: refresh access if near expiry; flush pending push token.

## Navigation

- Unauthenticated: `NavigationStack` of auth screens.
- Authenticated: `TabView` matching product IA (see 08): בית, המלאי, קליטת רכב, חיפוש, עוד.
- Capture tab is a root, not a modal-only flow (product invariant), but camera/gallery use system pickers.
- Detail: `navigationDestination` for inventory/demand/match/reveal.
- Agent: `sheet` / fullScreenCover from shell — one conversation, not a sixth tab.
- Deep links: `onOpenURL` + `NSUserActivity` (Universal Links) → `DeepLinkRouter` after auth.

## Dependency injection

- `AppEnvironment` struct: `api`, `session`, `keychain`, `push`, `imageLoader`.
- Injected via `Environment` / view initializer. No service locator singleton soup.
- Protocol per boundary (`APIClienting`, `SessionStore`) for tests.

## Networking

- `URLSession` with ephemeral config + custom `URLCache` for GETs that are cacheable (media thumbs only with auth).
- `APIClient` attaches Bearer, client headers, `Idempotency-Key` on mutating domain calls, decodes error envelope.
- Timeouts: 15s default; Agent turn 50s (server 45s); upload 120s.
- Decoder: ISO-8601 dates; unknown JSON keys ignored only if OpenAPI says additionalProperties.

## Auth / session

- `SessionController`: actor holding access token; refresh **single-flight**.
- On 401 `AUTH_TOKEN_EXPIRED` → refresh → retry once.
- On `AUTH_TOKEN_REVOKED` / `AUTH_REFRESH_EXPIRED` → wipe Keychain → login.

## State

- Screen: `Observable` / `@Observable` view models (iOS 17+). Minimum OS: **OPEN TECHNICAL** (recommend iOS 17 to match SwiftUI Observation; if iOS 16 required, use `ObservableObject`).
- Server remains source of truth. Local cache is display-only (lists) and discarded on logout.

## Repositories

```
View → ViewModel → Repository → APIClient → /api/v1
```

No View talks to URLSession. Repositories map DTO → domain structs shared conceptually with Android names.

## Images

- `URLSession` download + `URLCache` (memory+disk) for `/api/v1/media`.
- Auth header on image requests. Do not use naked `AsyncImage` for private media.
- Thumbnails first; full display on detail.

## Uploads

- `URLSessionUploadTask` / streamed multipart.
- Progress via `URLSessionTaskDelegate`.
- Background `URLSession` configuration for capture batches leaving the app.
- Retry GET status of batch; retry media POST only with new Idempotency-Key if the first attempt’s outcome is unknown — see 10.

## Push

- `UNUserNotificationCenter` + APNs token → `POST /api/v1/devices`.
- Notification `userInfo.deepLink` must be an allowlisted path.
- No visible processing of payload beyond routing.

## Logging

- `os.Logger` subsystem `co.rematcher.exchange`.
- Never log tokens, passwords, plates, phone numbers, refresh.

## Errors

- Map `error.code` → `AppAlert` / inline banner. Hebrew `message` as body.
- Agent timeout → specific copy, not generic crash.

## Accessibility

- VoiceOver labels on Exchange Mark, cards, primary CTA.
- Dynamic Type; 44pt min tap (token `spacing.touchMin`).
- Reduce Motion: Exchange Mark stays on `idle`.

## Localization / RTL

- `he` default. LayoutDirection RTL.
- `locale=he_IL` for numbers; currency ₪; plates/models may stay LTR spans.

## Testing

- ViewModel tests with `URLProtocol` stubs.
- Deep-link router tests.
- Auth refresh single-flight tests.
- UI tests: login, capture permission interrupt (real device for camera).
