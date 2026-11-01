import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useMessage, type UiMessage } from "@/i18n/messages";
import { message } from "@/i18n/messages";
import { useState } from "react";
import { Save } from "lucide-react";
import type { Credential } from "@/types";
import { getErrorMessage } from "@/lib/errors";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { CREDENTIAL_TYPES } from "./types";

export interface CredentialDialogProps {
  initial: Partial<Credential>;
  onSave: (c: Credential) => Promise<void> | void;
  onClose: () => void;
}

function parseBackoff(s: string): number[] {
  return s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export default function CredentialDialog({
  initial,
  onSave,
  onClose,
}: CredentialDialogProps) {
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
  const [name, setName] = useState(initial.name || "");
  const [type, setType] = useState(initial.type || "ollama");
  const [baseUrl, setBaseUrl] = useState(initial.base_url || "");
  const [apiKey, setApiKey] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(
    typeof initial.max_concurrent === "number" ? initial.max_concurrent : 2,
  );
  const [maxRetries, setMaxRetries] = useState(
    typeof initial.max_retries === "number" ? initial.max_retries : 3,
  );
  const [retryBackoff, setRetryBackoff] = useState(
    (initial.retry_backoff_seconds && initial.retry_backoff_seconds.length
      ? initial.retry_backoff_seconds
      : [30, 60, 120]
    ).join(","),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<UiMessage | null>(null);

  const typeInfo = CREDENTIAL_TYPES.find((t) => t.value === type);
  const hasSavedKey = !!initial.has_api_key;

  const handleSave = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr(message("settings:features.extra.providerNameRequired"));
      return;
    }
    if (typeInfo?.needs_url && !baseUrl.trim()) {
      setErr(message("settings:features.extra.providerUrlRequired"));
      return;
    }
    const backoff = parseBackoff(retryBackoff);
    if (backoff.length === 0) {
      setErr(message("settings:features.extra.retryBackoffInvalid"));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: initial.id || "",
        name: name.trim(),
        type,
        base_url: baseUrl.trim(),
        api_key: apiKey,
        max_concurrent: Math.max(1, maxConcurrent),
        max_retries: Math.max(0, maxRetries),
        retry_backoff_seconds: backoff,
      });
      onClose();
    } catch (e: any) {
      setErr(getErrorMessage(e, message("feedback.failedToSave")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={
        initial.id
          ? tx("settings:features.credentialCard.editProvider")
          : tx("settings:features.credentialDialog.newProvider")
      }
      contentClassName="sm:max-w-md"
    >
      <div className="space-y-3">
        <label className="space-y-1 block">
          <span className="text-sm font-medium">
            {tx("settings:features.backupTab.name")}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tx("settings:features.credentialDialog.eGHomeOllama")}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium">
            {tx("common:columns.type")}
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {CREDENTIAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {"labelKey" in t ? tx(t.labelKey) : t.label}
              </option>
            ))}
          </select>
          {typeInfo && (
            <span className="block text-xs text-muted-foreground">
              {tx(typeInfo.descriptionKey)}
            </span>
          )}
        </label>

        {typeInfo?.needs_url && (
          <label className="space-y-1 block">
            <span className="text-sm font-medium">
              {tx("settings:features.credentialDialog.baseUrl")}
            </span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                type === "ollama"
                  ? "http://ollama:11434"
                  : type === "vllm"
                    ? "http://vllm:8000/v1"
                    : type === "tesseract_remote"
                      ? "http://tesseract:8080"
                      : "https://..."
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        )}

        {(typeInfo?.needs_key || type === "openai") && (
          <label className="space-y-1 block">
            <span className="text-sm font-medium">
              {tx("settings:features.credentialDialog.apiKey")}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                hasSavedKey
                  ? tx(
                      "settings:features.credentialDialog.configuredLeaveBlankToKeep",
                    )
                  : tx("settings:features.credentialDialog.enterApiKey")
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        )}

        <label className="space-y-1 block">
          <span className="text-sm font-medium">
            {tx("settings:features.credentialDialog.maxConcurrentRequests")}
          </span>
          <input
            type="number"
            min={1}
            max={64}
            step={1}
            value={maxConcurrent}
            onChange={(e) =>
              setMaxConcurrent(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <span className="block text-xs text-muted-foreground">
            {tx(
              "settings:features.credentialDialog.sharedAcrossEveryModelThatUsesThisProvider",
            )}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-sm font-medium">
              {tx("settings:features.credentialDialog.maxRetries")}
            </span>
            <input
              type="number"
              min={0}
              max={10}
              step={1}
              value={maxRetries}
              onChange={(e) =>
                setMaxRetries(Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-sm font-medium">
              {tx("settings:features.credentialDialog.retryBackoffS")}
            </span>
            <input
              type="text"
              value={retryBackoff}
              onChange={(e) => setRetryBackoff(e.target.value)}
              placeholder="30,60,120"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <span className="block text-xs text-muted-foreground -mt-1">
          {tx(
            "settings:features.credentialDialog.transientFailurePolicyForThisConnectionClaudeOpenai",
          )}
        </span>

        {err && (
          <div className="rounded-md bg-destructive-soft text-destructive px-3 py-2 text-sm">
            {renderMessage(err ?? undefined)}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {tx("common:feedback.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? tx("common:ui.saving") : tx("common:actions.save")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
