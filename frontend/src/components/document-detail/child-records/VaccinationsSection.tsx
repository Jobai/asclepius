import { useTranslation as useFeatureTranslation } from "react-i18next";
import { Syringe } from "lucide-react";
import { Section } from "@/components/document-detail/DocumentDetailHelpers";
import Badge from "@/components/ui/Badge";
import { useBreakpoint } from "@/hooks/useMediaQuery";

export function VaccinationsSection({ vaccinations }: { vaccinations: any[] }) {
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
  const { isMobile } = useBreakpoint();
  if (!vaccinations?.length) return null;
  return (
    <Section
      title={tx("clinical:features.vaccinationsSection.vaccinations")}
      icon={Syringe}
      sectionId="vaccinations"
      defaultOpen={!isMobile}
      headerExtra={<Badge size="sm">{vaccinations.length}</Badge>}
    >
      {vaccinations.map((vax) => (
        <div key={vax.id} className="text-sm">
          <span className="font-medium">{vax.vaccine_name}</span>
          {vax.date_administered && (
            <span className="text-muted-foreground">
              {" "}
              — {vax.date_administered}
            </span>
          )}
          {vax.dose_number && (
            <span className="text-muted-foreground">
              {tx("clinical:features.vaccinationsSection.dose", {
                value0: vax.dose_number,
              })}
            </span>
          )}
        </div>
      ))}
    </Section>
  );
}
