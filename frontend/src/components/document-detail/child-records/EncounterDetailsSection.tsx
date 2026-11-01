import { useTranslation } from "react-i18next";
import { Stethoscope } from "lucide-react";
import api from "@/api/client";
import type { Encounter } from "@/types";
import { diagnosisLabel, specialtyLabel } from "@/lib/terminology";
import { useUiFormat } from "@/lib/formatting";
import { useBreakpoint } from "@/hooks/useMediaQuery";
import {
  Section,
  EditableField,
} from "@/components/document-detail/DocumentDetailHelpers";

function groupEncounterDetails(encounters: Encounter[]): Encounter[][] {
  const groups = new Map<string, Encounter[]>();
  for (const encounter of encounters) {
    // Extraction repeats the contact data for each diagnosis. Compare every
    // clinical contact field, excluding diagnosis fields and the row ID only.
    // Use stored values/IDs so grouping does not depend on the UI language.
    const key = JSON.stringify([
      encounter.document_id,
      encounter.patient_id,
      encounter.doctor_id,
      encounter.facility_id,
      encounter.norm_specialty_id,
      encounter.encounter_date,
      encounter.admission_date,
      encounter.discharge_date,
      encounter.findings,
      encounter.follow_up_date,
      encounter.follow_up_instructions,
      encounter.notes,
    ]);
    const group = groups.get(key);
    if (group) group.push(encounter);
    else groups.set(key, [encounter]);
  }
  return [...groups.values()];
}

export function EncounterDetailsSection({
  encounters,
  onUpdated,
}: {
  encounters: Encounter[];
  onUpdated?: () => void;
}) {
  const { t } = useTranslation(["clinical", "common"]);
  const { formatDate } = useUiFormat();
  const { isMobile } = useBreakpoint();
  if (!encounters.length) return null;

  const missing = t("clinical:features.encounterDetails.notDocumented");
  const date = (value: string | null) => (value ? formatDate(value) : missing);

  return (
    <Section
      title={t("clinical:features.encounterDetails.title")}
      icon={Stethoscope}
      sectionId="encounter-details"
      defaultOpen={!isMobile}
    >
      {groupEncounterDetails(encounters).map((group, index) => {
        const encounter = group[0];
        const diagnoses = [...new Set(group.map(diagnosisLabel).filter(Boolean))];
        const saveNotes = async (value: string | null) => {
          // Keep the duplicate source rows consistent when editing a shared note.
          const results = await Promise.allSettled(
            group.map((record) =>
              api.patch(`/encounters/${record.id}`, { notes: value }),
            ),
          );
          const failure = results.find((result) => result.status === "rejected");
          if (failure?.status === "rejected") {
            // Reflect any completed writes, and let the editor report failure.
            if (results.some((result) => result.status === "fulfilled")) {
              onUpdated?.();
            }
            throw failure.reason;
          }
        };
        const fields = [
          [
            t("clinical:features.encounterDetails.encounterDate"),
            date(encounter.encounter_date),
          ],
          [
            t("clinical:features.encounterDetails.admissionDate"),
            date(encounter.admission_date),
          ],
          [
            t("clinical:features.encounterDetails.dischargeDate"),
            date(encounter.discharge_date),
          ],
          [t("common:columns.doctor"), encounter.doctor_name],
          [t("common:columns.facility"), encounter.facility_name],
          [t("common:columns.specialty"), specialtyLabel(encounter)],
          [t("clinical:features.encounterDetails.findings"), encounter.findings],
          [
            t("clinical:features.encounterDetails.followUpDate"),
            date(encounter.follow_up_date),
          ],
          [
            t("clinical:features.encounterDetails.followUpInstructions"),
            encounter.follow_up_instructions,
          ],
        ];

        return (
          <div
            key={encounter.id}
            className={index > 0 ? "pt-4 mt-4 border-t" : ""}
          >
            <h4 className="mb-3 font-medium break-words">
              {t("clinical:features.encounterDetails.entry", {
                number: index + 1,
              })}
            </h4>
            {diagnoses.length > 0 && (
              <div className="mb-3 text-sm">
                <p className="mb-1 text-muted-foreground">
                  {t("clinical:features.encounterDetails.associatedDiagnoses")}
                </p>
                <ul
                  aria-label={t("clinical:features.encounterDetails.associatedDiagnoses")}
                  className="list-disc pl-5 space-y-1 break-words"
                >
                  {diagnoses.map((diagnosis) => (
                    <li key={diagnosis}>{diagnosis}</li>
                  ))}
                </ul>
              </div>
            )}
            <dl className="space-y-3 text-sm">
              {fields.map(([label, value]) => (
                <div
                  key={label}
                  className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">
                    {value || missing}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3">
              <EditableField
                label={t("clinical:features.encounterDetails.notes")}
                value={encounter.notes || ""}
                field="notes"
                docId={encounter.id}
                apiPath={`/encounters/${encounter.id}`}
                onSaveValue={saveNotes}
                onSave={() => onUpdated?.()}
                multiline
              />
            </div>
          </div>
        );
      })}
    </Section>
  );
}
