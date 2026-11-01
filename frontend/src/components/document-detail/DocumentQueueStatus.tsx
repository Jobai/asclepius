import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useUiFormat } from "@/lib/formatting";
import { useTranslation } from "react-i18next";
import { type ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { Hourglass, Loader2 } from "lucide-react";
import { usePipelineStatus } from "@/contexts/PipelineStatusContext";
import type { PipelineProviders } from "@/types";
import { parseBackendTs } from "@/lib/utils";
import { stageLabel, formatElapsed, useNow } from "@/lib/pipelineStages";

interface Props {
  docId: number;
}

/** Header-bar pill that replaces the Reprocess button while a document is
 * in the pipeline. Shows either live progress (when this doc is the active
 * job) or its position in the queue (when it's still waiting). Falls back
 * to a generic "Queued" pill until pipeline-status arrives from the server.
 */
export default function DocumentQueueStatus({ docId }: Props) {
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
  useTranslation("common");
  const { status } = usePipelineStatus();

  const current = status?.current_job;
  const queued = status?.queued_jobs ?? [];

  if (current?.doc_id === docId) {
    const stage = stageLabel(current.stage);
    const page =
      current.page_total && current.page_current != null
        ? tx("documents:features.extra.queuePage", {
            page: current.page_current,
            total: current.page_total,
          })
        : null;
    const detail = [stage, page].filter(Boolean).join(" · ");
    return (
      <PillTooltip
        content={
          <ProcessingTooltipBody
            stage={current.stage}
            pageCurrent={current.page_current}
            pageTotal={current.page_total}
            startedAt={current.started_at}
            providers={(current.providers ?? null) as PipelineProviders | null}
            providerNames={
              (current.provider_names ?? null) as PipelineProviders | null
            }
            stageProvider={current.stage_provider ?? null}
          />
        }
      >
        <div className="flex items-center gap-1.5 rounded-md border border-info/25 bg-info-soft px-3 py-1.5 text-sm text-info cursor-help">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-medium">{tx("common:status.processing")}</span>
          {detail && (
            <span className="text-xs opacity-80 tabular-nums">{detail}</span>
          )}
        </div>
      </PillTooltip>
    );
  }

  const queueIndex = queued.findIndex((q) => q.doc_id === docId);
  if (queueIndex >= 0) {
    const ahead = queueIndex + (current ? 1 : 0);
    const aheadText =
      ahead === 0
        ? tx("documents:features.extra.nextUp")
        : tx("common:features.extra.documentCount", { count: ahead });
    const aheadFilenames = [
      ...(current?.doc_id != null
        ? [current.filename || tx("documents:features.extra.runningFile")]
        : []),
      ...queued.slice(0, queueIndex).map((q) => q.label),
    ];
    return (
      <PillTooltip
        content={
          <QueuedTooltipBody
            ahead={ahead}
            aheadFilenames={aheadFilenames}
            providers={
              (queued[queueIndex].providers ?? null) as PipelineProviders | null
            }
            providerNames={
              (queued[queueIndex].provider_names ??
                null) as PipelineProviders | null
            }
          />
        }
      >
        <div className="flex items-center gap-1.5 rounded-md border border-warning/25 bg-warning-soft px-3 py-1.5 text-sm text-warning cursor-help">
          <Hourglass className="h-4 w-4" />
          <span className="font-medium">
            {tx("documents:features.documentQueueStatus.queued")}
          </span>
          <span className="text-xs opacity-80 tabular-nums">{aheadText}</span>
        </div>
      </PillTooltip>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground"
      title={tx("documents:features.documentQueueStatus.queuedForProcessing")}
    >
      <Hourglass className="h-4 w-4" />
      <span className="font-medium">
        {tx("documents:features.documentQueueStatus.queued")}
      </span>
    </div>
  );
}

function PillTooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          sideOffset={6}
          className="w-72 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-overlay"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ProcessingTooltipBody({
  stage,
  pageCurrent,
  pageTotal,
  startedAt,
  providers,
  providerNames,
  stageProvider,
}: {
  stage: string | null | undefined;
  pageCurrent: number | null | undefined;
  pageTotal: number | null | undefined;
  startedAt: string | null | undefined;
  providers: PipelineProviders | null;
  providerNames: PipelineProviders | null;
  stageProvider: string | null;
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
  const { locale } = useUiFormat();
  useTranslation("common");
  const now = useNow(true);
  const startedMs = parseBackendTs(startedAt);
  const elapsed = startedMs ? Math.max(0, now - startedMs) : null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {tx("common:status.processing")}
      </p>
      <div className="space-y-1 text-xs">
        {stage && (
          <Row label={tx("documents:features.documentQueueStatus.stage")}>
            <span className="font-medium text-foreground">
              {stageLabel(stage)}
            </span>
          </Row>
        )}
        {pageTotal && pageCurrent != null && (
          <Row label={tx("documents:features.documentQueueStatus.page")}>
            <span className="tabular-nums">
              {tx("documents:features.documentQueueStatus.of", {
                value0: pageCurrent,
                value1: pageTotal,
              })}
            </span>
          </Row>
        )}
        {elapsed != null && (
          <Row label={tx("documents:features.documentQueueStatus.elapsed")}>
            <span className="tabular-nums">
              {formatElapsed(elapsed, locale)}
            </span>
          </Row>
        )}
      </div>
      {providers && (
        <ProvidersBlock
          providers={providers}
          providerNames={providerNames}
          active={stageProvider}
        />
      )}
    </div>
  );
}

function QueuedTooltipBody({
  ahead,
  aheadFilenames,
  providers,
  providerNames,
}: {
  ahead: number;
  aheadFilenames: string[];
  providers: PipelineProviders | null;
  providerNames: PipelineProviders | null;
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
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {tx("documents:features.documentQueueStatus.waitingInQueue")}
      </p>
      <div className="space-y-1 text-xs">
        <Row label={tx("documents:features.documentQueueStatus.position")}>
          <span className="tabular-nums">
            {ahead === 0
              ? tx("documents:features.documentQueueStatus.nextUp")
              : tx("documents:features.documentQueueStatus.ahead", {
                  value0: ahead,
                })}
          </span>
        </Row>
        {aheadFilenames.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {tx("documents:features.documentQueueStatus.aheadOfThisDoc")}
            </p>
            <ul className="space-y-0.5 text-foreground">
              {aheadFilenames.slice(0, 5).map((f, i) => (
                <li key={i} className="truncate" title={f}>
                  {i === 0 && ahead > 0 ? "• " : "• "}
                  {f}
                </li>
              ))}
              {aheadFilenames.length > 5 && (
                <li className="text-muted-foreground">
                  {tx("documents:features.documentQueueStatus.more", {
                    value0: aheadFilenames.length - 5,
                  })}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
      {providers && (
        <ProvidersBlock
          providers={providers}
          providerNames={providerNames}
          active={null}
        />
      )}
    </div>
  );
}

function ProvidersBlock({
  providers,
  providerNames,
  active,
}: {
  providers: PipelineProviders;
  providerNames: PipelineProviders | null;
  active: string | null;
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
  const entries: Array<{ family: string; id: string; label: string }> = [];
  if (providers.ocr) {
    entries.push({
      family: "OCR",
      id: providers.ocr,
      label: providerNames?.ocr || providers.ocr,
    });
  }
  if (providers.vision) {
    entries.push({
      family: "Vision",
      id: providers.vision,
      label: providerNames?.vision || providers.vision,
    });
  }
  if (providers.llm) {
    entries.push({
      family: "LLM",
      id: providers.llm,
      label: providerNames?.llm || providers.llm,
    });
  }
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1 border-t pt-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {tx("documents:features.documentQueueStatus.models")}
      </p>
      <div className="flex flex-wrap gap-1">
        {entries.map(({ family, id, label }) => {
          const isActive = id === active;
          const showRawId = label !== id;
          return (
            <span
              key={family}
              className={[
                "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
                isActive
                  ? "border-info/25 bg-info-soft text-info"
                  : "border-muted bg-muted/40 text-muted-foreground",
              ].join(" ")}
              title={
                showRawId ? `${family}: ${label} (${id})` : `${family}: ${id}`
              }
            >
              <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">
                {family}
              </span>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
