import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enDocuments from "./locales/en/documents.json";
import enPatients from "./locales/en/patients.json";
import enClinical from "./locales/en/clinical.json";
import enSettings from "./locales/en/settings.json";
import enShare from "./locales/en/share.json";
import enErrors from "./locales/en/errors.json";
import deCommon from "./locales/de/common.json";
import deAuth from "./locales/de/auth.json";
import deDocuments from "./locales/de/documents.json";
import dePatients from "./locales/de/patients.json";
import deClinical from "./locales/de/clinical.json";
import deSettings from "./locales/de/settings.json";
import deShare from "./locales/de/share.json";
import deErrors from "./locales/de/errors.json";

export const defaultNS = "common";
export const resources = {
  en: {
    common: enCommon, auth: enAuth, documents: enDocuments, patients: enPatients,
    clinical: enClinical, settings: enSettings, share: enShare, errors: enErrors,
  },
  de: {
    common: deCommon, auth: deAuth, documents: deDocuments, patients: dePatients,
    clinical: deClinical, settings: deSettings, share: deShare, errors: deErrors,
  },
} as const;
