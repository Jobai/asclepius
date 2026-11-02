import { message, type MessageKey, type UiMessage } from "@/i18n/messages";

// Lookup by stable prompt/placeholder IDs; prompt bodies and API payloads are content.
const keys = {
  title: {
    classification:
      "settings:features.extra.promptMetadata.titles.classification",
    extraction_referral:
      "settings:features.extra.promptMetadata.titles.extraction_referral",
    extraction_medical_order:
      "settings:features.extra.promptMetadata.titles.extraction_medical_order",
    extraction_examination_report:
      "settings:features.extra.promptMetadata.titles.extraction_examination_report",
    extraction_insurance_document:
      "settings:features.extra.promptMetadata.titles.extraction_insurance_document",
    vision_extraction:
      "settings:features.extra.promptMetadata.titles.vision_extraction",
    extraction_lab_test:
      "settings:features.extra.promptMetadata.titles.extraction_lab_test",
    extraction_specialist_report:
      "settings:features.extra.promptMetadata.titles.extraction_specialist_report",
    extraction_prescription:
      "settings:features.extra.promptMetadata.titles.extraction_prescription",
    extraction_invoice:
      "settings:features.extra.promptMetadata.titles.extraction_invoice",
    extraction_discharge:
      "settings:features.extra.promptMetadata.titles.extraction_discharge",
    extraction_imaging_report:
      "settings:features.extra.promptMetadata.titles.extraction_imaging_report",
    extraction_surgical_report:
      "settings:features.extra.promptMetadata.titles.extraction_surgical_report",
    extraction_vaccination:
      "settings:features.extra.promptMetadata.titles.extraction_vaccination",
    document_edit:
      "settings:features.extra.promptMetadata.titles.document_edit",
    sql_generation:
      "settings:features.extra.promptMetadata.titles.sql_generation",
    chat_system: "settings:features.extra.promptMetadata.titles.chat_system",
    link_suggestion:
      "settings:features.extra.promptMetadata.titles.link_suggestion",
    page_classification:
      "settings:features.extra.promptMetadata.titles.page_classification",
    translation: "settings:features.extra.promptMetadata.titles.translation",
  },
  description: {
    classification:
      "settings:features.extra.promptMetadata.descriptions.classification",
    extraction_referral:
      "settings:features.extra.promptMetadata.descriptions.extraction_referral",
    extraction_medical_order:
      "settings:features.extra.promptMetadata.descriptions.extraction_medical_order",
    extraction_examination_report:
      "settings:features.extra.promptMetadata.descriptions.extraction_examination_report",
    extraction_insurance_document:
      "settings:features.extra.promptMetadata.descriptions.extraction_insurance_document",
    vision_extraction:
      "settings:features.extra.promptMetadata.descriptions.vision_extraction",
    extraction_lab_test:
      "settings:features.extra.promptMetadata.descriptions.extraction_lab_test",
    extraction_specialist_report:
      "settings:features.extra.promptMetadata.descriptions.extraction_specialist_report",
    extraction_prescription:
      "settings:features.extra.promptMetadata.descriptions.extraction_prescription",
    extraction_invoice:
      "settings:features.extra.promptMetadata.descriptions.extraction_invoice",
    extraction_discharge:
      "settings:features.extra.promptMetadata.descriptions.extraction_discharge",
    extraction_imaging_report:
      "settings:features.extra.promptMetadata.descriptions.extraction_imaging_report",
    extraction_surgical_report:
      "settings:features.extra.promptMetadata.descriptions.extraction_surgical_report",
    extraction_vaccination:
      "settings:features.extra.promptMetadata.descriptions.extraction_vaccination",
    document_edit:
      "settings:features.extra.promptMetadata.descriptions.document_edit",
    sql_generation:
      "settings:features.extra.promptMetadata.descriptions.sql_generation",
    chat_system:
      "settings:features.extra.promptMetadata.descriptions.chat_system",
    link_suggestion:
      "settings:features.extra.promptMetadata.descriptions.link_suggestion",
    page_classification:
      "settings:features.extra.promptMetadata.descriptions.page_classification",
    translation:
      "settings:features.extra.promptMetadata.descriptions.translation",
  },
  variable: {
    ocr_text: "settings:features.extra.promptMetadata.variables.ocr_text",
    pages_text: "settings:features.extra.promptMetadata.variables.pages_text",
    patient_list:
      "settings:features.extra.promptMetadata.variables.patient_list",
    facility_list:
      "settings:features.extra.promptMetadata.variables.facility_list",
    doctor_list: "settings:features.extra.promptMetadata.variables.doctor_list",
    few_shot_examples:
      "settings:features.extra.promptMetadata.variables.few_shot_examples",
    lab_test_mappings:
      "settings:features.extra.promptMetadata.variables.lab_test_mappings",
    specialty_mappings:
      "settings:features.extra.promptMetadata.variables.specialty_mappings",
    diagnosis_mappings:
      "settings:features.extra.promptMetadata.variables.diagnosis_mappings",
    medication_mappings:
      "settings:features.extra.promptMetadata.variables.medication_mappings",
    doc_id: "settings:features.extra.promptMetadata.variables.doc_id",
    doc_type: "settings:features.extra.promptMetadata.variables.doc_type",
    doc_date: "settings:features.extra.promptMetadata.variables.doc_date",
    doctor_name: "settings:features.extra.promptMetadata.variables.doctor_name",
    facility_name:
      "settings:features.extra.promptMetadata.variables.facility_name",
    summary: "settings:features.extra.promptMetadata.variables.summary",
    other_documents:
      "settings:features.extra.promptMetadata.variables.other_documents",
    schema: "settings:features.extra.promptMetadata.variables.schema",
    context: "settings:features.extra.promptMetadata.variables.context",
    question: "settings:features.extra.promptMetadata.variables.question",
    patient_context:
      "settings:features.extra.promptMetadata.variables.patient_context",
    current_data:
      "settings:features.extra.promptMetadata.variables.current_data",
    user_instruction:
      "settings:features.extra.promptMetadata.variables.user_instruction",
    json_schema: "settings:features.extra.promptMetadata.variables.json_schema",
    target_language:
      "settings:features.extra.promptMetadata.variables.target_language",
  },
} as const;
export function promptMessage(
  kind: keyof typeof keys,
  id: string,
  fallback: string,
): UiMessage {
  const table: Readonly<Record<string, MessageKey>> = keys[kind];
  return Object.prototype.hasOwnProperty.call(table, id)
    ? message(table[id])
    : fallback;
}
