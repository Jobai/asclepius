import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useTranslation } from "react-i18next";
import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Columns3,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MultiSelect from "@/components/ui/MultiSelect";
import Sheet from "@/components/ui/Sheet";
import { useDoctors, useFacilities, useSpecialties } from "@/hooks/data";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { formatDocType, statusLabel } from "@/lib/utils";
import { COLUMNS, DOC_TYPES, type ColumnKey } from "./columns";

export interface DocumentFiltersValue {
  search: string;
  typeFilter: string[];
  statusFilter: string[];
  specialtyFilter: string[];
  doctorFilter: string[];
  facilityFilter: string[];
  dateFrom: string;
  dateTo: string;
}

export interface DocumentFiltersProps extends DocumentFiltersValue {
  onChange: (patch: Partial<DocumentFiltersValue>) => void;
  onClearAll: () => void;
  visibleCols: Set<ColumnKey>;
  onVisibleColsChange: (next: Set<ColumnKey>) => void;
  onUploadClick: () => void;
}

const STATUS_OPTIONS = [
  "__blank__",
  "done",
  "processing",
  "pending",
  "needs_review",
  "failed",
  "cancelled",
];

interface ChipSpec {
  key: string;
  label: string;
  onRemove: () => void;
}

function FilterChip({ chip }: { chip: ChipSpec }) {
  const { t: ui } = useTranslation("common");
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-secondary px-2.5 py-1 text-xs">
      <span className="truncate">{chip.label}</span>
      <button
        type="button"
        onClick={chip.onRemove}
        aria-label={ui("ui.removeFilter", { name: chip.label })}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground coarse:p-1"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * Top-of-page filter controls for DocumentsPage.
 *
 * Desktop (md+): the flex-wrap toolbar — search + five multi-selects +
 * column toggle popover + upload button, then the date-range / clear row.
 * Phones: full-width search + a "Filters" button (active count badge)
 * opening a Sheet that stacks every control, with removable active-filter
 * chips under the search row. The upload FAB lives on the page itself.
 */
export default function DocumentFilters({
  search,
  typeFilter,
  statusFilter,
  specialtyFilter,
  doctorFilter,
  facilityFilter,
  dateFrom,
  dateTo,
  onChange,
  onClearAll,
  visibleCols,
  onVisibleColsChange,
  onUploadClick,
}: DocumentFiltersProps) {
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
  const { t: ui } = useTranslation("common");
  const { data: specialtiesData } = useSpecialties();
  const { data: doctorsData } = useDoctors();
  const { data: facilitiesData } = useFacilities();
  const specialties = specialtiesData ?? [];
  const doctors = (doctorsData ?? []) as any[];
  const facilities = (facilitiesData ?? []) as any[];

  const [colsOpen, setColsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(colsRef, () => setColsOpen(false), colsOpen);

  const hasAnyFilter = !!(
    dateFrom ||
    dateTo ||
    typeFilter.length ||
    statusFilter.length ||
    specialtyFilter.length ||
    doctorFilter.length ||
    facilityFilter.length
  );

  // One removable chip per active filter group: "<value>" when a single
  // value is selected, "<label> × <count>" otherwise. Removing a chip
  // clears that whole group.
  const chips = useMemo<ChipSpec[]>(() => {
    const out: ChipSpec[] = [];
    const group = (
      key: string,
      label: string,
      selected: string[],
      resolve: (v: string) => string,
      clear: () => void,
    ) => {
      if (selected.length === 0) return;
      out.push({
        key,
        label:
          selected.length === 1
            ? resolve(selected[0])
            : `${label} × ${selected.length}`,
        onRemove: clear,
      });
    };
    group(
      "type",
      ui("columns.type"),
      typeFilter,
      (v) => (v === "__blank__" ? ui("status.blank") : formatDocType(v)),
      () => onChange({ typeFilter: [] }),
    );
    group(
      "status",
      ui("columns.status"),
      statusFilter,
      (v) => (v === "__blank__" ? ui("status.blank") : statusLabel(v)),
      () => onChange({ statusFilter: [] }),
    );
    group(
      "specialty",
      ui("columns.specialty"),
      specialtyFilter,
      (v) => {
        if (v === "__blank__") return ui("status.blank");
        const s = specialties.find(
          (x: any) => (x.canonical_code || x.canonical_display) === v,
        );
        return s?.canonical_display || s?.canonical_code || v;
      },
      () => onChange({ specialtyFilter: [] }),
    );
    group(
      "doctor",
      ui("columns.doctor"),
      doctorFilter,
      (v) => {
        if (v === "__blank__") return ui("status.blank");
        const d = doctors.find((x) => String(x.id) === v);
        return d?.canonical_display || d?.name || v;
      },
      () => onChange({ doctorFilter: [] }),
    );
    group(
      "facility",
      ui("columns.facility"),
      facilityFilter,
      (v) => {
        if (v === "__blank__") return ui("status.blank");
        const f = facilities.find((x) => String(x.id) === v);
        return f?.canonical_display || f?.name || v;
      },
      () => onChange({ facilityFilter: [] }),
    );
    if (dateFrom) {
      out.push({
        key: "date_from",
        label: tx("documents:features.documentFilters.from", {
          value0: dateFrom,
        }),
        onRemove: () => onChange({ dateFrom: "" }),
      });
    }
    if (dateTo) {
      out.push({
        key: "date_to",
        label: tx("documents:features.documentFilters.to", { value0: dateTo }),
        onRemove: () => onChange({ dateTo: "" }),
      });
    }
    return out;
  }, [
    typeFilter,
    statusFilter,
    specialtyFilter,
    doctorFilter,
    facilityFilter,
    dateFrom,
    dateTo,
    specialties,
    doctors,
    facilities,
    onChange,
    ui,
    tx,
  ]);

  // The five multi-selects, shared between the desktop toolbar and the
  // phone filter sheet (each render spot gets its own instance).
  const renderFilterSelects = () => (
    <>
      <MultiSelect
        label={tx("common:columns.type")}
        options={[
          { value: "__blank__", label: ui("status.blank") },
          ...DOC_TYPES.map((t) => ({
            value: t,
            label: formatDocType(t),
          })),
        ]}
        selected={typeFilter}
        onChange={(v: string[]) => onChange({ typeFilter: v })}
      />

      <MultiSelect
        label={tx("common:columns.status")}
        options={STATUS_OPTIONS.map((value) => ({
          value,
          label:
            value === "__blank__" ? ui("status.blank") : statusLabel(value),
        }))}
        selected={statusFilter}
        onChange={(v: string[]) => onChange({ statusFilter: v })}
        searchable={false}
      />

      <MultiSelect
        label={tx("common:columns.specialty")}
        options={[
          { value: "__blank__", label: ui("status.blank") },
          ...specialties.map((s: any) => ({
            value: s.canonical_code || s.canonical_display,
            label: s.canonical_display || s.canonical_code,
          })),
        ]}
        selected={specialtyFilter}
        onChange={(v: string[]) => onChange({ specialtyFilter: v })}
      />

      <MultiSelect
        label={tx("common:columns.doctor")}
        options={[
          { value: "__blank__", label: ui("status.blank") },
          ...doctors.map((d: any) => ({
            value: String(d.id),
            label: d.canonical_display || d.name,
          })),
        ]}
        selected={doctorFilter}
        onChange={(v: string[]) => onChange({ doctorFilter: v })}
      />

      <MultiSelect
        label={tx("common:columns.facility")}
        options={[
          { value: "__blank__", label: ui("status.blank") },
          ...facilities.map((f: any) => ({
            value: String(f.id),
            label: f.canonical_display || f.name,
          })),
        ]}
        selected={facilityFilter}
        onChange={(v: string[]) => onChange({ facilityFilter: v })}
      />
    </>
  );

  const searchBox = (
    <div className="relative flex-1 min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={tx("documents:features.linksSection.searchDocuments")}
        value={search}
        onChange={(e) => onChange({ search: e.target.value })}
        className="pl-9"
      />
    </div>
  );

  return (
    <>
      {/* ── Phone: search + Filters button, then active-filter chips ── */}
      <div className="space-y-2 md:hidden">
        <div className="flex items-center gap-2">
          {searchBox}
          <Button
            variant="secondary"
            size="md"
            onClick={() => setFiltersOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {tx("documents:features.documentFilters.filters")}{" "}
            {chips.length > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {chips.length}
              </span>
            )}
          </Button>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <FilterChip key={chip.key} chip={chip} />
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title={tx("documents:features.documentFilters.filters")}
        footer={
          <>
            <Button variant="secondary" onClick={onClearAll}>
              {tx("common:actions.clearAll")}
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>
              {tx("common:status.done")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-start gap-3">
          {renderFilterSelects()}
          <label className="flex w-full flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              {tx("documents:features.documentFilters.dateFrom")}
            </span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onChange({ dateFrom: e.target.value })}
            />
          </label>
          <label className="flex w-full flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              {tx("documents:features.documentFilters.dateTo")}
            </span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onChange({ dateTo: e.target.value })}
            />
          </label>
        </div>
      </Sheet>

      {/* ── Desktop: flex-wrap toolbar + date-range row ── */}
      <div className="hidden md:flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[200px]">{searchBox}</div>

        {renderFilterSelects()}

        <div ref={colsRef} className="relative ml-auto hidden md:flex">
          <button
            onClick={() => setColsOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
            title={tx("documents:features.documentFilters.showHideColumns")}
          >
            <Columns3 className="h-4 w-4" />
            {tx("documents:features.documentFilters.columns")}{" "}
            <ChevronDown className="h-3 w-3" />
          </button>
          {colsOpen && (
            <div className="absolute right-0 top-full mt-1 z-dropdown w-52 rounded-lg border bg-popover shadow-overlay p-2">
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {tx("documents:features.documentFilters.visibleColumns")}
              </div>
              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibleCols.has(c.key)}
                    onChange={() => {
                      const next = new Set(visibleCols);
                      if (next.has(c.key)) next.delete(c.key);
                      else next.add(c.key);
                      onVisibleColsChange(next);
                    }}
                  />
                  <span>{ui(c.labelKey)}</span>
                </label>
              ))}
              <div className="mt-1 border-t pt-1">
                <button
                  onClick={() =>
                    onVisibleColsChange(
                      new Set(
                        COLUMNS.filter((c) => c.defaultVisible).map(
                          (c) => c.key,
                        ),
                      ),
                    )
                  }
                  className="w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {tx("common:ui.resetDefaults")}
                </button>
              </div>
            </div>
          )}
        </div>

        <Button variant="primary" size="md" onClick={onUploadClick}>
          <Upload className="h-4 w-4" aria-hidden />
          {tx("common:actions.upload")}{" "}
        </Button>
      </div>

      <div className="hidden md:flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {tx("documents:features.documentFilters.dateFrom2")}
          </span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            className="w-auto"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {tx("documents:features.documentFilters.to2")}
          </span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            className="w-auto"
          />
        </label>
        {hasAnyFilter && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />{" "}
            {tx("documents:features.documentFilters.clearAllFilters")}{" "}
          </button>
        )}
      </div>
    </>
  );
}
