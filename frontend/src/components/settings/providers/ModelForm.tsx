import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useMessage, type UiMessage } from "@/i18n/messages";
import { message } from "@/i18n/messages";
import { useState } from "react";
import type { Credential } from "@/types";
import { getErrorMessage } from "@/lib/errors";
import { allowedKindsFor, type AttachedModel, type ModelKind } from "./types";

export interface ModelFormProps {
  cred: Credential;
  /** When present, the form is in edit mode: kind is locked, fields
   * pre-populate, and the submit button says "Save". */
  initial?: AttachedModel;
  onSubmit: (
    kind: ModelKind,
    name: string,
    model: string,
    timeout: number,
  ) => Promise<void>;
  onCancel: () => void;
}

export default function ModelForm({
  cred,
  initial,
  onSubmit,
  onCancel,
}: ModelFormProps) {
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
  const kinds = allowedKindsFor(cred.type);
  const isEdit = !!initial;
  const renderMessage = useMessage();
  const [kind, setKind] = useState<ModelKind>(
    initial ? initial.kind : kinds[0],
  );
  const [name, setName] = useState(initial?.name || "");
  const [model, setModel] = useState(initial?.model || "");
  const [timeout, setTimeout] = useState(
    initial?.timeout || (kind === "vision" ? 600 : 120),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<UiMessage | null>(null);

  const needsModelField = !(
    cred.type === "google_vision" || cred.type === "tesseract_remote"
  );

  const submit = async () => {
    setErr(null);
    if (needsModelField && !model.trim()) {
      setErr(message("settings:features.extra.modelNameRequired"));
      return;
    }
    setSaving(true);
    try {
      await onSubmit(
        kind,
        name.trim() || model.trim() || cred.name,
        model.trim(),
        timeout,
      );
    } catch (e: any) {
      setErr(getErrorMessage(e, message("errors:unexpected")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2 flex-wrap">
        {isEdit || kinds.length === 1 ? (
          <span className="rounded-md bg-muted px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
            {kind}
          </span>
        ) : (
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as ModelKind;
              setKind(k);
              setTimeout(k === "vision" ? 600 : 120);
            }}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            {kinds.includes("llm") && <option value="llm">LLM</option>}
            {kinds.includes("vision") && (
              <option value="vision">
                {tx("settings:features.modelForm.vision")}
              </option>
            )}
            {kinds.includes("ocr") && <option value="ocr">OCR</option>}
          </select>
        )}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tx("settings:features.modelForm.displayNameOptional")}
          className="flex-1 min-w-[140px] rounded-md border bg-background px-2 py-1 text-sm"
        />
        {needsModelField && (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={
              kind === "vision"
                ? tx("settings:features.modelForm.eGQwen25Vl")
                : kind === "ocr"
                  ? tx("settings:features.modelForm.eGLlavaVision")
                  : tx("settings:features.modelForm.eGLlama31")
            }
            className="flex-1 min-w-[160px] rounded-md border bg-background px-2 py-1 text-sm"
          />
        )}
        <input
          type="number"
          min={10}
          max={1800}
          step={30}
          value={timeout}
          onChange={(e) =>
            setTimeout(Math.max(10, parseInt(e.target.value, 10) || 10))
          }
          title={tx("settings:features.modelForm.timeoutS")}
          className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
        />
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving
            ? isEdit
              ? tx("common:ui.saving")
              : tx("settings:features.modelForm.adding")
            : isEdit
              ? tx("common:actions.save")
              : tx("settings:features.normalizationRow.add")}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border px-3 py-1 text-xs hover:bg-accent"
        >
          {tx("common:feedback.cancel")}
        </button>
      </div>
      {err && (
        <div className="text-xs text-destructive">
          {renderMessage(err ?? undefined)}
        </div>
      )}
    </div>
  );
}
