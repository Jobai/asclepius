import type { CommonKey } from "@/i18n/messages";
/** Column registry for the Imaging list view. Mirrors
 * components/documents/columns.ts so SettingsPage can drive both with
 * the same code path (useColumnPrefs + the shared ColumnPrefsSection). */

export type ImagingColumnKey =
  | "modality"
  | "body_part"
  | "study_date"
  | "facility"
  | "doctor"
  | "report_status"
  | "date_added";

export interface ImagingColumnDef {
  key: ImagingColumnKey;
  labelKey: CommonKey;
  defaultVisible: boolean;
  width: string;
}

export const IMAGING_COLUMNS: ImagingColumnDef[] = [
  {
    key: "modality",
    labelKey: "columns.type",
    defaultVisible: true,
    width: "12%",
  },
  {
    key: "body_part",
    labelKey: "columns.bodyPart",
    defaultVisible: true,
    width: "16%",
  },
  {
    key: "study_date",
    labelKey: "columns.date",
    defaultVisible: true,
    width: "10%",
  },
  {
    key: "facility",
    labelKey: "columns.facility",
    defaultVisible: true,
    width: "20%",
  },
  {
    key: "doctor",
    labelKey: "columns.doctor",
    defaultVisible: false,
    width: "16%",
  },
  {
    key: "report_status",
    labelKey: "columns.report",
    defaultVisible: true,
    width: "12%",
  },
  {
    key: "date_added",
    labelKey: "columns.added",
    defaultVisible: false,
    width: "10%",
  },
];

export const IMAGING_DEFAULTS = {
  visible: IMAGING_COLUMNS.filter((c) => c.defaultVisible).map(
    (c) => c.key as string,
  ),
  order: IMAGING_COLUMNS.map((c) => c.key as string),
};
