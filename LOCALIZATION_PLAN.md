# English/German UI localization implementation plan

Status: Steps 1–5 implemented (localization foundation, account preferences,
language selectors, shared UI/formatting, reactive messages, compatible API error
codes, API types, and tests). Step 6, feature-wide UI migration, remains pending.
See `frontend/src/i18n/README.md` for usage and coverage inventory.

## 1. Outcome and scope

Deliver an English/German interface that users can switch immediately without
reloading, losing form edits, changing routes, or restarting document processing.
Include the core application, login/setup, and doctor share surfaces.

The selector offers `English`, `Deutsch`, and a translated `Automatic (browser
language)` option. Every authenticated role can change its own preference.
Anonymous visitors can change language before authentication.

Translate application-owned visible text, accessibility labels, tooltips,
validation, dialogs, notifications, statuses, chart labels, and common API errors.
Localize dates, numbers, and relative times consistently.

Keep these separate from interface language:

- OCR language, canonical AI output language, and document translation targets.
- Patient/document content, user-entered names, extracted medical terminology,
  provider/model identifiers, units, codes, filenames, and original documents.
- Email templates, generated reports/exports, and AI chat response language;
  changing those is a separate feature.
- Internal enum values, routes, saved column IDs, and API request values.

No runtime machine translation or external translation service is needed.

## 2. Architecture decisions

### Translation resources

- Add `i18next` and `react-i18next`, selecting mutually compatible current
  versions during implementation and updating `frontend/package-lock.json`.
- Bundle English and German resources into the frontend. Initially load both
  synchronously; avoid translation HTTP requests, missing asset errors, and
  Suspense transitions on a language switch.
- Use `en` and `de` as resource languages, with `en` fallback. Use `en-GB` and
  `de-DE` for display formatting. Language choice does not change timezone.
- Organize JSON resources by feature under `frontend/src/i18n/locales/{en,de}/`:
  `common`, `auth`, `documents`, `patients`, `clinical`, `settings`, `share`,
  and `errors`. Split a namespace further only when it becomes unwieldy.
- Use semantic keys, for example `documents:actions.reprocess`, rather than
  English sentences as keys. Type-check keys against the English resource shape.
- Translate whole messages using interpolation and plural forms. Use `Trans`
  for messages containing links/emphasis. Render user-supplied values as text;
  do not introduce raw HTML rendering for translations.
- Document a short glossary: neutral German wording, formal Sie when directly
  addressing the reader, consistent medical/UI terms, and product names retained.

### Provider placement and reactivity

- Initialize resources before the initial React render in `frontend/src/main.tsx`.
- Add the UI language provider in `frontend/src/Root.tsx`, outside toast and
  confirmation providers. This shared layer may read browser preferences but
  must make no backend calls.
- Mount a separate authenticated preference bridge inside `AdminProviders` in
  `frontend/src/App.tsx`, beneath `AuthProvider`. It must never mount on share
  routes, including share routes served by a core-mode instance.
- Update `document.documentElement.lang` whenever resolved language changes.
  Translate app-owned page titles as well.
- Use React translation subscriptions when rendering labels. Registries contain
  keys, not strings translated once at module import. Memoized labels depend on
  the resolved language or translation function.
- Never key the app/router/forms by locale. Language switching rerenders existing
  components rather than remounting them.

### Preference contract

Use `UiLanguagePreference = 'auto' | 'en' | 'de'`, distinct from the resolved
`UiLanguage = 'en' | 'de'`.

| Situation | Effective preference |
| --- | --- |
| Anonymous core/login/setup | Saved core guest preference, otherwise auto |
| Doctor share surface | Saved share guest preference, otherwise auto |
| Authenticated with a saved preference | Account preference, including auto |
| Authenticated without a saved preference | Core guest preference, otherwise auto |
| Explicit change while authenticated | Apply immediately and persist to that account |
| Logout | Return to core guest preference; do not overwrite it with the account value |

For auto, walk `navigator.languages` in preference order and select the first
supported base language (`de-AT` and `de-CH` resolve to `de`). Fall back to `en`
when none match. React to browser language changes only while auto is active.

Use distinct browser-storage keys for core guests and share guests. Guard storage
reads/writes so blocked or malformed storage cannot prevent rendering. Never
persist an inferred browser language as an explicit account choice.

Apply the saved account preference during auth resolution, before revealing the
authenticated shell. OIDC and password login both use `/api/auth/me` as the source.
Clear account-specific state on logout/account change. Do not automatically save
the guest preference during login. If an account has no preference, the first
explicit authenticated selection establishes it.

Serialize account preference writes and coalesce rapid selections so the last
selection wins on both client and server. Ignore stale responses after account
changes. On save failure, keep the session's selection and display a localized
"applied here, could not save" message; do not silently claim cross-device sync.
Avoid automatic retry loops and respect existing request-budget protections.

## 3. Ordered implementation work

### Step 1 — Inventory, resources, and initialization

Files: `frontend/package.json`, `frontend/package-lock.json`, new
`frontend/src/i18n/{index,resources,types,preferences}.ts`, locale JSON files,
`frontend/src/main.tsx`, and `frontend/src/test/setup.ts`.

1. Inventory strings in JSX, attributes, helper functions, registries, error
   handling, and backend responses. Track coverage by route/feature.
2. Establish resources, English fallback, typed translation keys, and German
   glossary. Add a small shared vocabulary without forcing context-dependent
   translations into one universal key.
3. Implement language normalization and preference resolution as pure functions.
4. Set up a fresh/deterministically reset translation instance in tests. Existing
   tests default explicitly to English, regardless of the runner's locale.
5. Add a resource-validation check for key parity, interpolation variables,
   plural forms, and empty values. Wire it into frontend CI.

Acceptance: initialization needs no API or translation-network request;
unsupported languages and malformed storage fall back safely; resource mistakes
fail validation with the offending key.

### Step 2 — Backend account preference

Files: `backend/asclepius/db/schema.sql`, new
`backend/asclepius/auth/preferences.py`, `backend/asclepius/auth/routes.py`, and
new `backend/tests/test_ui_language_preferences.py`.

1. Add `user_ui_preferences` with `user_id` as primary key and foreign key to
   `users(id) ON DELETE CASCADE`, `ui_language` constrained to auto/en/de, and
   `updated_at`. Missing row means no explicit account preference.
2. Use the existing startup schema execution to create this new table on fresh
   and existing databases; verify repeated initialization is safe. No backfill
   or repurposing of `user_view_prefs` is necessary.
3. Extend `GET /api/auth/me` with `ui_language: 'auto' | 'en' | 'de' | null`,
   preserving its existing fields. Read the preference explicitly rather than
   changing authentication/session queries throughout the application.
4. Add `PATCH /api/auth/me/preferences`, body `{ "ui_language": "de" }`,
   returning the persisted preference. Validate the enum; reject unknown fields.
   Derive user ID from authentication, never from caller input. All roles may
   update their own preference. Preserve existing CSRF/session protections.
5. Keep this route core-only through the existing auth router mounting.
6. Regenerate OpenAPI and frontend API types through the repository scripts.

Acceptance: viewer/editor/admin self-service works; anonymous writes fail;
invalid input is rejected; users cannot write another account's preference;
existing DBs initialize correctly and saved preferences survive restart.

### Step 3 — Switching UI and preference synchronization

Files: new `frontend/src/contexts/UiLanguageContext.tsx`, new authenticated
preference bridge and reusable `LanguageSwitcher`, `Root.tsx`, `App.tsx`,
`contexts/AuthContext.tsx`, login/setup pages, layout components, and share layout.

1. Implement the preference contract above, exposing preference, resolved
   language, saving state, and an explicit selection action.
2. Extend the authenticated user type and synchronize through `/auth/me` without
   adding a second polling/settings fetch. Keep the bridge out of shared providers.
3. Add a compact language selector to the core user controls/mobile navigation,
   login/setup, and share header. Use language names rather than flag icons.
4. Add an Interface/Appearance preference section accessible to all signed-in
   roles. Keep the existing admin-only Language tab for document translation,
   relabeling it clearly as document translation settings.
5. Handle failed saves, rapid changes, logout, and switching accounts as specified.

Acceptance: switching works without navigation/reload and preserves dirty forms;
saved preferences work on another browser; non-admins and anonymous share users
can choose language; language changes on share routes make zero admin API calls.

### Step 4 — Shared UI, formatting, and dynamic messages

Files: `components/layout/nav.ts`, document/imaging column registries,
`lib/pipelineStages.tsx`, `lib/utils.ts`, `lib/datetime.ts`, `contexts/ToastContext.tsx`,
`contexts/ConfirmContext.tsx`, shared UI components, and a new formatting hook/helper.

1. Convert navigation, page titles, columns, statuses, document types, pipeline
   stages, common buttons, placeholders, and accessibility labels to keys.
2. Preserve all internal IDs and graceful handling of unknown backend enum values.
3. Pass locale explicitly to pure formatters; expose a React hook that supplies
   the active locale. Replace direct locale-dependent formatting in components.
4. Use Intl date/number/relative-time formatting. Preserve `parseBackendTs` UTC
   semantics and date-only behavior. Set explicit precision policies for each
   numeric use rather than accepting default rounding of medical values.
5. Preserve raw text for clinical values such as `<0.1`, ranges, or qualified
   results unless a reliable existing structured numeric value is available.
   Do not parse localized display strings back into API values. Treat numeric
   input parsing as a separate, explicitly tested concern.
6. For application-owned toast/confirmation/error state, store message descriptors
   (key plus interpolation values) and translate at render time. Keep a literal
   text variant for server/user content. This lets open dialogs and notifications
   update without resetting them or losing pending confirmation promises.

Acceptance: language switching updates registries and existing dialogs;
German formatting is consistent; timestamp/timezone tests still pass; clinical
values retain precision, comparison signs, and units.

### Step 5 — Localizable API errors

Files: new shared backend API-error helper, `backend/asclepius/main.py`, relevant
auth/authz/document/share routes, `frontend/src/lib/errors.ts`, and errors resources.

1. Introduce an application exception/handler that adds stable `code` and optional
   safe interpolation `params` to responses while preserving existing `detail`,
   status codes, headers, and structured share fields. Register in both modes.
   Leave ordinary existing HTTP exceptions compatible.
2. Define codes for invalid credentials, forbidden/not-found operations, upload
   rejection, rate limits, invalid/expired share codes, and common validation.
   Convert their actual producers, including shared auth helpers where needed.
3. Resolve known codes to translated messages in the frontend. For FastAPI
   validation arrays, map supported validation types/field locations to messages;
   unknown types get a localized validation fallback.
4. Handle network failures and `ERR_CLIENT_4XX_BUDGET` locally. Unknown errors get
   a contextual localized summary; retain existing technical detail separately
   where appropriate instead of matching or translating arbitrary English strings.
5. Keep backend logs diagnostic. Do not rewrite logs or provider responses into
   German, or expose new raw response bodies through this change.

Acceptance: common failures display German in German mode; legacy response
consumers still work; share session termination, retry behavior, and 4xx-budget
tests retain their existing behavior.

### Step 6 — Complete feature translation

Migrate each feature with matching English/German resources and test updates:

1. Login, setup, shell, dashboard, global fallbacks, and error boundary.
2. Patient management, document list/detail, upload, reprocessing, and unclassified.
3. Lab results/charts, imaging, medical events, timeline, and search.
4. Chat controls, file browser, sharing administration, and all doctor share pages.
5. Settings, provider configuration, normalization UI, logs controls, backup,
   email/OIDC configuration, user/session management, and nested settings forms.

Audit labels in confirmation helpers, menus, inline validation, chart tooltips,
selection summaries, empty states, and loading states. Translate UI around
original/generated text, retaining that content itself. Check both desktop and
mobile variants of every migrated flow. Do not advertise complete German support
until every feature group and the error pass are finished.

Acceptance: all application-owned UI text has a reviewed translation or a
documented intentional exception (e.g. brand/model names, units, diagnostic logs).

## 4. Verification and release gate

### Automated checks

- Preference resolution: auto/en/de, ordered browser languages, regional German,
  unsupported languages, invalid/blocked storage, and guest/account boundaries.
- Switching: English to German and back, document lang, reactive labels, plural
  counts 0/1/2, open dialogs, unsaved forms, and unchanged route/filter state.
- Persistence: refresh/new browser, login/OIDC, logout, account changes, save
  failure, rapid choices, and stale requests completing after logout.
- Formatting: representative calendar dates, naive UTC timestamps, timezone
  boundaries, relative times, decimal formatting, and clinical precision.
- Error codes, validation fallback, legacy detail compatibility, and correct
  HTTP statuses/headers.
- Extend `Root.test.tsx` and `pages/share/shareNo4xxLoops.test.tsx` to exercise
  language changes across share routes in both core and share deployment modes.
- Keep resource parity/placeholder checks mandatory; flag untranslated UI text
  in migrated areas with a narrow lint/check rule and documented exemptions.

### Manual review

- Review German terminology and tone across all feature groups.
- Inspect desktop and narrow mobile layouts for clipped compound words, tables,
  tabs, button groups, dialogs, charts, and keyboard/screen-reader labels.
- Exercise login, upload/reprocess, patient editing, lab browsing, settings, and
  share OTP/queue/document flows in both languages.
- Verify switching language triggers no LLM/OCR/translation job and preserves
  medical content and all current document-processing settings.

### Required commands during implementation

Use the repository's configured environments and CI prerequisites:

```text
python backend/scripts/export_openapi.py
npm --prefix frontend run gen:api
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
# Also run the new resource-validation command added in Step 1.
# From backend:
ruff check .
pytest -q
```

Check formatting of changed files and generated OpenAPI drift. Run focused tests
while developing, then the required suites for the integrated change. Record any
environment limitations separately from actual failures.

## 5. Suggested commit/review sequence

1. Translation infrastructure, glossary, resource checks, and test setup.
2. Backend preference contract, schema, tests, and generated API artifacts.
3. Language selector and authenticated/anonymous preference integration.
4. Shared component labels, locale formatting, and message descriptors.
5. Compatible error codes and localized error presentation.
6. Feature translation batches in the order above, each with focused checks.
7. Coverage audit, German layout review, contributor documentation, and changelog.

Keep each commit runnable. Translate component call sites and their resources
together. The completed change requires both languages to pass the same user
journeys, not merely a working selector.

## References

- React integration and runtime switching:
  https://react.i18next.com/latest/usetranslation-hook
- Resource namespaces:
  https://react.i18next.com/guides/multiple-translation-files
- Typed resources/keys:
  https://www.i18next.com/overview/typescript
