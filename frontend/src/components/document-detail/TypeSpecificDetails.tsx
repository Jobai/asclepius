import { useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useToast } from "@/contexts/ToastContext";
import { getErrorMessage } from "@/lib/errors";
import { message } from "@/i18n/messages";
import { Section } from "./DocumentDetailHelpers";

const decisions = [
  "approved",
  "partially_approved",
  "denied",
  "pending",
  "unknown",
] as const;
const orderKinds = [
  "therapeutic_service",
  "medical_aid",
  "nursing_care",
  "transport",
  "hospital_admission",
  "other",
  "unknown",
] as const;
const DETAIL_FIELDS = {
  referral: [
    "target_specialty",
    "recipient",
    "requested_service",
    "clinical_question",
    "indication",
    "urgency",
  ],
  medical_order: [
    "order_kind",
    "service",
    "indication",
    "quantity",
    "frequency",
    "valid_from",
    "valid_until",
    "instructions",
  ],
  examination_report: [
    "examination",
    "body_region",
    "method",
    "findings",
    "assessment",
    "recommendations",
  ],
  insurance_document: [
    "insurer",
    "reference_number",
    "subject",
    "decision",
    "coverage",
    "valid_from",
    "valid_until",
    "conditions",
  ],
} as const;
type DetailKind = keyof typeof DETAIL_FIELDS;

type Details = Record<string, Record<string, string | null>>;
type Props = {
  doc: {
    id: number;
    doc_type: string | null;
    document_details?: Details | null;
  };
  onSave: (updated: any) => void;
};

function DetailsForm({ doc, kind, onSave }: Props & { kind: DetailKind }) {
  const { t } = useTranslation(["documents", "common"]);
  const { toast } = useToast();
  const [values, setValues] = useState(doc.document_details?.[kind] || {});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.patch(`/documents/${doc.id}`, {
        document_details: { [kind]: values },
      });
      onSave(response.data);
      setDirty(false);
    } catch (error) {
      toast({
        title: message("feedback.failedToSave"),
        description: getErrorMessage(error),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title={t("documents:typeDetails.title", {
        type: t(`common:docTypes.${kind}`),
      })}
      sectionId={`details-${kind}`}
    >
      <form onSubmit={save} className="space-y-3">
        {DETAIL_FIELDS[kind].map((field) => {
          const options =
            field === "decision"
              ? decisions
              : field === "order_kind"
                ? orderKinds
                : null;
          const id = `detail-${doc.id}-${kind}-${field}`;
          const change = (value: string) => {
            setValues((previous) => ({ ...previous, [field]: value || null }));
            setDirty(true);
          };
          const className =
            "w-full rounded-md border bg-background px-3 py-2 text-sm";
          return (
            <div key={field} className="space-y-1">
              <label
                className="block text-sm text-muted-foreground"
                htmlFor={id}
              >
                {t(`documents:typeDetails.fields.${field}`)}
              </label>
              {options ? (
                <select
                  id={id}
                  className={className}
                  value={values[field] || ""}
                  disabled={saving}
                  onChange={(event) => change(event.target.value)}
                >
                  <option value="">{t("common:docTypes.unknown")}</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {t(`documents:typeDetails.options.${option}`)}
                    </option>
                  ))}
                </select>
              ) : field.startsWith("valid_") ? (
                <input
                  id={id}
                  className={className}
                  type="date"
                  value={values[field] || ""}
                  disabled={saving}
                  onChange={(event) => change(event.target.value)}
                />
              ) : (
                <textarea
                  id={id}
                  className={className}
                  rows={2}
                  value={values[field] || ""}
                  disabled={saving}
                  onChange={(event) => change(event.target.value)}
                />
              )}
            </div>
          );
        })}
        <button
          type="submit"
          disabled={saving || !dirty}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving ? t("common:ui.saving") : t("common:actions.save")}
        </button>
      </form>
    </Section>
  );
}

export default function TypeSpecificDetails(props: Props) {
  // Mixed PDFs can contain multiple namespaces; keep each accessible.
  return (
    <>
      {(Object.keys(DETAIL_FIELDS) as DetailKind[])
        .filter(
          (kind) =>
            kind === props.doc.doc_type || props.doc.document_details?.[kind],
        )
        .map((kind) => (
          <DetailsForm
            {...props}
            kind={kind}
            key={`${props.doc.id}:${kind}:${JSON.stringify(props.doc.document_details?.[kind])}`}
          />
        ))}
    </>
  );
}
