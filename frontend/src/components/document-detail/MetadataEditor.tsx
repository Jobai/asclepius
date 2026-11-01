import { specialtyLabel } from "@/lib/terminology";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useUiFormat } from "@/lib/formatting";
import { statusLabel } from "@/lib/utils";
import { message } from "@/i18n/messages";
import { useState } from "react";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/contexts/ToastContext";
import {
  Section,
  InfoRow,
  EditableField,
  EditableSearchableSelect,
  EditableCombobox,
  TechnicalDetails,
} from "@/components/document-detail/DocumentDetailHelpers";

export interface MetadataEditorProps {
  doc: any;
  onSave: (updated?: any) => void;
}

const DOC_TYPE_OPTIONS = [
  "invoice",
  "prescription",
  "specialist_report",
  "surgical_report",
  "discharge",
  "lab_test",
  "vaccination",
  "medical_certificate",
  "imaging_report",
  "other",
];

/**
 * Document Info card on the Document Detail page: status / error block,
 * type + dates + provider + specialty editable rows, plus the OCR/LLM
 * technical details disclosure.
 *
 * Renders the SAME fields for every document, including imaging studies
 * (DICOM bundles) — the user wanted full metadata parity. Fields that
 * never make sense for a given doc_type are gated below: Issued Date,
 * Specialty, Language, and the OCR/LLM technical block are hidden for
 * ``imaging_dicom`` because that pipeline does not produce them.
 */
export default function MetadataEditor({ doc, onSave }: MetadataEditorProps) {
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
  const { formatDocType } = useUiFormat();
  const { toast } = useToast();
  const [markingReviewed, setMarkingReviewed] = useState(false);
  // Both ``imaging_dicom`` and ``imaging_report`` are imaging documents —
  // the metadata editor hides the same fields for both.
  const isImaging =
    doc.doc_type === "imaging_dicom" || doc.doc_type === "imaging_report";

  const markReviewed = async () => {
    setMarkingReviewed(true);
    try {
      await api.post(`/documents/${doc.id}/mark-reviewed`);
      // The parent's ``onSave`` is a merge — pass the fields the
      // backend just changed so the local state updates immediately
      // and the red banner disappears without a page refresh.
      onSave({ status: "done", error_message: null });
      toast({
        title: message("feedback.markedAsReviewed"),
        description: message("feedback.statusSetToDoneReviewBannerCleared"),
        variant: "success",
      });
    } catch (e: any) {
      toast({
        title: message("feedback.failedToMarkAsReviewed"),
        description: getErrorMessage(e),
        variant: "error",
      });
    } finally {
      setMarkingReviewed(false);
    }
  };

  return (
    <Section
      title={tx("documents:features.metadataEditor.documentInfo")}
      sectionId="document-info"
    >
      <InfoRow
        label={tx("common:columns.status")}
        value={statusLabel(doc.status)}
      />
      {(doc.status === "failed" || doc.status === "needs_review") &&
        doc.error_message && (
          <div className="rounded-md bg-destructive-soft border border-destructive/25 p-3 space-y-2">
            <p className="text-xs font-semibold text-destructive">
              {doc.status === "failed"
                ? tx("documents:features.metadataEditor.processingError")
                : tx("documents:features.metadataEditor.reviewRequired")}
              {doc.retry_count > 0 && (
                <span className="font-normal ml-2 text-destructive/80">
                  {tx("documents:features.metadataEditor.retries", {
                    value0: doc.retry_count,
                  })}
                </span>
              )}
            </p>
            <pre className="text-xs text-destructive font-mono whitespace-pre-wrap break-all leading-relaxed">
              {doc.error_message}
            </pre>
            <div className="flex justify-end pt-1">
              <button
                onClick={markReviewed}
                disabled={markingReviewed}
                className="rounded-md border border-destructive/40 bg-card px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                title={
                  doc.status === "failed"
                    ? tx(
                        "documents:features.metadataEditor.dismissTheErrorBannerFixAnythingLeftMark",
                      )
                    : tx(
                        "documents:features.metadataEditor.confirmYouVeReviewedTheDocumentAndThe",
                      )
                }
              >
                {markingReviewed
                  ? tx("documents:features.metadataEditor.marking")
                  : doc.status === "failed"
                    ? tx("documents:features.metadataEditor.dismissMarkDone")
                    : tx("documents:features.metadataEditor.markAsReviewed")}
              </button>
            </div>
          </div>
        )}
      <EditableSearchableSelect
        label={tx("common:columns.type")}
        value={doc.doc_type}
        field="doc_type"
        docId={doc.id}
        onSave={onSave}
        options={DOC_TYPE_OPTIONS}
        formatLabel={formatDocType}
        placeholder={tx("documents:features.metadataEditor.searchType")}
      />
      <EditableField
        label={tx("documents:features.metadataEditor.eventDate")}
        value={doc.event_date}
        field="event_date"
        type="date"
        docId={doc.id}
        onSave={onSave}
      />
      {!isImaging && (
        <EditableField
          label={tx("documents:features.metadataEditor.issuedDate")}
          value={doc.issued_date}
          field="issued_date"
          type="date"
          docId={doc.id}
          onSave={onSave}
        />
      )}
      <EditableCombobox
        label={tx("common:columns.doctor")}
        value={doc.doctor_name}
        field="doctor_name"
        docId={doc.id}
        onSave={onSave}
        normType="doctors"
        currentEntityId={doc.doctor_id}
      />
      <EditableCombobox
        label={tx("common:columns.facility")}
        value={doc.facility_name}
        field="facility_name"
        docId={doc.id}
        onSave={onSave}
        normType="facilities"
        currentEntityId={doc.facility_id}
      />
      {!isImaging && (
        <EditableCombobox
          label={tx("common:columns.specialty")}
          value={doc.specialty_display || doc.specialty_original}
          displayValue={specialtyLabel(doc)}
          field="specialty_original"
          docId={doc.id}
          onSave={onSave}
          normType="specialties"
          currentEntityId={doc.norm_specialty_id}
        />
      )}
      {!isImaging &&
        (doc.ocr_engine ||
          doc.ocr_confidence != null ||
          doc.llm_provider ||
          doc.language_source) && (
          <TechnicalDetails
            ocrEngine={doc.ocr_engine}
            ocrConfidence={doc.ocr_confidence}
            llmProvider={doc.llm_provider}
            language={doc.language_source}
          />
        )}
    </Section>
  );
}
