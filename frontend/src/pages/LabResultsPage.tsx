import { termMessage } from "@/i18n/messages";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { usePatient } from "@/contexts/PatientContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import { useToast } from "@/contexts/ToastContext";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  Search,
  TestTube,
} from "lucide-react";
import OgttCurveChart from "@/components/lab-results/OgttCurveChart";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { looksLikeOgtt } from "@/lib/ogtt";
import type { LabRow } from "@/pages/lab-results/types";
import { useLabResults } from "@/pages/lab-results/useLabResults";
import { TrendChartPanel } from "@/pages/lab-results/TrendChartPanel";
import { OrphanReviewModal } from "@/pages/lab-results/OrphanReviewModal";
import { RowsTable } from "@/pages/lab-results/RowsTable";

export default function LabResultsPage() {
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
  const { selectedPatient } = usePatient();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [groupByDate, setGroupByDate] = useState(true);
  const [showOrphans, setShowOrphans] = useState(false);
  const [orphanBusy, setOrphanBusy] = useState<number | "all" | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editVals, setEditVals] = useState<Partial<LabRow>>({});
  const [saving, setSaving] = useState(false);

  const { results, orphans, setOrphans, loading, load } = useLabResults(
    selectedPatient,
    search,
  );

  // Group by (test_date, document_id) when grouping is on. Falls back to the
  // source document's date when the lab row itself has no test_date — otherwise
  // rows parsed from a dated document would cluster under a "no date" header.
  const groups = useMemo(() => {
    if (!groupByDate) return null;
    const m = new Map<
      string,
      {
        key: string;
        date: string;
        document_id: number | null;
        filename: string | null;
        rows: LabRow[];
        abnormal: number;
      }
    >();
    for (const r of results) {
      const effectiveDate = r.test_date || r.document_event_date;
      const key = `${effectiveDate || "no-date"}|${r.document_id ?? "none"}`;
      if (!m.has(key)) {
        m.set(key, {
          key,
          date: effectiveDate || "",
          document_id: r.document_id,
          filename: r.document_filename,
          rows: [],
          abnormal: 0,
        });
      }
      const g = m.get(key)!;
      g.rows.push(r);
      if (r.is_abnormal) g.abnormal += 1;
    }
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [results, groupByDate]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startEdit = (row: LabRow) => {
    setEditingId(row.id);
    setEditVals({
      test_name_original: row.test_name_original,
      value: row.value,
      value_text: row.value_text,
      unit: row.unit,
      reference_range_low: row.reference_range_low,
      reference_range_high: row.reference_range_high,
      is_abnormal: row.is_abnormal,
      panel_name: row.panel_name,
      test_date: row.test_date,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditVals({});
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      // Strip fields that haven't actually changed — keeps PATCH minimal.
      const body: any = { ...editVals };
      for (const k of Object.keys(body)) {
        if (body[k] === "" || body[k] === undefined) body[k] = null;
      }
      await api.patch(`/lab-results/${id}`, body);
      setEditingId(null);
      setEditVals({});
      await load();
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.saveFailed"));
      toast({
        title: message("feedback.saveFailed"),
        description: d,
        variant: "error",
      });
    }
    setSaving(false);
  };

  const deleteRow = async (row: LabRow) => {
    const ok = await confirm({
      title: message("feedback.deleteThisLabResult"),
      description: message(
        "feedback.onWillBeRemovedTheSourceDocumentIsUntouched",
        {
          value0: termMessage(
            {
              display_names: row.test_display_names,
              canonical_display: row.test_name_canonical,
            },
            row.test_name_original,
          ),
          value1: String(
            row.value != null
              ? ` = ${row.value}${row.unit ? " " + row.unit : ""}`
              : "",
          ),
          value2: row.test_date || message("common:dates.noDate"),
        },
      ),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.delete(`/lab-results/${row.id}`);
      await load();
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.deleteFailed"));
      toast({
        title: message("feedback.deleteFailed"),
        description: d,
        variant: "error",
      });
    }
  };

  const deleteOrphan = async (row: LabRow) => {
    setOrphanBusy(row.id);
    try {
      await api.delete(`/lab-results/${row.id}`);
      setOrphans((prev) => prev.filter((o) => o.id !== row.id));
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.deleteFailed"));
      toast({
        title: message("feedback.deleteFailed"),
        description: d,
        variant: "error",
      });
    }
    setOrphanBusy(null);
  };

  const deleteAllOrphans = async () => {
    const ok = await confirm({
      title: message("feedback.orphanResultsDelete", {
        count: Number(orphans.length),
      }),
      description: tx(
        "clinical:features.labResults.theseResultsReferenceDocumentsThatNoLongerExist",
      ),
      variant: "destructive",
      confirmText: message("feedback.deleteAll"),
    });
    if (!ok) return;
    setOrphanBusy("all");
    const failed: string[] = [];
    for (const o of orphans) {
      try {
        await api.delete(`/lab-results/${o.id}`);
      } catch {
        failed.push(`#${o.id}`);
      }
    }
    setOrphans([]);
    setShowOrphans(false);
    setOrphanBusy(null);
    await load();
    if (failed.length) {
      toast({
        title: message("feedback.orphanResultsFailed", {
          count: Number(failed.length),
        }),
        description: failed.join(", "),
        variant: "error",
      });
    }
  };

  if (!selectedPatient) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <TestTube className="h-8 w-8" />
        <p>
          {tx("clinical:features.labResults.selectAPatientToViewLabResults")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Orphan banner */}
      {orphans.length > 0 && (
        <div className="flex items-center justify-between rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span>
              {tx(
                "clinical:features.labResults.labResultReferenceADocumentThatNoLonger",
                { count: orphans.length },
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowOrphans(true)}
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
            >
              {tx("clinical:features.labResults.review")}
            </button>
            <button
              onClick={deleteAllOrphans}
              disabled={orphanBusy === "all"}
              className="rounded-md bg-destructive px-2.5 py-1 text-xs text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {orphanBusy === "all"
                ? tx("clinical:features.orphanReviewModal.deleting")
                : tx("common:feedback.deleteAll")}
            </button>
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={tx("clinical:features.labResults.searchByTestName")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={groupByDate}
            onChange={(e) => setGroupByDate(e.target.checked)}
          />
          {tx("clinical:features.labResults.groupByTestDate")}{" "}
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {tx("clinical:features.labResults.results", {
            value0: results.length,
          })}
        </span>
      </div>

      {/* Chart picker + chart */}
      <TrendChartPanel rows={results} />

      {/* Results */}
      {loading ? (
        <SkeletonRows rows={6} cols={4} className="rounded-lg border" />
      ) : results.length === 0 ? (
        <div className="rounded-lg border">
          <EmptyState
            icon={TestTube}
            title={tx("clinical:features.labResults.noLabResults")}
            description={
              search.trim()
                ? tx(
                    "clinical:features.labResults.noTestsMatchTryADifferentSearch",
                    { value0: search.trim() },
                  )
                : tx(
                    "clinical:features.labResults.labValuesExtractedFromUploadedDocumentsShowUp",
                  )
            }
          />
        </div>
      ) : groupByDate && groups ? (
        <div className="space-y-2">
          {groups.map((g) => {
            const open = expandedGroups.has(g.key);
            const ogtt = looksLikeOgtt(g.rows);
            return (
              <div key={g.key} className="rounded-lg border">
                <button
                  onClick={() => toggleGroup(g.key)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-accent/40"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium">{g.date}</span>
                  {g.document_id && g.filename ? (
                    <Link
                      to={`/documents/${g.document_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex min-w-0 max-w-full items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <FileText className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{g.filename}</span>
                    </Link>
                  ) : (
                    <span className="text-xs italic text-muted-foreground">
                      {tx("clinical:features.rowsTable.noDocument")}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {tx("clinical:features.extra.testCount", {
                      count: g.rows.length,
                    })}
                    {g.abnormal > 0 && (
                      <span className="ml-2 text-destructive">
                        {tx("clinical:features.labResults.abnormal", {
                          value0: g.abnormal,
                        })}
                      </span>
                    )}
                    {ogtt && (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
                        {tx("clinical:features.labResults.ogtt")}
                      </span>
                    )}
                  </span>
                </button>
                {open && (
                  <div className="border-t p-3">
                    {ogtt && (
                      <div className="mb-3">
                        <OgttCurveChart rows={g.rows} />
                      </div>
                    )}
                    <RowsTable
                      rows={g.rows}
                      editingId={editingId}
                      editVals={editVals}
                      setEditVals={setEditVals}
                      startEdit={startEdit}
                      cancelEdit={cancelEdit}
                      saveEdit={saveEdit}
                      deleteRow={deleteRow}
                      saving={saving}
                      showDocument={false}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <RowsTable
            rows={results}
            editingId={editingId}
            editVals={editVals}
            setEditVals={setEditVals}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            saveEdit={saveEdit}
            deleteRow={deleteRow}
            saving={saving}
          />
        </div>
      )}

      {/* Orphan review modal */}
      <OrphanReviewModal
        open={showOrphans}
        onClose={() => setShowOrphans(false)}
        orphans={orphans}
        orphanBusy={orphanBusy}
        deleteOrphan={deleteOrphan}
        deleteAllOrphans={deleteAllOrphans}
      />
    </div>
  );
}
