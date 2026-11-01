# UI localization foundation

Steps 1–4 are implemented: language selection, account synchronization, shared
labels/formatting, and reactive application messages. Backend error codes and
feature-wide translation remain Steps 5–6 in `LOCALIZATION_PLAN.md`. Some
feature-specific static copy and backend errors are still English.

## Shared labels, formatting, and messages (Step 4)

Navigation, page titles, document/imaging column registries, document types,
statuses, and pipeline stages store translation keys with stable internal IDs.
Consumers subscribe to language changes; memoized columns include the translator
in their dependencies. Unknown enum values retain a readable fallback.

Use `useUiFormat()` in React components. Its date/time, relative-time, count, and
clinical-value helpers bind the resolved UI locale. Pure helpers take locale
arguments explicitly. Date-only values stay calendar dates; backend timestamps
continue to use `parseBackendTs` to interpret naive timestamps as UTC. Choosing a
language never changes timezone. Countdown clocks with fixed `HH:MM:SS` fields
remain numeric clocks.

Numeric clinical values use an explicit 21-significant-digit display policy.
`formatClinicalResult` preserves nonempty original `value_text` exactly, including
comparison signs, trailing zeros, ranges, and qualifiers. Display formatting does
not parse localized strings or change input values, numeric chart data, units,
sorting/filtering keys, or API payloads.

For an application-owned toast, confirmation, or error stored in state, pass
`message("feedback.failedToSave")` or another typed key with interpolation values.
`UiMessage` also accepts literal strings for server/user content. Render stored
errors with `useMessage()` rather than storing `t(...)` results. Toast/confirmation
providers translate descriptors during rendering, so existing notifications and
pending confirmation promises survive a language switch. Nested descriptors may
be used for operation names inside summary messages. Bulk actions use complete
pluralized sentences rather than English `s` suffixes.

`getErrorMessage` preserves its original string behavior and accepts a descriptor
fallback. Server messages remain literal diagnostics; stable error-code translation
is Step 5. Feature-specific static headings and help text are Step 6.

## Selecting a language (Step 3)

Choose English, Deutsch, or Automatic from the desktop header, mobile navigation,
login/setup, share header, or Settings → Appearance. Appearance is available to
all roles. The existing admin Language tab is labeled Document translation.

The shared `UiLanguageProvider` resolves browser language and separate core/share
guest preferences without fetching. Only the core `AccountLanguageBridge`, inside
`AuthProvider`, supplies the authenticated save operation. The bridge reads the
preference from the existing `/auth/me` response and resolves it before revealing
account content. Password and OIDC authentication use this same path.

Account preferences take precedence, including explicit auto. An unset account
inherits the core guest preference without saving it on login. An authenticated
selection is saved only to that account. Logout restores the guest preference.
Guest choices are stored under the separate keys in `preferences.ts`; blocked
storage leaves the choice applied for the current session with a failure message.
Auto follows `navigator.languages` and `languagechange`; explicit choices do not.
The provider updates `<html lang>` without remounting pages or forms.

`AccountLanguageSession` serializes saves and coalesces intermediate choices.
Failures retain the session's selected language and show a localized status;
there are no automatic retries. Disposing a session on logout/account change
aborts its request and discards queued saves/stale responses. Successful saves
also update the auth context's cached preference with an account-ID guard.

## Backend preference contract (Step 2)

`GET /api/auth/me` includes `ui_language`: `null` when no account preference has
been saved, or `auto`, `en`, or `de`. The response keeps its user and patient fields.
`PATCH /api/auth/me/preferences` accepts `{ "ui_language": "de" }` and returns
the saved preference in the same shape. All authenticated roles may update their
own preference, with the normal CSRF header. Unknown fields (including `user_id`)
and unsupported language values are rejected. These endpoints are core-only.

The `user_ui_preferences` table is created by normal database initialization on
new and existing installations. Values persist across sessions and startup;
deleting an account cascades to its preference. Document language settings are
independent. Generated API types describe both the nullable read field and the
validated update body. The Step 3 bridge connects this contract to the selectors.

## Usage for subsequent steps

`main.tsx` initializes the shared instance before rendering. Both languages are
bundled and immediately available. No browser detection, storage access, fetch,
or backend call occurs during initialization. The instance starts in English;
the shared preference provider then applies the resolved language before paint.

In a React component, use `useTranslation("documents")`, then
`t("actions.reprocess")`. Key checking is inferred from the English JSON resources;
unknown keys/namespaces fail TypeScript checks. For whole sentences use
interpolation, e.g. `t("selected", { count })`; never concatenate fragments.
Use `Trans` when a translated sentence contains React links or emphasis.

Translations render as React text. Interpolation escaping is delegated to React;
never put a translated string into `dangerouslySetInnerHTML`. User content,
medical data, model identifiers, paths, codes, and units are not translation keys.

Namespaces: `common`, `auth`, `documents`, `patients`, `clinical`, `settings`,
`share`, `errors`. Add feature-specific vocabulary to the appropriate namespace,
not to a growing universal dictionary. Add each new key to both languages.

`preferences.ts` contains pure resolution and defensive storage-read helpers;
it performs no implicit storage writes. `auto` is distinct from a missing account
preference. The preference provider applies browser/account preferences and
changes the document language. Formatting locales are `en-GB` and `de-DE`;
choosing a language must not change timezone or date parsing.

## German glossary and editorial rules

Prefer concise, neutral labels. Where addressing the reader, use formal **Sie**.
Keep grammar in whole messages so translators can reorder variables. German and
English cardinal counts use `_one` and `_other`; use the `count` option rather
than choosing a suffix in application code. Provide a zero override only when
needed, in both catalogues.

| English | German | Context |
| --- | --- | --- |
| Save / Cancel / Close | Speichern / Abbrechen / Schließen | Shared actions |
| Sign in / Sign out | Anmelden / Abmelden | Authentication |
| Documents | Dokumente | Uploaded medical records |
| Reprocess | Erneut verarbeiten | Pipeline action, not translate |
| Patient / Patients | Patient / Patienten | Compact clinical labels |
| Lab results | Laborergebnisse | Clinical values |
| Imaging | Bildgebung | Medical imaging |
| Medical events | Medizinische Ereignisse | Clinical timeline events |
| Share | Freigabe | Noun; action is Freigeben |
| Access code | Zugangscode | Share OTP |
| Interface language | Sprache der Oberfläche | Personal UI preference |
| Document translation | Dokumentübersetzung | Separate admin setting |
| Settings | Einstellungen | Application configuration |

Preserve Asclepius, provider/model/product names, ICD/LOINC codes, OCR/LLM
identifiers, units, filenames, and original clinical content. Do not translate
arbitrary provider diagnostics or user-written text. Review terminology with the
user before completing the full German release.

## Checks and inventory

- `npm run check:i18n`: validates matching keys, nonempty string values,
  interpolation variables, and required plural variants; runs synthetic failure
  tests for the validator. CI runs this before type-checking.
- `npm run inventory:i18n`: prints JSON candidates with source file, line, kind,
  and English text. For machine-readable output use
  `node scripts/inventory-i18n.mjs` directly.
- `npm test`: includes preference-resolution, resource initialization, typed-key,
  fallback, plural/interpolation, and reactive React rendering checks. Test setup
  restores the shared instance to English before each test.
- `npm run build`: checks typed translation calls as part of TypeScript compilation.

The inventory is a review aid: conditionals/templates may contain internal IDs,
CSS, units, and other intentional literals. It does not prove full coverage.
Review registry strings, all dynamic text paths, and backend responses using the
coverage checklist below. Translation catalogues are an initial vocabulary,
not a claim that the corresponding features have been migrated.

On Node versions with native Web Storage enabled, jsdom tests may accidentally
see Node's storage instead of browser storage. For local runs on those versions,
set `NODE_OPTIONS=--no-experimental-webstorage` before `npm test`. CI currently
uses Node 20 and does not require this flag.

## Coverage inventory for later migration

The feature-wide inventory below still guides Step 6. Shared navigation, column
labels, statuses/types/stages, controls, formatting, and persistent application
messages are now localized. Feature-specific static copy and backend error-code
handling remain pending. Migrate remaining labels and consumers together,
retaining internal identifiers and existing behavior.

| Group | Source areas | Strings/context to review |
| --- | --- | --- |
| Entry and global shell | `App.tsx`, `LoginPage`, `SetupWizardPage`, `ErrorBoundary` | Loading/redirect fallbacks, login errors, wizard validation, crash recovery |
| Navigation/layout | `components/layout/`, `PatientSelector` | `nav.ts` registry, route titles, metrics, mobile drawer, account controls |
| Shared UI/messages | `components/ui/`, `contexts/{Toast,Confirm}Context`, `lib/confirmBulk` | Accessibility labels, defaults, notifications, destructive confirmations |
| Dashboard | `DashboardPage`, dashboard components | Summary cards, statistics, pipeline text, empty states |
| Documents | `DocumentsPage`, `DocumentDetailPage`, `UnclassifiedPage`, `components/documents/`, `components/document-detail/` | Columns, metadata, statuses, processing/translation menus, upload, selection and deletion |
| Patient management | `PatientsPage`, patient components | Forms, validation, labels and empty states; preserve patient names |
| Clinical events | `EventsPage`, `pages/events/`, `TimelinePage` | Constants/options, date headings, event forms and timeline labels |
| Lab results | `LabResultsPage`, `pages/lab-results/`, `components/lab-results/` | Tables, chart labels/tooltips, orphan review, value precision and units |
| Imaging | `ImagingPage`, `ImagingDetailPage`, `components/imaging/` | Column registry, modality labels, viewer controls and study metadata |
| Search/chat/files | `SearchPage`, `ChatPage`, `FileBrowserPage` | Placeholders, actions, failures and empty states; preserve content and paths |
| Sharing administration | `SharesPage`, `pages/shares/`, `components/share/ShareDialog` | Statuses, expiry, delivery, audit/session controls, codes and link actions |
| Public doctor surface | `pages/share/`, `components/share/`, `ShareSessionContext` | Landing, OTP, queue, expired/ended session, dashboard/document controls; zero admin calls |
| Settings navigation | `SettingsPage`, `pages/settings/SettingsMenuList` | Admin/non-admin tabs, mobile drill-in, distinguish document/UI language |
| Analysis/pipeline settings | `components/settings/{DocumentAnalysis,Providers,Priority,Pipeline,Prompts,Language}Tab` | Configuration labels, prompt-editor descriptions; preserve prompt bodies/model IDs |
| Identity/operations settings | `components/settings/` access, users, OIDC, sessions, SMTP, backup, logs and columns tabs | Forms, validation, warnings, action results; preserve logs/config values |
| Normalization | `components/settings/normalization/` | Entity/alias controls, status labels; preserve clinical terminology and codes |
| Helpers and formatting | `lib/{utils,datetime,pipelineStages,errors}.ts*`, `pages/shares/format.ts`, inline `toLocale*` calls | English relative times, hard-coded en-GB, status/type fallbacks, raw backend messages |
| Backend error producers | Auth/session/authz, document/upload, share public/doctor routes | Stable codes added later; current English details/validation arrays need compatible handling |

Future acceptance checks must include open dialogs, stateful error messages,
memoized labels, chart callbacks, table registries, mobile-only labels, dates and
relative times. Existing share isolation tests in `Root.test.tsx` and
`pages/share/shareNo4xxLoops.test.tsx` must stay green when integration begins.
