import { i18n } from "@/i18n";

export type TermDisplayNames = Partial<Record<"en" | "de", string>>;

export interface NamedTerm {
  display_names?: TermDisplayNames;
  canonical_display?: string | null;
  canonical_code?: string | null;
  name?: string | null;
  search_terms?: string[];
}

/** Render-time UI metadata only. Never use the result as an ID or write value.
 * Consumers subscribe to language changes via useTranslation; memoized callers
 * must include the current language in their dependencies.
 */
export function preferredTermName(
  names: TermDisplayNames | null | undefined,
  canonical?: string | null,
  original?: string | null,
  language = i18n.resolvedLanguage || i18n.language || "en",
): string {
  const key = language.split("-")[0] === "de" ? "de" : "en";
  return names?.[key]?.trim() || canonical || original || "";
}

export function termLabel(term: NamedTerm | null | undefined): string {
  return preferredTermName(
    term?.display_names,
    term?.canonical_display,
    term?.name || term?.canonical_code,
  );
}

export function termMatches(term: NamedTerm, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  return [
    term.canonical_display,
    term.canonical_code,
    term.name,
    ...Object.values(term.display_names || {}),
    ...(term.search_terms || []),
  ].some((value) => value?.toLocaleLowerCase().includes(q));
}

export function termSearchText(term: NamedTerm): string {
  return [
    term.canonical_display,
    term.canonical_code,
    ...Object.values(term.display_names || {}),
    ...(term.search_terms || []),
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ClinicalTermNames {
  test_display_names?: TermDisplayNames;
  test_name_canonical?: string | null;
  test_name_original?: string | null;
  specialty_display_names?: TermDisplayNames;
  specialty_canonical_display?: string | null;
  specialty_display?: string | null;
  specialty_original?: string | null;
  diagnosis_display_names?: TermDisplayNames;
  diagnosis_canonical_display?: string | null;
  diagnosis_original?: string | null;
  medication_display_names?: TermDisplayNames;
  medication_canonical_display?: string | null;
  active_ingredient_original?: string | null;
  brand_name?: string | null;
}

export const labLabel = (row: ClinicalTermNames): string =>
  preferredTermName(
    row.test_display_names,
    row.test_name_canonical,
    row.test_name_original,
  );

export const specialtyLabel = (row: ClinicalTermNames): string =>
  preferredTermName(
    row.specialty_display_names,
    row.specialty_canonical_display || row.specialty_display,
    row.specialty_original,
  );

export const diagnosisLabel = (row: ClinicalTermNames): string =>
  preferredTermName(
    row.diagnosis_display_names,
    row.diagnosis_canonical_display,
    row.diagnosis_original,
  );

export const medicationLabel = (row: ClinicalTermNames): string =>
  preferredTermName(
    row.medication_display_names,
    row.medication_canonical_display,
    row.active_ingredient_original || row.brand_name,
  );

export function sortTerms<T extends NamedTerm>(terms: T[]): T[] {
  return [...terms].sort(
    (a, b) =>
      termLabel(a).localeCompare(termLabel(b), i18n.resolvedLanguage || "en") ||
      (a.canonical_code || "").localeCompare(b.canonical_code || ""),
  );
}
