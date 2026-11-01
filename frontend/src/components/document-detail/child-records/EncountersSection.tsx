import {
  sortTerms,
  termLabel,
  termMatches,
  diagnosisLabel,
} from "@/lib/terminology";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useMemo, useRef, useState } from "react";
import api from "@/api/client";
import { Stethoscope, Pencil, X, Trash2, Search } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import { useDiagnoses } from "@/hooks/data";
import { useBreakpoint } from "@/hooks/useMediaQuery";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import Badge from "@/components/ui/Badge";
import {
  Section,
  ActionButton,
  IconButton,
} from "@/components/document-detail/DocumentDetailHelpers";

/** Heading-style inline editor for an encounter's diagnosis. Uses the
 * encounter PATCH endpoint so the rest of the section stays aligned with
 * the same backend.
 */
function DiagnosisHeading({
  displayValue,
  value,
  encounterId,
  onSaved,
}: {
  value: string;
  displayValue?: string;
  encounterId: number;
  onSaved: () => void;
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
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if ((val || "").trim() === (value || "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/encounters/${encounterId}`, {
        diagnosis_original: val.trim() || null,
      });
      setEditing(false);
      onSaved();
    } catch {
      toast({ title: message("feedback.failedToSave"), variant: "error" });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.patch(`/encounters/${encounterId}`, {
        diagnosis_original: null,
      });
      setEditing(false);
      setVal("");
      onSaved();
    } catch {
      toast({ title: message("feedback.failedToDelete"), variant: "error" });
    }
    setSaving(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setEditing(false);
              setVal(value || "");
            }
          }}
          className="flex-1 h-7 rounded border bg-background px-2 text-base font-semibold"
          autoFocus
          disabled={saving}
        />
        <ActionButton onClick={handleSave} disabled={saving} variant="primary">
          {saving ? "..." : tx("common:actions.save")}
        </ActionButton>
        {value && (
          <ActionButton
            onClick={handleDelete}
            disabled={saving}
            variant="danger"
            title={tx(
              "clinical:features.encountersSection.deleteTheSavedDiagnosis",
            )}
          >
            {tx("common:actions.delete")}
          </ActionButton>
        )}
        <IconButton
          label={tx("common:actions.close")}
          onClick={() => {
            setEditing(false);
            setVal(value || "");
          }}
        >
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setVal(value || "");
        setEditing(true);
      }}
      className="group flex w-full items-center gap-2 text-left rounded px-1 -mx-1 hover:bg-accent/30"
    >
      <span className="flex-1 text-base font-semibold truncate">
        {displayValue || value || (
          <span className="text-muted-foreground italic font-normal">
            {tx("clinical:features.encountersSection.noDiagnosisClickToAdd")}
          </span>
        )}
      </span>
      <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100 flex-shrink-0" />
    </button>
  );
}

/** Searchable ICD-10 picker. Backed by the /normalization/diagnoses
 * list — each canonical row carries an ``icd10_code`` field, which is
 * what we save to ``encounters.diagnosis_code``. The display name from
 * the matching diagnosis row gives the user a recognisable preview.
 */
function IcdCodeSelect({
  value,
  encounterId,
  onSaved,
}: {
  value: string | null;
  encounterId: number;
  onSaved: () => void;
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
  const diagnoses = useDiagnoses();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Map the current value back to a diagnosis row (if any) for the
  // display label. Falls back to just the raw code when the user typed
  // a code we don't have in norm_diagnoses.
  const options = sortTerms(
    Array.isArray(diagnoses.data) ? diagnoses.data : [],
  ) as any[];
  const codedOptions = useMemo(
    () => options.filter((o: any) => (o.icd10_code || "").trim()),
    [options],
  );
  const currentRow = value
    ? codedOptions.find(
        (o: any) => (o.icd10_code || "").toLowerCase() === value.toLowerCase(),
      )
    : null;

  useOnClickOutside(
    rootRef,
    () => {
      setEditing(false);
      setQuery("");
    },
    editing,
  );

  const save = async (code: string | null) => {
    setSaving(true);
    try {
      await api.patch(`/encounters/${encounterId}`, { diagnosis_code: code });
      setEditing(false);
      setQuery("");
      onSaved();
    } catch {
      toast({ title: message("feedback.failedToSave"), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? codedOptions.filter((o: any) => {
        const code = (o.icd10_code || "").toLowerCase();
        return code.includes(q) || termMatches(o, q);
      })
    : codedOptions.slice(0, 50);

  if (editing) {
    return (
      <div ref={rootRef} className="relative w-72 max-w-full">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditing(false);
                  setQuery("");
                }
                if (e.key === "Enter" && filtered.length === 1) {
                  save(filtered[0].icd10_code);
                }
              }}
              placeholder={tx("clinical:features.extra.searchIcd")}
              className="w-full h-7 rounded border bg-background pl-7 pr-2 text-sm"
              autoFocus
              disabled={saving}
            />
          </div>
          {value && (
            <ActionButton
              onClick={() => save(null)}
              disabled={saving}
              variant="danger"
              title={tx("clinical:features.extra.deleteIcd")}
            >
              {tx("common:actions.delete")}
            </ActionButton>
          )}
          <IconButton
            label={tx("common:actions.close")}
            onClick={() => {
              setEditing(false);
              setQuery("");
            }}
          >
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-background shadow-lg">
          {diagnoses.loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {tx("common:ui.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {tx("clinical:features.extra.noIcdMatches")}
            </div>
          ) : (
            filtered.map((opt: any) => {
              const isCurrent =
                value &&
                (opt.icd10_code || "").toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={opt.id}
                  onClick={() => save(opt.icd10_code)}
                  disabled={saving}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent ${isCurrent ? "bg-accent/40" : ""}`}
                >
                  <span className="font-mono text-[11px] text-primary flex-shrink-0">
                    {opt.icd10_code}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {termLabel(opt)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Pill view: compact monospace badge that triggers the search panel.
  // Empty state shows a discreet "+ ICD-10" affordance.
  const tooltip = termLabel(currentRow) || undefined;
  return (
    <button
      onClick={() => {
        setQuery("");
        setEditing(true);
      }}
      title={tooltip}
      className={
        value
          ? "inline-flex items-center rounded-md bg-primary/10 px-2 h-6 font-mono text-xs font-medium text-primary hover:bg-primary/15"
          : "inline-flex items-center rounded-md border border-dashed px-2 h-6 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
      }
    >
      {value || tx("clinical:features.encountersSection.icd10")}
    </button>
  );
}

export function DiagnosesSection({
  encounters,
  onUpdated,
}: {
  encounters: any[];
  onUpdated?: () => void;
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
  const confirm = useConfirm();
  const { toast } = useToast();
  const { isMobile } = useBreakpoint();
  if (!encounters?.length) return null;

  const handleDelete = async (encId: number) => {
    const ok = await confirm({
      title: message("feedback.deleteThisEncounter"),
      description: message(
        "feedback.theEncounterRowWillBeRemovedTheParentDocumentIs",
      ),
      variant: "destructive",
      confirmText: message("feedback.delete"),
    });
    if (!ok) return;
    try {
      await api.delete(`/encounters/${encId}`);
      onUpdated?.();
    } catch {
      toast({ title: message("feedback.failedToDelete"), variant: "error" });
    }
  };

  return (
    <Section
      title={tx("clinical:features.encountersSection.diagnoses")}
      icon={Stethoscope}
      sectionId="diagnoses"
      defaultOpen={!isMobile}
      headerExtra={<Badge size="sm">{encounters.length}</Badge>}
    >
      {encounters.map((enc, i) => (
        <div key={enc.id} className={i > 0 ? "pt-4 mt-4 border-t" : ""}>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <DiagnosisHeading
                value={enc.diagnosis_original || ""}
                displayValue={diagnosisLabel(enc)}
                encounterId={enc.id}
                onSaved={onUpdated || (() => {})}
              />
              {enc.diagnosis_original &&
                diagnosisLabel(enc) !== enc.diagnosis_original && (
                  <p className="mt-0.5 text-sm text-muted-foreground whitespace-pre-wrap">
                    {enc.diagnosis_original}
                  </p>
                )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <IcdCodeSelect
                value={enc.diagnosis_code || null}
                encounterId={enc.id}
                onSaved={onUpdated || (() => {})}
              />
              <IconButton
                label={tx(
                  "clinical:features.encountersSection.deleteEncounter",
                )}
                onClick={() => handleDelete(enc.id)}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
        </div>
      ))}
    </Section>
  );
}
