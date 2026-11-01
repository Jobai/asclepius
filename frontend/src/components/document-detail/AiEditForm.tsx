import { Trans as FeatureTrans } from "react-i18next";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useState } from "react";
import { Stethoscope } from "lucide-react";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/contexts/ToastContext";
import { Section } from "@/components/document-detail/DocumentDetailHelpers";

export interface AiEditFormProps {
  docId: number | string;
  onApplied: () => Promise<void> | void;
}

interface ProviderOption {
  id: string;
  name: string;
  type: string;
  model?: string;
  priority: number;
}

interface PendingChoice {
  instruction: string;
  pages: number[];
  outOfRange: number[];
  pageCount: number;
  cachedPages: number[];
  missingFromCache: number[];
  ocrProviders: ProviderOption[];
  llmProviders: ProviderOption[];
  /** True when the picker should default to re-running OCR (any
   * requested page isn't cached). */
  recommendReRunOcr: boolean;
  /** Current radio selection. */
  reRunOcr: boolean;
  selectedOcr: string;
  selectedLlm: string;
}

export default function AiEditForm({ docId, onApplied }: AiEditFormProps) {
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
  const { toast } = useToast();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingChoice | null>(null);

  /** Send the request. The choice fields are non-null on the second
   * submit, after the picker spawned by the Phase-A response. */
  const sendRequest = async (
    submittedInstruction: string,
    choice: {
      reRunOcr: boolean;
      ocrProviderId: string | null;
      llmProviderId: string | null;
    } | null,
  ) => {
    setBusy(true);
    try {
      const resp = await api.post(`/documents/${docId}/edit-with-ai`, {
        instruction: submittedInstruction,
        re_run_ocr: choice?.reRunOcr ?? false,
        ocr_provider_id: choice?.ocrProviderId || null,
        llm_provider_id: choice?.llmProviderId || null,
      });
      const data = resp?.data || {};

      // Phase A: backend wants the user to pick a strategy.
      if (data.status === "needs_ocr_choice") {
        const ocrProviders: ProviderOption[] = Array.isArray(data.ocr_providers)
          ? data.ocr_providers
          : [];
        const llmProviders: ProviderOption[] = Array.isArray(data.llm_providers)
          ? data.llm_providers
          : [];
        setPending({
          instruction: submittedInstruction,
          pages: Array.isArray(data.pages) ? data.pages : [],
          outOfRange: Array.isArray(data.out_of_range_pages)
            ? data.out_of_range_pages
            : [],
          pageCount: Number(data.page_count) || 0,
          cachedPages: Array.isArray(data.cached_pages)
            ? data.cached_pages
            : [],
          missingFromCache: Array.isArray(data.missing_from_cache)
            ? data.missing_from_cache
            : [],
          recommendReRunOcr: !!data.recommend_re_run_ocr,
          ocrProviders,
          llmProviders,
          reRunOcr: !!data.recommend_re_run_ocr,
          selectedOcr: ocrProviders[0]?.id ?? "",
          selectedLlm: llmProviders[0]?.id ?? "",
        });
        return;
      }

      setPending(null);
      setInstruction("");
      await onApplied();

      if (data.mode === "pages") {
        const pages: number[] = Array.isArray(data.pages) ? data.pages : [];
        const oor: number[] = Array.isArray(data.out_of_range_pages)
          ? data.out_of_range_pages
          : [];
        const queued = data.status === "queued";
        const description = message(
          queued
            ? "documents:features.extra.pagesQueued"
            : "documents:features.extra.pagesExtracted",
          {
            count: pages.length,
            pages: pages.join(", "),
            skipped: oor.length
              ? message("documents:features.extra.outOfRangeSuffix", {
                  pages: oor.join(", "),
                })
              : "",
          },
        );
        toast({
          title: queued
            ? message("feedback.aiEditQueued")
            : message("feedback.pagesReprocessed"),
          description,
          variant: "success",
        });
      }
    } catch (e: any) {
      toast({
        title: message("feedback.aiEditFailed"),
        description: getErrorMessage(e),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!instruction.trim()) return;
    sendRequest(instruction, null);
  };

  const confirmChoice = () => {
    if (!pending) return;
    if (pending.reRunOcr && !pending.selectedOcr) return;
    sendRequest(pending.instruction, {
      reRunOcr: pending.reRunOcr,
      ocrProviderId: pending.reRunOcr ? pending.selectedOcr : null,
      llmProviderId: pending.selectedLlm || null,
    });
  };

  const cancelChoice = () => {
    setPending(null);
  };

  return (
    <Section
      title={tx("documents:features.aiEditForm.aiEdit")}
      icon={Stethoscope}
      sectionId="ai-edit"
      defaultOpen={false}
    >
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={tx(
              "documents:features.aiEditForm.eGDoctorIsDrBianchiReprocessPages",
            )}
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
            disabled={busy || !!pending}
          />
          <button
            onClick={submit}
            disabled={busy || !!pending || !instruction.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
          >
            {busy ? "..." : tx("documents:features.aiEditForm.apply")}
          </button>
        </div>

        {pending && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-3">
            <div>
              <div>
                <FeatureTrans
                  ns="documents"
                  i18nKey="features.aiEditForm.reprocessPagePart0Part0Of"
                  components={{ part0: <span className="font-medium" /> }}
                  values={{
                    value1: pending.pages.join(", "),
                    value2: pending.pageCount,
                  }}
                  count={pending.pages.length}
                />
              </div>
              {pending.outOfRange.length > 0 && (
                <div className="mt-1 text-muted-foreground">
                  {tx("documents:features.aiEditForm.outOfRangeSkipped", {
                    value0: pending.outOfRange.join(", "),
                  })}
                </div>
              )}
              {pending.missingFromCache.length > 0 && (
                <div className="mt-1 text-muted-foreground">
                  {tx(
                    "documents:features.aiEditForm.notInOcrCacheReOcrIsRecommended",
                    { value0: pending.missingFromCache.join(", ") },
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="re_run_ocr"
                  checked={pending.reRunOcr}
                  onChange={() => setPending({ ...pending, reRunOcr: true })}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  {tx("documents:features.aiEditForm.reRunOcrOnThesePages")}{" "}
                  {pending.recommendReRunOcr && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-primary">
                      {tx("documents:features.aiEditForm.recommended")}
                    </span>
                  )}
                </span>
              </label>
              {pending.reRunOcr && (
                <select
                  value={pending.selectedOcr}
                  onChange={(e) =>
                    setPending({ ...pending, selectedOcr: e.target.value })
                  }
                  disabled={busy}
                  className="ml-5 w-[calc(100%-1.25rem)] rounded border bg-background px-2 py-1 text-xs"
                >
                  {pending.ocrProviders.map((p) => (
                    <option key={p.id || p.name} value={p.id}>
                      {p.name}
                      {p.type ? ` (${p.type})` : ""}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="re_run_ocr"
                  checked={!pending.reRunOcr}
                  onChange={() => setPending({ ...pending, reRunOcr: false })}
                  disabled={busy || pending.cachedPages.length === 0}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  {tx("documents:features.aiEditForm.useExistingCachedOcr")}{" "}
                  {pending.cachedPages.length === 0 && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {tx("documents:features.aiEditForm.noCachedPages")}
                    </span>
                  )}
                </span>
              </label>
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground">
                {tx("documents:features.aiEditForm.llmProviderForReExtraction")}
              </div>
              <select
                value={pending.selectedLlm}
                onChange={(e) =>
                  setPending({ ...pending, selectedLlm: e.target.value })
                }
                disabled={busy}
                className="w-full rounded border bg-background px-2 py-1 text-xs"
              >
                {pending.llmProviders.length === 0 && (
                  <option value="">
                    {tx("documents:features.aiEditForm.noProvidersConfigured")}
                  </option>
                )}
                {pending.llmProviders.map((p) => (
                  <option key={p.id || p.name} value={p.id}>
                    {p.name}
                    {p.model ? ` — ${p.model}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={cancelChoice}
                disabled={busy}
                className="rounded border px-2.5 py-1 text-xs"
              >
                {tx("common:feedback.cancel")}
              </button>
              <button
                onClick={confirmChoice}
                disabled={
                  busy ||
                  (pending.reRunOcr && !pending.selectedOcr) ||
                  pending.llmProviders.length === 0
                }
                className="rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                {busy
                  ? tx("documents:features.aiEditForm.reprocessing")
                  : pending.reRunOcr
                    ? tx("documents:features.aiEditForm.reOcrExtract")
                    : tx("documents:features.aiEditForm.reExtract")}
              </button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          {tx(
            "documents:features.aiEditForm.editMetadataOrReExtractSpecificPagesBy",
          )}
        </p>
      </div>
    </Section>
  );
}
