import { useTranslation } from "react-i18next";
import { Stethoscope } from "lucide-react";
import type { Encounter } from "@/types";
import { diagnosisLabel, specialtyLabel } from "@/lib/terminology";
import { useUiFormat } from "@/lib/formatting";
import { useBreakpoint } from "@/hooks/useMediaQuery";
import {
  Section,
  EditableField,
} from "@/components/document-detail/DocumentDetailHelpers";

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
      {encounters.map((encounter, index) => {
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
              {diagnosisLabel(encounter) ||
                t("clinical:features.encounterDetails.entry", {
                  number: index + 1,
                })}
            </h4>
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
