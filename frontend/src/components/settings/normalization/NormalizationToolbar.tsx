import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useEffect, useRef } from "react";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import type { NormType } from "./types";

export interface NormalizationToolbarProps {
  normType: NormType;
  onNormTypeChange: (v: string) => void;
  normFilter: string | null;
  onNormFilterChange: (v: string | null) => void;
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearchCommit: (v: string) => void;
  onAutoMerge: () => void;
  autoMergeLoading: boolean;
  canAutoMerge: boolean;
  itemCount: number;
}

export default function NormalizationToolbar({
  normType,
  onNormTypeChange,
  normFilter,
  onNormFilterChange,
  searchInput,
  onSearchInputChange,
  onSearchCommit,
  onAutoMerge,
  autoMergeLoading,
  canAutoMerge,
  itemCount,
}: NormalizationToolbarProps) {
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
  // Debounce search changes so we don't re-fire the list query on every keystroke.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearchCommit(searchInput), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [searchInput, onSearchCommit]);

  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
      <Select
        value={normType}
        onChange={(e) => onNormTypeChange(e.target.value)}
        aria-label={tx("settings:features.normalizationToolbar.entityType")}
        className="md:w-auto"
      >
        <option value="lab_tests">
          {tx("settings:features.normalizationToolbar.labTests")}
        </option>
        <option value="specialties">
          {tx("settings:features.normalizationToolbar.specialties")}
        </option>
        <option value="diagnoses">
          {tx("settings:features.normalizationToolbar.diagnoses")}
        </option>
        <option value="medications">
          {tx("settings:features.normalizationToolbar.medications")}
        </option>
        <option value="doctors">
          {tx("settings:features.normalizationToolbar.doctors")}
        </option>
        <option value="facilities">
          {tx("settings:features.normalizationToolbar.facilities")}
        </option>
      </Select>
      <Select
        value={normFilter || ""}
        onChange={(e) => onNormFilterChange(e.target.value || null)}
        aria-label={tx("settings:features.normalizationToolbar.reviewFilter")}
        className="md:w-auto"
      >
        <option value="">{tx("common:ui.all")}</option>
        <option value="unreviewed">
          {tx("settings:features.normalizationToolbar.unreviewedOnly")}
        </option>
      </Select>
      <div className="relative w-full md:w-auto md:flex-1 md:min-w-[200px] md:max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          placeholder={tx(
            "settings:features.normalizationToolbar.searchByNameCodeOrAlias",
          )}
          className="pl-9 pr-9"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => {
              onSearchInputChange("");
              onSearchCommit("");
            }}
            aria-label={tx(
              "settings:features.normalizationToolbar.clearSearch",
            )}
            className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onAutoMerge}
        disabled={autoMergeLoading || !canAutoMerge}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-40 coarse:min-h-11 md:ml-auto md:w-auto"
        title={tx(
          "settings:features.normalizationToolbar.askTheAiToProposeMergesYouReview",
        )}
      >
        {autoMergeLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {tx("settings:features.normalizationToolbar.autoMergeWithAi")}{" "}
      </button>
      <span className="text-xs text-muted-foreground">
        {tx("settings:features.normalizationToolbar.entries", {
          value0: itemCount,
        })}
      </span>
    </div>
  );
}
