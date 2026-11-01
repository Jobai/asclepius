import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import { isLanguagePreference } from "@/i18n/preferences";

export default function LanguageSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { t: tx } = useFeatureTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  const id = useId();
  const { t } = useTranslation(["common", "settings"]);
  const { preference, selectLanguage, saving, failed } = useUiLanguage();
  return (
    <div className="min-w-0 space-y-1">
      <label
        htmlFor={id}
        className={compact ? "sr-only" : "block text-sm font-medium"}
      >
        {t("language.label")}
      </label>
      <select
        id={id}
        value={preference}
        aria-describedby={saving || failed ? `${id}-status` : undefined}
        className="min-h-11 max-w-full rounded-md border bg-background px-2 text-sm text-foreground"
        onChange={(event) => {
          if (isLanguagePreference(event.target.value))
            selectLanguage(event.target.value);
        }}
      >
        <option value="auto">{t("language.auto")}</option>
        <option value="en" lang="en">
          English
        </option>
        <option value="de" lang="de">
          {tx("common:language.de")}
        </option>
      </select>
      {(saving || failed) && (
        <p
          id={`${id}-status`}
          role="status"
          className="max-w-sm text-xs text-muted-foreground"
        >
          {saving ? t("language.saving") : t("settings:languageSaveFailed")}
        </p>
      )}
    </div>
  );
}
