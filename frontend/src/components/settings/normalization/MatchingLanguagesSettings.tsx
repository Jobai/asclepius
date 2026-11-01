import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useSettings } from "@/hooks/data";
import { message, useMessage, type UiMessage } from "@/i18n/messages";
import { getErrorMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";

interface MatchingPolicy {
  matching_languages: string[];
  include_unlabeled_aliases: boolean;
  available_languages: string[];
  unlabeled_alias_count: number;
  can_edit: boolean;
}

export default function MatchingLanguagesSettings() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const renderMessage = useMessage();
  const [policy, setPolicy] = useState<MatchingPolicy>();
  const [languages, setLanguages] = useState<string[]>([]);
  const [includeUnlabeled, setIncludeUnlabeled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<UiMessage>();

  useEffect(() => {
    let active = true;
    api
      .get<MatchingPolicy>("/normalization/matching-languages")
      .then((response) => {
        if (!active) return;
        setPolicy(response.data);
        setLanguages([...response.data.matching_languages].sort());
        setIncludeUnlabeled(response.data.include_unlabeled_aliases);
      })
      .catch((error) => {
        if (active)
          setError(getErrorMessage(error, message("errors:unexpected")));
      });
    return () => {
      active = false;
    };
  }, []);

  const languageNames = new Intl.DisplayNames([i18n.resolvedLanguage || "en"], {
    type: "language",
  });
  const dirty =
    !!policy &&
    (languages.join(",") !== [...policy.matching_languages].sort().join(",") ||
      includeUnlabeled !== policy.include_unlabeled_aliases);
  const save = async () => {
    if (!policy?.can_edit || !languages.length) return;
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const updated = {
        matching_languages: languages,
        include_unlabeled_aliases: includeUnlabeled,
      };
      await api.patch("/settings", {
        normalization_matching_languages: updated.matching_languages,
        normalization_include_unlabeled_aliases:
          updated.include_unlabeled_aliases,
      });
      setPolicy({ ...policy, ...updated });
      useSettings.updateCached((current) => ({
        ...current,
        normalization: updated,
      }));
      setSaved(true);
    } catch (error) {
      setError(getErrorMessage(error, message("feedback.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border p-4 space-y-3">
      <h3 className="text-sm font-medium">{t("matchingLanguages.title")}</h3>
      <p className="text-xs text-muted-foreground">
        {t("matchingLanguages.help")}
      </p>
      {!policy && !error && <p className="text-sm">{t("common:ui.loading")}</p>}
      {policy && (
        <>
          <fieldset disabled={saving || !policy.can_edit} className="space-y-3">
            <legend className="sr-only">{t("matchingLanguages.title")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {policy.available_languages.map((code) => (
                <label key={code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    value={code}
                    checked={languages.includes(code)}
                    disabled={
                      languages.length === 1 && languages.includes(code)
                    }
                    onChange={() => {
                      setLanguages((current) =>
                        current.includes(code)
                          ? current.filter((language) => language !== code)
                          : [...current, code].sort(),
                      );
                      setSaved(false);
                    }}
                  />
                  <span>{languageNames.of(code) || code}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeUnlabeled}
                onChange={(event) => {
                  setIncludeUnlabeled(event.target.checked);
                  setSaved(false);
                }}
              />
              <span>{t("matchingLanguages.includeUnlabeled")}</span>
            </label>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            {t("matchingLanguages.unlabeledCount", {
              total: policy.unlabeled_alias_count,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("matchingLanguages.existingAssignments")}
          </p>
          {policy.can_edit && (
            <Button
              size="sm"
              disabled={saving || !dirty || !languages.length}
              onClick={save}
            >
              {t("common:actions.save")}
            </Button>
          )}
          {!policy.can_edit && (
            <p className="text-xs text-muted-foreground">
              {t("matchingLanguages.adminOnly")}
            </p>
          )}
          {saved && (
            <p role="status" className="text-xs text-muted-foreground">
              {t("matchingLanguages.saved")}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {renderMessage(error)}
        </p>
      )}
    </div>
  );
}
