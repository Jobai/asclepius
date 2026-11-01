import { useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { message, useMessage, type UiMessage } from "@/i18n/messages";
import { getErrorMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { NormItem, NormType } from "./types";

export default function TermDisplayNamesEditor({
  item,
  normType,
  onSaved,
}: {
  item: NormItem;
  normType: NormType;
  onSaved: (item: NormItem) => void;
}) {
  const { t } = useTranslation("settings");
  const renderMessage = useMessage();
  const [names, setNames] = useState({
    en: item.display_names?.en || "",
    de: item.display_names?.de || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiMessage>();
  const dirty =
    names.en !== (item.display_names?.en || "") ||
    names.de !== (item.display_names?.de || "");

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const response = await api.patch(
        `/normalization/${normType}/${item.id}`,
        {
          display_names: {
            en: names.en.trim() || null,
            de: names.de.trim() || null,
          },
        },
      );
      setNames({
        en: response.data.display_names?.en || "",
        de: response.data.display_names?.de || "",
      });
      onSaved(response.data);
    } catch (error) {
      setError(getErrorMessage(error, message("feedback.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset className="space-y-2" disabled={saving}>
      <legend className="text-sm font-medium">{t("terminology.title")}</legend>
      <p className="text-xs text-muted-foreground">{t("terminology.help")}</p>
      <div className="grid gap-2 md:grid-cols-2">
        {(["en", "de"] as const).map((language) => (
          <label key={language} className="space-y-1">
            <span className="text-xs text-muted-foreground">
              {t(`terminology.${language}`)}
            </span>
            <Input
              value={names[language]}
              maxLength={250}
              placeholder={item.canonical_display}
              onChange={(event) =>
                setNames((current) => ({
                  ...current,
                  [language]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      <Button size="sm" disabled={saving || !dirty} onClick={save}>
        {t("terminology.save")}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {renderMessage(error)}
        </p>
      )}
    </fieldset>
  );
}
