import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

export type ReprocessMode = "both" | "ocr" | "llm";

export interface Provider {
  id: string;
  name?: string | null;
  enabled: boolean;
}

export interface ReprocessOptionsFormProps {
  selectedCount: number;
  bulkBusy: string | null;
  llmProviders: Provider[];
  ocrProviders: Provider[];
  onSubmit: (
    mode: ReprocessMode,
    llmProviderId: string,
    ocrProviderId: string,
  ) => void;
}

/**
 * Reprocess options: what to re-run (OCR / LLM / both) + optional provider
 * overrides + the submit button. Hosted in a Popover on desktop
 * (BulkActionsBar) and in the "More" Sheet on phones (MobileBulkBar).
 */
export default function ReprocessOptionsForm({
  selectedCount,
  bulkBusy,
  llmProviders,
  ocrProviders,
  onSubmit,
}: ReprocessOptionsFormProps) {
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
  const [mode, setMode] = useState<ReprocessMode>("both");
  const [llmId, setLlmId] = useState("");
  const [ocrId, setOcrId] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        {tx("documents:features.reprocessMenu.whatToReprocess")}
      </p>
      <div className="flex gap-1">
        {[
          {
            value: "both",
            label: tx("documents:features.reprocessMenu.ocrLlm"),
          },
          {
            value: "ocr",
            label: tx("documents:features.reprocessMenu.ocrOnly"),
          },
          {
            value: "llm",
            label: tx("documents:features.reprocessMenu.llmOnly"),
          },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value as ReprocessMode)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors coarse:min-h-11 ${
              mode === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode !== "llm" && ocrProviders.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {tx("documents:features.reprocessMenu.ocrProvider")}
          </p>
          <Select value={ocrId} onChange={(e) => setOcrId(e.target.value)}>
            <option value="">
              {tx(
                "documents:features.reprocessOptionsForm.defaultHighestPriority",
              )}
            </option>
            {ocrProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </Select>
        </div>
      )}

      {mode !== "ocr" && llmProviders.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {tx("documents:features.readOnlySections.llmProvider")}
          </p>
          <Select value={llmId} onChange={(e) => setLlmId(e.target.value)}>
            <option value="">
              {tx(
                "documents:features.reprocessOptionsForm.defaultHighestPriority",
              )}
            </option>
            {llmProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </Select>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!!bulkBusy}
        onClick={() => onSubmit(mode, llmId, ocrId)}
      >
        {tx("documents:features.reprocessOptionsForm.startReprocessing", {
          value0: selectedCount,
        })}
      </Button>
    </div>
  );
}
