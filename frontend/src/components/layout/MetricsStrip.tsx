import { useTranslation } from "react-i18next";
import { stageLabel } from "@/lib/pipelineStages";
import type { CommonKey, CommonTranslator } from "@/i18n/messages";
import { useState } from "react";
import { usePipelineStatus } from "@/contexts/PipelineStatusContext";
import type { PipelineStatus } from "@/types";
import {
  Activity,
  Brain,
  Eye,
  FileText,
  ScanText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_KIND_BADGE,
  KIND_BADGE_CLASSES,
  PROVIDER_BADGE_CLASSES,
} from "@/lib/statusTokens";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import Sheet from "@/components/ui/Sheet";

type ChipSpec = {
  key: string;
  icon: LucideIcon;
  label: string;
  colorClass: string;
  // Card contents — cap is optional so the pipeline-doc chip can skip the
  // numeric grid.
  cardTitle: string;
  cardSubtitle?: string;
  running?: number;
  waiting?: number;
  cap?: number;
};

const KIND_LABELS: Record<string, CommonKey> = {
  reprocess: "feedback.reprocess",
  translate: "pipeline.translate",
  translate_region: "pipeline.translateRegion",
  ai_edit: "stages.ai_edit",
  upload: "actions.upload",
};

/** Build the chip list from the live pipeline snapshot. Shared by the
 *  desktop chip strip and the mobile summary chip so both always describe
 *  the same state. */
function buildChips(status: PipelineStatus, ui: CommonTranslator): ChipSpec[] {
  const chips: ChipSpec[] = [];

  // Current pipeline document. Prefer the richer current_job block (gives us
  // the upload/reprocess kind and the planned-stages list for the detail
  // card); fall back to the legacy ``processing`` fields when an older
  // backend hasn't populated current_job yet.
  const job = status.current_job;
  if (job || status.processing) {
    const filename = job?.filename ?? status.processing ?? "";
    const stageRaw = job?.stage ?? status.processing_step ?? null;
    const step = stageRaw ? ` · ${stageLabel(stageRaw, ui)}` : "";
    const kind = job?.kind ?? "upload";
    const kindLabel = ui(KIND_LABELS[kind] ?? "actions.upload");
    const pageCurrent = job?.page_current ?? status.processing_page_current;
    const pageTotal = job?.page_total ?? status.processing_pages;
    const pageInfo =
      pageTotal && pageCurrent
        ? ui("pipeline.page", { current: pageCurrent, total: pageTotal })
        : "";
    const stagesInfo =
      (job?.stages_planned || []).length > 0
        ? `Stages: ${job!.stages_planned.map((s) => (job!.stages_done.includes(s) ? `✓ ${stageLabel(s, ui)}` : stageLabel(s, ui))).join(" → ")}`
        : "";
    chips.push({
      key: "pipeline-doc",
      icon: FileText,
      label: `${kindLabel}: ${filename}${step}`,
      cardTitle: filename || "Pipeline",
      cardSubtitle: [
        kindLabel,
        stageRaw ? stageLabel(stageRaw, ui) : "",
        pageInfo,
        stagesInfo,
      ]
        .filter(Boolean)
        .join(" · "),
      colorClass: KIND_BADGE_CLASSES[kind] ?? DEFAULT_KIND_BADGE,
    });
  }

  // Per-credential LLM / Vision / OCR queues. The chip shows credential +
  // model display-name on a single line; the detail card breaks out the
  // counters. Colour + icon mirror the kind badges on the Providers and
  // Priority tabs so the user sees the same visual language across the app.
  for (const q of status.llm_queues || []) {
    const displayList =
      (q.display_names && q.display_names.length > 0
        ? q.display_names
        : q.models) || [];
    const modelsLabel =
      displayList.length > 0
        ? displayList.join(", ")
        : q.display_name || q.model || "";
    const shortName = q.credential_name || q.credential_id;
    const kindLabel =
      q.kind === "vision" ? "Vision-LLM" : q.kind === "ocr" ? "OCR" : "LLM";
    const icon =
      q.kind === "vision" ? Eye : q.kind === "ocr" ? ScanText : Brain;
    // The semaphore in backend/asclepius/llm/gate.py is per-credential, not
    // per-kind: only one of the same-credential chips actually shows
    // ``running=1`` at any moment — the others queue. The status suffix
    // makes that explicit so the user doesn't read the dual chips as
    // parallel calls.
    const statusSuffix =
      q.in_flight > 0 ? "" : q.waiting > 0 ? ui("pipeline.queuedSuffix") : "";
    chips.push({
      key: `${q.kind}-${q.credential_id}`,
      icon,
      label: modelsLabel
        ? `${shortName} · ${modelsLabel}${statusSuffix}`
        : `${shortName}${statusSuffix}`,
      cardTitle: `${shortName} · ${kindLabel}`,
      cardSubtitle: modelsLabel || undefined,
      running: q.in_flight,
      waiting: q.waiting,
      cap: q.cap,
      colorClass: PROVIDER_BADGE_CLASSES[q.kind] ?? DEFAULT_KIND_BADGE,
    });
  }

  // Always-visible idle chip. Without this the top bar goes blank between
  // processing ticks and looks broken even though the pipeline is busy.
  if (chips.length === 0) {
    const queue = status.queue_depth || 0;
    const total = status.total_processed || 0;
    const last = status.last_processed;
    let label: string;
    let cardSubtitle: string | undefined;
    if (queue > 0) {
      label = ui("pipeline.queuedLabel", { count: queue });
      cardSubtitle = last ? ui("pipeline.last", { name: last }) : undefined;
    } else if (status.watcher_active === false) {
      label = ui("pipeline.stopped");
    } else {
      label =
        total > 0
          ? ui("pipeline.idleProcessed", { count: total })
          : ui("pipeline.idleLabel");
      cardSubtitle = last ? ui("pipeline.last", { name: last }) : undefined;
    }
    chips.push({
      key: "pipeline-idle",
      icon: Activity,
      label,
      cardTitle: ui("pipeline.title"),
      cardSubtitle,
      colorClass: "bg-muted text-muted-foreground border-border",
    });
  }

  return chips;
}

/** Detail card body shared by the desktop popover and the mobile sheet. */
function ChipDetailCard({ spec }: { spec: ChipSpec }) {
  const { t: ui } = useTranslation("common");
  return (
    <div>
      <div className="border-b px-3 py-2">
        <div className="break-words text-sm font-semibold">
          {spec.cardTitle}
        </div>
        {spec.cardSubtitle && (
          <div className="mt-0.5 break-words text-xs text-muted-foreground">
            {spec.cardSubtitle}
          </div>
        )}
      </div>
      {typeof spec.cap === "number" && (
        <div className="grid grid-cols-3 divide-x text-center">
          {(
            [
              [ui("pipeline.running"), spec.running ?? 0],
              [ui("pipeline.waiting"), spec.waiting ?? 0],
              [ui("pipeline.cap"), spec.cap],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
              <div className="text-base font-semibold tabular-nums">
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Desktop chip strip (md and up). Chips are buttons: click/tap toggles the
 * detail popover — the old hover-only card was unreachable on touch
 * screens and for keyboard users.
 */
export default function MetricsStrip() {
  const { t: ui } = useTranslation("common");
  const { status } = usePipelineStatus();
  if (!status) return null;
  const chips = buildChips(status, ui);

  return (
    <div className="flex min-w-0 max-w-full items-center justify-end gap-2 whitespace-nowrap">
      {chips.map((spec) => (
        <Popover key={spec.key}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={spec.label}
              className={cn(
                "inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                spec.colorClass,
              )}
            >
              <spec.icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{spec.label}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-0">
            <ChipDetailCard spec={spec} />
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

/**
 * Mobile summary chip (below md): one compact pill — pulsing when the
 * pipeline is working — that opens a bottom sheet listing every queue.
 */
export function PipelineChip() {
  const { t: ui } = useTranslation("common");
  const { status } = usePipelineStatus();
  const [open, setOpen] = useState(false);
  if (!status) return null;

  const chips = buildChips(status, ui);
  const busy = Boolean(
    status.current_job || status.processing || (status.llm_queues || []).length,
  );
  const queueDepth = status.queue_depth || 0;
  const activeCount =
    (status.current_job || status.processing ? 1 : 0) + queueDepth;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ui("pipeline.activity")}
        className={cn(
          "flex h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors coarse:h-10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          busy
            ? "border-info/25 bg-info-soft text-info"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Activity className={cn("h-4 w-4", busy && "animate-pulse")} />
        {activeCount > 0 && <span className="tabular-nums">{activeCount}</span>}
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={ui("pipeline.activity")}
        description={busy ? ui("pipeline.working") : ui("pipeline.idle")}
      >
        <div className="space-y-3">
          {chips.map((spec) => (
            <div key={spec.key} className="overflow-hidden rounded-lg border">
              <div
                className={cn(
                  "flex items-center gap-1.5 border-b px-3 py-1.5 text-xs font-medium",
                  spec.colorClass,
                )}
              >
                <spec.icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{spec.label}</span>
              </div>
              <ChipDetailCard spec={spec} />
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
