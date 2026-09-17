# 06 — Android Architecture

**Stack (locked):** Kotlin, Jetpack Compose, Coroutines, Flow, Navigation Compose, Android Keystore / EncryptedSharedPreferences, FCM, App Links.

Third-party: **minimal**.

| Library | Why |
|---|---|
| `okhttp` + `okhttp-logging-interceptor` (debug only) | TLS, interceptors, timeouts — platform `HttpURLConnection` is weaker for auth intercept |
| `kotlinx.serialization` | JSON matching iOS Codable; no Gson/Moshi extra |
| Coil | image loading with custom OkHttp (auth headers). Justified: Compose + auth + cache. Alternative (pure custom) is more error-prone |

**Not** Hilt if a simple manual graph / `app` Module suffices at V1 — **recommendation: no Hilt until a third module appears**. Start with constructor injection from `Application`.  
**Not** Retrofit unless OpenAPI codegen is chosen (open technical). Manual OkHttp + serialization is enough for a bounded `/api/v1`.  
**Not** Firebase Analytics. FCM only.

---

## Application lifecycle

- `REMATCHERApp : Application` creates `AppGraph`.
- `ProcessLifecycleOwner` for foreground token refresh.
- Logout clears graph-scoped session + image cache directory.

## Navigation

- NavHost: auth graph vs main graph.
- Main: bottom `NavigationBar` — same five destinations as iOS.
- Capture is a tab destination.
- Agent: modal Compose destination / bottom sheet scaffold.
- App Links: `navDeepLink` + post-auth `DeepLinkRouter`.

## DI

- `AppGraph` holds `ApiClient`, `SessionStore`, `DeviceRepository`.
- ViewModels: `viewModel { }` factory from graph. No AndroidViewModel unless `SavedStateHandle` needed for deep-link ids.

## Networking

- OkHttp authenticator: 401 expired → refresh single-flight (Mutex) → retry.
- Interceptors: client headers, requestId from UUID if server didn't assign yet.
- Timeouts aligned with iOS.

## Auth / storage

- Access in memory; refresh in EncryptedSharedPreferences (MasterKey AES256-GCM).
- `SessionRepository` is the only writer.

## State

- `ViewModel` + `StateFlow<UiState>`.
- UiState must include `Idle | Loading | Empty | Error(code) | Data`.
- Unidirectional: events in, state out.

## Repositories

Same conceptual names as iOS (`InventoryRepository`, `MatchRepository`, …).

## Images

- Coil with OkHttp that attaches Bearer.
- Disk cache in app cache dir; wipe on logout.

## Uploads

- OkHttp multipart.
- WorkManager **only** if a capture batch must survive process death — optional P3. V1: in-process retry + user-visible failure.

## Push

- `FirebaseMessagingService` for token + data messages.
- Token → `POST /api/v1/devices` with `pushProvider=FCM`.
- Do not include `google-services.json` from Production in Dev flavor.

## Logging

- `Log` with tag `RMX` at Dev/Field Test.
- Production: no HTTP bodies. Timber **not** required.

## Errors / a11y / RTL

- Same error codes as iOS.
- TalkBack contentDescription on Mark, nav, cards.
- `layoutDirection = Rtl`; `locale he`.
- Minimum tap 48dp (Material) but visual tokens stay 44–52 from brand.

## Testing

- ViewModel + fake `ApiClient`.
- Compose UI tests for login and match card semantics.
- Deep-link intent tests.
- Instrumented auth storage on a real device class (Samsung + Pixel).
