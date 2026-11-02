import { i18n } from "@/i18n";
import { formatDocType } from "./utils";
import {
  message,
  type CommonKey,
  type MessageKey,
  type TranslatedMessage,
} from "@/i18n/messages";

/** Only application-owned identifiers are labels. Unknown source values stay literal.
 * Call during render in a component subscribed with useTranslation/useUiFormat.
 */
const labelKeys = {
  eventType: {
    symptom: "common:features.extra.enums.eventType.symptom",
    diagnosis: "common:features.extra.enums.eventType.diagnosis",
    hospitalization: "common:features.extra.enums.eventType.hospitalization",
    surgery: "common:features.extra.enums.eventType.surgery",
    treatment: "common:features.extra.enums.eventType.treatment",
    follow_up: "common:features.extra.enums.eventType.follow_up",
    emergency: "common:features.extra.enums.eventType.emergency",
    pregnancy: "common:features.extra.enums.eventType.pregnancy",
    chronic_condition:
      "common:features.extra.enums.eventType.chronic_condition",
    injury: "common:features.extra.enums.eventType.injury",
    screening: "common:features.extra.enums.eventType.screening",
    other: "common:features.extra.enums.eventType.other",
  },
  role: {
    admin: "common:features.extra.enums.role.admin",
    editor: "common:features.extra.enums.role.editor",
    viewer: "common:features.extra.enums.role.viewer",
    owner: "common:features.extra.enums.role.owner",
  },
  language: {
    Czech: "common:features.extra.enums.language.Czech",
    Romanian: "common:features.extra.enums.language.Romanian",
    Polish: "common:features.extra.enums.language.Polish",
    Dutch: "common:features.extra.enums.language.Dutch",
    Portuguese: "common:features.extra.enums.language.Portuguese",

    English: "common:features.extra.enums.language.English",
    Italian: "common:features.extra.enums.language.Italian",
    German: "common:features.extra.enums.language.German",
    French: "common:features.extra.enums.language.French",
    Spanish: "common:features.extra.enums.language.Spanish",
    Russian: "common:features.extra.enums.language.Russian",
  },
  linkType: {
    related: "common:features.extra.enums.linkType.related",
    invoice_for: "common:features.extra.enums.linkType.invoice_for",
    report_for: "common:features.extra.enums.linkType.report_for",
    imaging_for: "common:features.extra.enums.linkType.imaging_for",
    follow_up: "common:features.extra.enums.linkType.follow_up",
  },
  shareStatus: {
    active: "common:features.extra.enums.shareStatus.active",
    expired: "common:features.extra.enums.shareStatus.expired",
    revoked: "common:features.extra.enums.shareStatus.revoked",
  },
  normalization: {
    doctors: "common:features.extra.enums.normalization.doctors",
    facilities: "common:features.extra.enums.normalization.facilities",
    specialties: "common:features.extra.enums.normalization.specialties",
    lab_tests: "common:features.extra.enums.normalization.lab_tests",
    diagnoses: "common:features.extra.enums.normalization.diagnoses",
    medications: "common:features.extra.enums.normalization.medications",
  },
  normalizationSingular: {
    doctors: "common:features.extra.enums.normalizationSingular.doctors",
    facilities: "common:features.extra.enums.normalizationSingular.facilities",
    specialties:
      "common:features.extra.enums.normalizationSingular.specialties",
  },
  flow: {
    ocr_llm: "common:features.extra.enums.flow.ocr_llm",
    vision_llm: "common:features.extra.enums.flow.vision_llm",
    ocr_only: "common:features.extra.enums.flow.ocr_only",
    llm_only: "common:features.extra.enums.flow.llm_only",
  },
  modality: {
    CT: "common:features.extra.enums.modality.CT",
    MR: "common:features.extra.enums.modality.MR",
    US: "common:features.extra.enums.modality.US",
    XR: "common:features.extra.enums.modality.XR",
    CR: "common:features.extra.enums.modality.CR",
    DX: "common:features.extra.enums.modality.DX",
    MG: "common:features.extra.enums.modality.MG",
    PT: "common:features.extra.enums.modality.PT",
    NM: "common:features.extra.enums.modality.NM",
    RF: "common:features.extra.enums.modality.RF",
    OT: "common:features.extra.enums.modality.OT",
    unknown: "common:features.extra.enums.modality.unknown",
  },
  sectionType: {
    referral: "common:features.extra.enums.sectionType.referral",
    medical_order: "common:features.extra.enums.sectionType.medical_order",
    examination_report:
      "common:features.extra.enums.sectionType.examination_report",
    insurance_document:
      "common:features.extra.enums.sectionType.insurance_document",
    lab_results_page:
      "common:features.extra.enums.sectionType.lab_results_page",
    clinical_notes: "common:features.extra.enums.sectionType.clinical_notes",
    nursing_notes: "common:features.extra.enums.sectionType.nursing_notes",
    vital_signs: "common:features.extra.enums.sectionType.vital_signs",
    consent_form: "common:features.extra.enums.sectionType.consent_form",
    cover_page: "common:features.extra.enums.sectionType.cover_page",
    medication_chart:
      "common:features.extra.enums.sectionType.medication_chart",
    operative_notes: "common:features.extra.enums.sectionType.operative_notes",
    discharge_summary:
      "common:features.extra.enums.sectionType.discharge_summary",
    imaging_report: "common:features.extra.enums.sectionType.imaging_report",
    correspondence: "common:features.extra.enums.sectionType.correspondence",
    invoice_page: "common:features.extra.enums.sectionType.invoice_page",
  },
} as const;
export function enumMessage(
  kind: keyof typeof labelKeys,
  value: string | null | undefined,
): string | TranslatedMessage {
  if (!value) return "";
  const keys: Readonly<Record<string, MessageKey>> = labelKeys[kind];
  return Object.prototype.hasOwnProperty.call(keys, value)
    ? message(keys[value])
    : value;
}

export function enumLabel(
  kind: keyof typeof labelKeys | "docType",
  value: string | null | undefined,
): string {
  if (!value) return "";
  const t = i18n.getFixedT(null, "common");
  if (kind === "docType") return formatDocType(value, t);
  const keys: Readonly<Record<string, string>> = labelKeys[kind];
  const key = Object.prototype.hasOwnProperty.call(keys, value)
    ? keys[value]
    : undefined;
  return key ? t(key as CommonKey) : value.replace(/_/g, " ");
}
