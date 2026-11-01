import {
  sortTerms,
  termLabel,
  termMatches,
  labLabel,
  type TermDisplayNames,
} from "@/lib/terminology";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { TestTube, Pencil, Trash2, Plus, Search } from "lucide-react";
import { Section } from "./DocumentDetailHelpers";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import { useLabTests } from "@/hooks/data";
import { useBreakpoint } from "@/hooks/useMediaQuery";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";

type LabRow = {
  id?: number;
  test_name_original?: string | null;
  test_display_names?: TermDisplayNames;
  test_name_canonical?: string | null;
  canonical_code?: string | null;
  norm_lab_test_id?: number | null;
  value?: number | null;
  value_text?: string | null;
  unit?: string | null;
  reference_range_low?: number | null;
  reference_range_high?: number | null;
  is_abnormal?: boolean | null;
  sample_type?: string | null;
  panel_name?: string | null;
  test_date?: string | null;
};

// A blank draft used for new rows.
const blankDraft = (): LabRow => ({
  test_name_original: "",
  value: null,
  value_text: null,
  unit: null,
  reference_range_low: null,
  reference_range_high: null,
  is_abnormal: false,
  sample_type: null,
  panel_name: null,
  test_date: null,
  norm_lab_test_id: null,
});

// Number inputs return "" for empty; normalize to null, and parse numerics.
const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function TestPicker({
  value,
  canonicalId,
  onPick,
}: {
  value: string;
  canonicalId: number | null | undefined;
  onPick: (v: { name: string; normId: number | null }) => void;
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const { data: labTests, loading } = useLabTests();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Filter client-side — the normalization table is bounded (seeded list,
  // plus user-added aliases) so pulling it once and matching in JS is fast.
  const options = useMemo(() => {
    const list = sortTerms(Array.isArray(labTests) ? labTests : []);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o: any) => termMatches(o, q));
  }, [labTests, query, tx]);

  useOnClickOutside(rootRef, () => setOpen(false), open);

  const q = query.trim().toLowerCase();
  const exact = options.some((o: any) =>
    [o.canonical_display, ...Object.values(o.display_names || {})].some(
      (name) => String(name).toLowerCase() === q,
    ),
  );
  const canCreate = q.length > 0 && !exact;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onPick({ name: e.target.value, normId: null });
          }}
          onFocus={() => setOpen(true)}
          placeholder={tx(
            "clinical:features.labResultsEditor.searchOrCreateTest",
          )}
          className="w-full rounded border bg-background pl-7 pr-2 py-1 text-sm"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border bg-background shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {tx("common:ui.loading")}
            </div>
          ) : (
            <>
              {options.length === 0 && !canCreate && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {tx(
                    "clinical:features.labResultsEditor.noMatchesTypeANameToCreateOne",
                  )}
                </div>
              )}
              {options.slice(0, 50).map((opt: any) => {
                const d = opt.canonical_display || "";
                const isCurrent = canonicalId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onPick({ name: d, normId: opt.id });
                      setQuery(d);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent ${isCurrent ? "bg-accent/40" : ""}`}
                  >
                    <span className="truncate">{termLabel(opt) || d}</span>
                    {opt.canonical_code && (
                      <span className="text-[10px] font-mono text-muted-foreground truncate">
                        {opt.canonical_code}
                      </span>
                    )}
                  </button>
                );
              })}
              {canCreate && (
                <button
                  type="button"
                  onClick={() => {
                    onPick({ name: query.trim(), normId: null });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 border-t px-3 py-1.5 text-left text-xs text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3 w-3" />
                  {tx("clinical:features.labResultsEditor.use")}{" "}
                  <span className="font-medium">"{query.trim()}"</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  docId: number;
  row: LabRow;
  onCancel: () => void;
  onSaved: () => void;
}

/** The expanded edit form (all fields, stacks via sm:grid-cols-2). Shared
 * between the md+ table (wrapped in a colSpan row) and the <md stacked
 * card list, which renders it directly. */
function EditorForm({ docId, row, onCancel, onSaved }: EditorProps) {
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
  const [draft, setDraft] = useState<LabRow>(row);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<LabRow>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const name = (draft.test_name_original || "").trim();
    if (!name) {
      toast({
        title: message("feedback.testNameIsRequired"),
        variant: "error",
      });
      return;
    }
    setSaving(true);
    const payload = {
      test_name_original: name,
      value: draft.value,
      value_text: draft.value_text || null,
      unit: draft.unit || null,
      reference_range_low: draft.reference_range_low,
      reference_range_high: draft.reference_range_high,
      is_abnormal: !!draft.is_abnormal,
      sample_type: draft.sample_type || null,
      panel_name: draft.panel_name || null,
      test_date: draft.test_date || null,
      norm_lab_test_id: draft.norm_lab_test_id ?? null,
    };
    try {
      if (draft.id) {
        await api.patch(`/lab-results/${draft.id}`, payload);
      } else {
        await api.post(`/lab-results`, { document_id: docId, ...payload });
      }
      onSaved();
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.failedToSave"));
      toast({
        title: d,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded border bg-muted/30 p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-muted-foreground block mb-1">
            {tx("clinical:features.labResultsEditor.test")}
          </span>
          <TestPicker
            value={draft.test_name_original || ""}
            canonicalId={draft.norm_lab_test_id}
            onPick={({ name, normId }) =>
              set({ test_name_original: name, norm_lab_test_id: normId })
            }
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground block mb-1">
            {tx("common:columns.date")}
          </span>
          <input
            type="date"
            value={draft.test_date || ""}
            onChange={(e) => set({ test_date: e.target.value || null })}
            className="w-full rounded border bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground block mb-1">
            {tx("clinical:features.labResultsEditor.valueNumeric")}
          </span>
          <input
            type="number"
            step="any"
            value={draft.value ?? ""}
            onChange={(e) => set({ value: numOrNull(e.target.value) })}
            className="w-full rounded border bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground block mb-1">
            {tx("clinical:features.labResultsEditor.valueText")}
          </span>
          <input
            type="text"
            value={draft.value_text || ""}
            onChange={(e) => set({ value_text: e.target.value })}
            placeholder={tx(
              "clinical:features.labResultsEditor.eGPositiveNegative",
            )}
            className="w-full rounded border bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground block mb-1">
            {tx("clinical:features.labResultsEditor.unit")}
          </span>
          <input
            type="text"
            value={draft.unit || ""}
            onChange={(e) => set({ unit: e.target.value })}
            className="w-full rounded border bg-background px-2 py-1 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            <span className="text-muted-foreground block mb-1">
              {tx("clinical:features.labResultsEditor.refLow")}
            </span>
            <input
              type="number"
              step="any"
              value={draft.reference_range_low ?? ""}
              onChange={(e) =>
                set({ reference_range_low: numOrNull(e.target.value) })
              }
              className="w-full rounded border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground block mb-1">
              {tx("clinical:features.labResultsEditor.refHigh")}
            </span>
            <input
              type="number"
              step="any"
              value={draft.reference_range_high ?? ""}
              onChange={(e) =>
                set({ reference_range_high: numOrNull(e.target.value) })
              }
              className="w-full rounded border bg-background px-2 py-1 text-sm"
            />
          </label>
        </div>
        <label className="text-xs">
          <span className="text-muted-foreground block mb-1">
            {tx("clinical:features.labResultsEditor.sampleType")}
          </span>
          <input
            type="text"
            value={draft.sample_type || ""}
            onChange={(e) => set({ sample_type: e.target.value })}
            placeholder={tx("clinical:features.labResultsEditor.eGSerumUrine")}
            className="w-full rounded border bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground block mb-1">
            {tx("clinical:features.labResultsEditor.panel")}
          </span>
          <input
            type="text"
            value={draft.panel_name || ""}
            onChange={(e) => set({ panel_name: e.target.value })}
            placeholder={tx("clinical:features.labResultsEditor.eGCbcLipid")}
            className="w-full rounded border bg-background px-2 py-1 text-sm"
          />
        </label>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!draft.is_abnormal}
            onChange={(e) => set({ is_abnormal: e.target.checked })}
          />
          <span>{tx("clinical:features.labResultsEditor.abnormal")}</span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded border px-3 py-1 text-xs coarse:min-h-11"
          >
            {tx("common:feedback.cancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50 coarse:min-h-11"
          >
            {saving
              ? tx("common:ui.saving")
              : draft.id
                ? tx("common:actions.save")
                : tx("clinical:features.labResultsEditor.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Table-row host for EditorForm on md+ screens. */
function EditorRow(props: EditorProps) {
  return (
    <tr className="align-top">
      <td colSpan={6} className="py-2">
        <EditorForm {...props} />
      </td>
    </tr>
  );
}

export default function LabResultsEditor({
  docId,
  patientId,
  docType,
  labResults,
  onChange,
}: {
  docId: number;
  patientId: number | null;
  docType: string | null | undefined;
  labResults: LabRow[];
  onChange: () => void;
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
  const { toast } = useToast();
  const confirm = useConfirm();
  const { isMobile } = useBreakpoint();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  const isLabType = docType === "bloodtest" || docType === "labtest_other";
  const rows = labResults || [];
  // Hide the whole block when doc isn't a lab doc AND has no existing labs —
  // keeps the UI clean on unrelated doc types.
  if (!isLabType && rows.length === 0) return null;

  const startAdd = () => {
    if (!patientId) {
      toast({
        title: message("feedback.assignAPatientToThisDocumentFirst"),
        variant: "error",
      });
      return;
    }
    setEditingId("new");
  };

  const onRowSaved = () => {
    setEditingId(null);
    onChange();
  };

  const del = async (id: number) => {
    const ok = await confirm({
      title: message("feedback.deleteThisLabResult"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.delete(`/lab-results/${id}`);
      onChange();
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.failedToDelete"));
      toast({
        title: d,
        variant: "error",
      });
    }
  };

  return (
    <Section
      title={tx("common:nav.labResults")}
      icon={TestTube}
      sectionId="lab-results"
      defaultOpen={!isMobile && (labResults?.length ?? 0) > 0}
      headerExtra={
        rows.length > 0 ? <Badge size="sm">{rows.length}</Badge> : undefined
      }
    >
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1 text-left font-medium">
                {tx("clinical:features.labResultsEditor.test")}
              </th>
              <th className="py-1 text-left font-medium">
                {tx("clinical:features.dicomViewer.value")}
              </th>
              <th className="py-1 text-left font-medium">
                {tx("clinical:features.labResultsEditor.unit")}
              </th>
              <th className="py-1 text-left font-medium">
                {tx("clinical:features.labResultsEditor.ref")}
              </th>
              <th className="py-1 text-left font-medium">
                {tx("common:columns.date")}
              </th>
              <th className="py-1 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((lr) =>
              editingId === lr.id ? (
                <EditorRow
                  key={lr.id}
                  docId={docId}
                  row={lr}
                  onCancel={() => setEditingId(null)}
                  onSaved={onRowSaved}
                />
              ) : (
                <tr
                  key={lr.id}
                  className={lr.is_abnormal ? "text-destructive" : ""}
                >
                  <td className="py-1 pr-2">
                    <div className="font-medium">{labLabel(lr) || ""}</div>
                    {lr.test_name_canonical &&
                      lr.test_name_original &&
                      lr.test_name_canonical !== lr.test_name_original && (
                        <div className="text-[11px] text-muted-foreground">
                          {lr.test_name_original}
                        </div>
                      )}
                  </td>
                  <td className="py-1 pr-2 font-medium">
                    {lr.value ?? lr.value_text ?? ""}
                  </td>
                  <td className="py-1 pr-2">{lr.unit || ""}</td>
                  <td className="py-1 pr-2 text-muted-foreground">
                    {lr.reference_range_low != null &&
                    lr.reference_range_high != null
                      ? `${lr.reference_range_low}\u2013${lr.reference_range_high}`
                      : ""}
                  </td>
                  <td className="py-1 pr-2 text-muted-foreground">
                    {lr.test_date || ""}
                  </td>
                  <td className="py-1 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(lr.id!)}
                        className="flex items-center justify-center rounded border p-1 hover:bg-accent coarse:min-h-11 coarse:min-w-11"
                        title={tx("clinical:features.labResultsEditor.edit")}
                        aria-label={tx(
                          "clinical:features.labResultsEditor.editLabResult",
                        )}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => del(lr.id!)}
                        className="flex items-center justify-center rounded border p-1 hover:bg-accent text-destructive coarse:min-h-11 coarse:min-w-11"
                        title={tx("common:actions.delete")}
                        aria-label={tx(
                          "clinical:features.labResultsEditor.deleteLabResult",
                        )}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {editingId === "new" && (
              <EditorRow
                docId={docId}
                row={blankDraft()}
                onCancel={() => setEditingId(null)}
                onSaved={onRowSaved}
              />
            )}
            {rows.length === 0 && editingId !== "new" && (
              <tr>
                <td
                  colSpan={6}
                  className="py-3 text-center text-xs text-muted-foreground"
                >
                  {tx("clinical:features.labResultsEditor.noLabResultsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* <md: stacked card rows instead of the 6-column table */}
      <div className="divide-y md:hidden">
        {rows.map((lr) =>
          editingId === lr.id ? (
            <div key={lr.id} className="py-2">
              <EditorForm
                docId={docId}
                row={lr}
                onCancel={() => setEditingId(null)}
                onSaved={onRowSaved}
              />
            </div>
          ) : (
            <div
              key={lr.id}
              className={`space-y-0.5 py-2 ${lr.is_abnormal ? "text-destructive" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {labLabel(lr) || ""}
                </span>
                {lr.is_abnormal && (
                  <Badge variant="destructive" size="sm">
                    {tx("clinical:features.labResultsEditor.abnormal")}
                  </Badge>
                )}
              </div>
              {lr.test_name_canonical &&
                lr.test_name_original &&
                lr.test_name_canonical !== lr.test_name_original && (
                  <div className="text-[11px] text-muted-foreground">
                    {lr.test_name_original}
                  </div>
                )}
              <div className="text-sm">
                <span className="font-semibold">
                  {lr.value ?? lr.value_text ?? ""}
                  {lr.unit ? ` ${lr.unit}` : ""}
                </span>
                {lr.reference_range_low != null &&
                  lr.reference_range_high != null && (
                    <span className="text-muted-foreground">
                      {tx("clinical:features.labResultsEditor.ref2", {
                        value0: lr.reference_range_low,
                        value1: "–",
                        value2: lr.reference_range_high,
                      })}
                    </span>
                  )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {lr.test_date || ""}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(lr.id!)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent coarse:h-11 coarse:w-11"
                    title={tx("clinical:features.labResultsEditor.edit")}
                    aria-label={tx(
                      "clinical:features.labResultsEditor.editLabResult",
                    )}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => del(lr.id!)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-destructive hover:bg-destructive-soft coarse:h-11 coarse:w-11"
                    title={tx("common:actions.delete")}
                    aria-label={tx(
                      "clinical:features.labResultsEditor.deleteLabResult",
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
        {editingId === "new" && (
          <div className="py-2">
            <EditorForm
              docId={docId}
              row={blankDraft()}
              onCancel={() => setEditingId(null)}
              onSaved={onRowSaved}
            />
          </div>
        )}
        {rows.length === 0 && editingId !== "new" && (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {tx("clinical:features.labResultsEditor.noLabResultsYet")}
          </p>
        )}
      </div>

      {editingId !== "new" && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-1 rounded border px-3 py-1 text-xs hover:bg-accent coarse:min-h-11"
          >
            <Plus className="h-3 w-3" />{" "}
            {tx("clinical:features.labResultsEditor.addTest")}{" "}
          </button>
        </div>
      )}
    </Section>
  );
}
