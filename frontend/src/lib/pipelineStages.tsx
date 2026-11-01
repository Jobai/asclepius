import { useTranslation as useFeatureTranslation } from "react-i18next";
import { i18n as featureI18n } from "@/i18n";
import { i18n } from "@/i18n";
import type { CommonKey, CommonTranslator } from "@/i18n/messages";
import { useEffect, useState } from "react";
import {
  ScanText,
  Brain,
  Eye,
  FolderOutput,
  FileSearch,
  Layers,
  FileImage,
  Languages,
  type LucideIcon,
} from "lucide-react";

/**
 * Canonical pipeline-stage metadata, shared by every component that renders a
 * backend stage id.
 *
 * Before this module, three components (PipelineProgress, DocumentStageTimeline,
 * DocumentQueueStatus) each defined their own STAGE_LABELS / STAGE_ICONS maps,
 * and they DISAGREED — e.g. ``page_classification`` rendered as "Page
 * classification", "Page classification" and "Classifying" respectively. This
 * is the single source of truth, keyed by the backend stage ids defined in
 * ``backend/asclepius/pipeline/stage_events.py``. Keep it in sync with the
 * ``STAGE_*`` constants there.
 */
export interface StageMeta {
  labelKey: CommonKey;
  icon?: LucideIcon;
}

export const STAGE_META: Record<string, StageMeta> = {
  ocr: { labelKey: "stages.ocr", icon: ScanText },
  vision_extraction: { labelKey: "stages.vision_extraction", icon: Eye },
  llm_extraction: { labelKey: "stages.llm_extraction", icon: Brain },
  page_classification: {
    labelKey: "stages.page_classification",
    icon: FileSearch,
  },
  section_extraction: { labelKey: "stages.section_extraction", icon: Layers },
  organizing: { labelKey: "stages.organizing", icon: FolderOutput },
  thumbnail: { labelKey: "stages.thumbnail", icon: FileImage },
  cache_ocr: { labelKey: "stages.cache_ocr", icon: ScanText },
  translation: { labelKey: "stages.translation", icon: Languages },
  region_ocr: { labelKey: "stages.region_ocr", icon: ScanText },
  region_translation: {
    labelKey: "stages.region_translation",
    icon: Languages,
  },
  ai_edit: { labelKey: "stages.ai_edit", icon: Brain },
};

/**
 * Human-readable label for a backend stage id. Falls back to the id with
 * underscores turned into spaces for any stage not in the map (so a freshly
 * added backend stage still renders something sensible). Returns ``""`` for
 * empty input.
 */
export function stageLabel(
  stage: string | null | undefined,
  t: CommonTranslator = i18n.getFixedT(null, "common"),
): string {
  if (!stage) return "";
  const key = STAGE_META[stage]?.labelKey;
  return key ? t(key) : stage.replace(/_/g, " ");
}

/**
 * Icon component for a backend stage id, or a generic fallback when the stage
 * isn't in the map.
 */
export function stageIcon(stage: string | null | undefined): LucideIcon {
  if (!stage) return FileSearch;
  return STAGE_META[stage]?.icon ?? FileSearch;
}

/**
 * Infer the flow architecture from the planned/observed stage list.
 *
 * The backend doesn't expose ``flow`` directly, but the stage list carries the
 * same information: ``vision_extraction`` only appears in the Vision-LLM flow
 * (image → text + extraction in one step); everything else uses the
 * OCR-then-LLM flow. Returns ``null`` when neither marker is present.
 */
export function flowBadge(
  stages: string[],
): { label: string; pill: string } | null {
  if (stages.includes("vision_extraction")) {
    return {
      label: featureI18n.t("common:features.pipelineStages.visionLlm"),
      pill: "bg-cat-violet-soft text-cat-violet border-cat-violet/25",
    };
  }
  if (stages.includes("ocr")) {
    return {
      label: featureI18n.t("common:features.pipelineStages.ocrLlm"),
      pill: "bg-muted text-muted-foreground border-border",
    };
  }
  return null;
}

/**
 * Format a coarse elapsed time (in ms) for the live "running" readouts:
 * ``0s`` · ``45s`` · ``3m 20s`` · ``1h 05m``.
 */
export function formatElapsed(ms: number, locale = "en-GB"): string {
  const unit = (value: number, unit: string, pad = false) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "narrow",
      maximumFractionDigits: 0,
      minimumIntegerDigits: pad ? 2 : 1,
      useGrouping: false,
    }).format(value);
  if (ms < 1000) return unit(0, "second");
  const s = Math.floor(ms / 1000);
  if (s < 60) return unit(s, "second");
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${unit(m, "minute")} ${unit(rs, "second", true)}`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${unit(h, "hour")} ${unit(rm, "minute")}`;
}

/**
 * Tick once a second while ``active`` so an elapsed-time readout stays live.
 * Returns the current ``Date.now()``; consumers re-render when it changes.
 */
export function useNow(active: boolean): number {
  useFeatureTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
