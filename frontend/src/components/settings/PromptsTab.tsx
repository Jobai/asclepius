import { promptMessage } from "./promptLabels";
import { useMessage } from "@/i18n/messages";
import { enumLabel, enumMessage } from "@/lib/labels";
import { Trans as FeatureTrans } from "react-i18next";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useEffect, useState } from "react";
import api from "@/api/client";
import { Save, RotateCcw, Languages } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import { useSettings } from "@/hooks/data";

// Canonical output languages. Extend freely — the backend accepts any string
// and embeds it verbatim into the LLM language directive.
const CANONICAL_LANGUAGES = [
  "English",
  "Italian",
  "German",
  "French",
  "Spanish",
  "Portuguese",
  "Dutch",
  "Polish",
  "Romanian",
  "Czech",
];

export default function PromptsTab() {
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
  const renderMessage = useMessage();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [prompts, setPrompts] = useState<any[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [canonicalLanguage, setCanonicalLanguage] = useState<string>("English");
  const [savingLanguage, setSavingLanguage] = useState(false);

  const { data: settingsData } = useSettings();

  const load = () => {
    api.get("/settings/prompts").then((res) => setPrompts(res.data || []));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (settingsData)
      setCanonicalLanguage(settingsData?.llm?.canonical_language || "English");
  }, [settingsData]);

  const saveLanguage = async (value: string) => {
    setSavingLanguage(true);
    try {
      await api.patch("/settings", { canonical_language: value });
      setCanonicalLanguage(value);
      toast({
        title: message("feedback.canonicalLanguageUpdated"),
        description: message("feedback.allLlmOutputWillNowBeIn", {
          value0: enumMessage("language", value),
        }),
      });
    } catch {
      toast({
        title: message("feedback.failedToUpdateCanonicalLanguage"),
        variant: "error",
      });
    }
    setSavingLanguage(false);
  };

  const handleSave = async (key: string) => {
    setSaving(true);
    try {
      await api.put(`/settings/prompts/${key}`, { text: editText });
      setEditing(null);
      load();
    } catch {
      toast({
        title: message("feedback.failedToSavePrompt"),
        variant: "error",
      });
    }
    setSaving(false);
  };

  const handleReset = async (key: string) => {
    const ok = await confirm({
      title: message("feedback.resetThisPromptToTheDefault"),
      description: message("feedback.yourCustomizationWillBeLost"),
      confirmText: message("feedback.reset"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.delete(`/settings/prompts/${key}`);
      setEditing(null);
      load();
    } catch {
      toast({ title: message("feedback.failedToReset"), variant: "error" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Languages className="h-4 w-4 text-primary" />
          {tx("settings:features.promptsTab.canonicalOutputLanguage")}{" "}
        </div>
        <p className="text-xs text-muted-foreground">
          {tx(
            "settings:features.promptsTab.everyFreeFormFieldProducedByTheLlm",
          )}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={canonicalLanguage}
            onChange={(e) => saveLanguage(e.target.value)}
            disabled={savingLanguage}
            className="rounded-md border bg-background px-3 py-1.5 text-sm disabled:opacity-50 coarse:min-h-11"
          >
            {CANONICAL_LANGUAGES.includes(canonicalLanguage) ? null : (
              <option value={canonicalLanguage}>{canonicalLanguage}</option>
            )}
            {CANONICAL_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {enumLabel("language", lang)}
              </option>
            ))}
          </select>
          {savingLanguage && (
            <span className="text-xs text-muted-foreground">
              {tx("settings:features.priorityTab.saving")}
            </span>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <FeatureTrans
          ns="settings"
          i18nKey="features.promptsTab.customizeTheLlmPromptsUsedForDocumentClassification"
          components={{
            part0: <code className="font-mono text-xs" />,
            part1: <code className="font-mono text-xs" />,
          }}
          values={{ value0: "{variable}" }}
        />
      </div>
      {prompts.map((p) => (
        <div key={p.key} className="rounded-lg border">
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30"
            onClick={() => {
              if (editing === p.key) {
                setEditing(null);
              } else {
                setEditing(p.key);
                setEditText(p.text);
              }
            }}
          >
            <div>
              <span className="text-sm font-medium">
                {renderMessage(
                  promptMessage("title", p.key, p.key.replace(/_/g, " ")),
                )}
              </span>
              {p.is_custom && (
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  {tx("settings:features.promptsTab.customized")}
                </span>
              )}
              <p className="text-xs text-muted-foreground">
                {renderMessage(
                  promptMessage("description", p.key, p.description),
                )}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {tx("settings:features.promptsTab.chars", {
                value0: p.text?.length || 0,
              })}
            </span>
          </div>
          {editing === p.key && (
            <div className="border-t p-3 space-y-2">
              {p.variables && p.variables.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium">
                    {tx("settings:features.promptsTab.availableVariables")}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.variables.map((v: any) => (
                      <button
                        key={v.name}
                        type="button"
                        title={tx("settings:features.promptsTab.clickToCopy", {
                          value0: renderMessage(
                            promptMessage("variable", v.name, v.description),
                          ),
                          value1: v.optional
                            ? tx("settings:features.extra.variableOptional")
                            : "",
                        })}
                        onClick={() => {
                          const token = `{${v.name}}`;
                          navigator.clipboard?.writeText(token);
                          toast({
                            title: message("feedback.copied", {
                              value0: String(token),
                            }),
                          });
                        }}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent coarse:min-h-11 coarse:px-2"
                      >
                        {`{${v.name}}`}
                        {v.optional ? "?" : ""}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <FeatureTrans
                      ns="settings"
                      i18nKey="features.promptsTab.clickAChipToCopyThePlaceholderVariables"
                      components={{ part0: <code className="font-mono" /> }}
                      values={{}}
                    />
                  </p>
                </div>
              )}
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono min-h-[200px]"
                disabled={saving}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleSave(p.key)}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50 coarse:min-h-11"
                >
                  <Save className="h-3 w-3" />{" "}
                  {saving ? tx("common:ui.saving") : tx("common:actions.save")}
                </button>
                {p.is_custom && (
                  <button
                    onClick={() => handleReset(p.key)}
                    className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-accent coarse:min-h-11"
                  >
                    <RotateCcw className="h-3 w-3" />{" "}
                    {tx("settings:features.promptsTab.resetToDefault")}{" "}
                  </button>
                )}
                <button
                  onClick={() => setEditing(null)}
                  className="flex items-center rounded-md border px-3 py-1.5 text-xs hover:bg-accent coarse:min-h-11"
                >
                  {tx("common:feedback.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
