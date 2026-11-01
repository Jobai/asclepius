import { labLabel } from "@/lib/terminology";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import type { LabRow } from "./types";

interface OrphanReviewModalProps {
  open: boolean;
  onClose: () => void;
  orphans: LabRow[];
  orphanBusy: number | "all" | null;
  deleteOrphan: (row: LabRow) => void;
  deleteAllOrphans: () => void;
}

export function OrphanReviewModal({
  open,
  onClose,
  orphans,
  orphanBusy,
  deleteOrphan,
  deleteAllOrphans,
}: OrphanReviewModalProps) {
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
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={tx("clinical:features.orphanReviewModal.orphanLabResults", {
        value0: orphans.length,
      })}
      contentClassName="h-[calc(100dvh-3rem)] sm:h-auto sm:max-w-2xl"
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {tx(
          "clinical:features.orphanReviewModal.theseLabResultsReferenceADocumentThatNo",
        )}
      </p>
      <div className="divide-y rounded-md border">
        {orphans.map((o) => (
          <div key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{labLabel(o)}</div>
              <div className="text-xs text-muted-foreground">
                {o.test_date ||
                  tx("clinical:features.orphanReviewModal.noDate")}
                {o.value != null && ` • ${o.value} ${o.unit || ""}`}
                {o.value_text && !o.value && ` • ${o.value_text}`}
              </div>
            </div>
            <button
              onClick={() => deleteOrphan(o)}
              disabled={orphanBusy === o.id}
              className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {tx("common:actions.close")}
        </Button>
        <Button
          variant="danger"
          onClick={deleteAllOrphans}
          disabled={orphanBusy === "all"}
        >
          {orphanBusy === "all"
            ? tx("clinical:features.orphanReviewModal.deleting")
            : tx("common:feedback.deleteAll")}
        </Button>
      </div>
    </Sheet>
  );
}
