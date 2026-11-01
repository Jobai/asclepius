import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import api from "@/api/client";
import type { Encounter } from "@/types";
import { ToastProvider } from "@/contexts/ToastContext";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { DiagnosesSection } from "./EncountersSection";
import { EncounterDetailsSection } from "./EncounterDetailsSection";

vi.mock("@/api/client", () => ({ default: { patch: vi.fn() } }));
vi.mock("@/hooks/data", () => ({
  useDiagnoses: () => ({ data: [], loading: false }),
}));
vi.mock("@/hooks/useMediaQuery", () => ({
  useBreakpoint: () => ({ isMobile: false }),
}));

const encounter: Encounter = {
  id: 12,
  document_id: 3,
  patient_id: 1,
  doctor_id: 4,
  facility_id: 5,
  doctor_name: "Dr Example",
  facility_name: "Example Clinic",
  encounter_date: "2026-10-01",
  admission_date: "2026-10-02",
  discharge_date: "2026-10-03",
  norm_diagnosis_id: 6,
  diagnosis_original: "Original diagnosis",
  diagnosis_canonical_display: "Canonical diagnosis",
  diagnosis_code: "J06.9",
  norm_specialty_id: 7,
  specialty_canonical_display: "Internal medicine",
  specialty_display_names: { en: "Internal medicine", de: "Innere Medizin" },
  notes: "Document summary",
  findings: "First finding\nSecond finding",
  follow_up_date: "2026-10-08",
  follow_up_instructions: "Arrange a follow-up appointment",
};

function renderSections(records: Encounter[] = [encounter], onUpdated = vi.fn()) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <DiagnosesSection encounters={records} onUpdated={onUpdated} />
        <EncounterDetailsSection encounters={records} onUpdated={onUpdated} />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

describe("document diagnoses and encounter details", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.clearAllMocks();
    vi.mocked(api.patch).mockReset();
  });

  it.each([
    ["en", "Diagnoses", "Encounter details", "Findings", "Internal medicine", "1 Oct 2026"],
    ["de", "Diagnosen", "Behandlungsinformationen", "Befunde", "Innere Medizin", "1. Okt. 2026"],
  ])("shows separate sections and all clinical data in %s", async (language, diagnoses, details, findings, specialty, date) => {
    await i18n.changeLanguage(language);
    renderSections();

    expect(screen.getByRole("heading", { name: diagnoses })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: details })).toBeInTheDocument();
    expect(screen.getByText("Original diagnosis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "J06.9" })).toBeInTheDocument();
    expect(screen.getByText("Dr Example")).toBeInTheDocument();
    expect(screen.getByText("Example Clinic")).toBeInTheDocument();
    expect(screen.getByText(specialty)).toBeInTheDocument();
    expect(screen.getByText(date)).toBeInTheDocument();
    expect(screen.getByText(findings)).toBeInTheDocument();
    expect(screen.getByText(/First finding/)).toHaveTextContent("Second finding");
    expect(screen.getByText("Arrange a follow-up appointment")).toBeInTheDocument();
    expect(screen.getByText("Document summary")).toBeInTheDocument();
    // The date fields must all render, including admission/discharge and follow-up.
    expect(document.querySelectorAll("dt")).toHaveLength(9);
    expect(document.querySelectorAll("dd")).toHaveLength(9);
    expect(screen.getAllByText(/2026/)).toHaveLength(4);
  });

  it("shows missing fields explicitly and keeps encounters without a diagnosis visible", () => {
    const empty = Object.fromEntries(Object.keys(encounter).map((key) => [key, null]));
    renderSections([{ ...empty, id: 12, document_id: 3, patient_id: 1 } as Encounter]);

    expect(screen.getByRole("heading", { name: "Encounter 1" })).toBeInTheDocument();
    expect(screen.getAllByText("Not documented")).toHaveLength(9);
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it("preserves distinct findings for multiple entries in the same document", () => {
    renderSections([encounter, { ...encounter, id: 13, findings: "Different findings" }]);

    expect(screen.getByText(/First finding/)).toBeInTheDocument();
    expect(screen.getByText("Different findings")).toBeInTheDocument();
  });

  it.each([
    ["en", "Associated diagnoses"],
    ["de", "Zugehörige Diagnosen"],
  ])("shows identical contact details once with all diagnoses in %s", async (language, label) => {
    await i18n.changeLanguage(language);
    renderSections([
      encounter,
      {
        ...encounter,
        id: 13,
        norm_diagnosis_id: 8,
        diagnosis_original: "Second diagnosis",
        diagnosis_canonical_display: "Second diagnosis",
        diagnosis_code: "K21.9",
      },
    ]);

    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(1);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("Document summary")).toBeInTheDocument();
    expect(screen.getByText(/First finding/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Canonical diagnosis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second diagnosis" })).toBeInTheDocument();
    const diagnoses = screen.getByRole("list", { name: label });
    expect(diagnoses).toHaveTextContent("Canonical diagnosis");
    expect(diagnoses).toHaveTextContent("Second diagnosis");
  });

  it.each<Partial<Encounter>>([
    { encounter_date: "2026-10-09" },
    { admission_date: "2026-10-09" },
    { discharge_date: "2026-10-09" },
    { doctor_id: 99 },
    { facility_id: 99 },
    { norm_specialty_id: 99 },
    { findings: "Different findings" },
    { follow_up_date: "2026-10-09" },
    { follow_up_instructions: "Different instructions" },
    { notes: "Different notes" },
    { document_id: 99 },
    { patient_id: 99 },
  ])("keeps different contact details separate: %j", (difference) => {
    renderSections([encounter, { ...encounter, ...difference, id: 13 }]);
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(2);
  });

  it("still saves notes to the matching encounter from the new section", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { status: "updated" } });
    const onUpdated = vi.fn();
    renderSections([encounter], onUpdated);

    fireEvent.click(screen.getByText("Document summary"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Reviewed notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/encounters/12", { notes: "Reviewed notes" }));
    expect(onUpdated).toHaveBeenCalledOnce();
  });

  it.each([
    ["Save", "Reviewed shared notes"],
    ["Delete", null],
  ])("updates all grouped source rows when notes use %s", async (action, value) => {
    vi.mocked(api.patch).mockResolvedValue({ data: { status: "updated" } });
    const onUpdated = vi.fn();
    renderSections([
      encounter,
      { ...encounter, id: 13, diagnosis_original: "Second diagnosis" },
      { ...encounter, id: 14, findings: "Different findings", notes: "Independent notes" },
    ], onUpdated);

    fireEvent.click(screen.getByText("Document summary"));
    if (value) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: action }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    expect(api.patch).toHaveBeenCalledTimes(2);
    expect(api.patch).toHaveBeenCalledWith("/encounters/12", { notes: value });
    expect(api.patch).toHaveBeenCalledWith("/encounters/13", { notes: value });
  });

  it("reports partial note-save failures and refreshes completed writes", async () => {
    vi.mocked(api.patch)
      .mockResolvedValueOnce({ data: { status: "updated" } })
      .mockRejectedValueOnce(new Error("Save failed"));
    const onUpdated = vi.fn();
    renderSections([encounter, { ...encounter, id: 13 }], onUpdated);

    fireEvent.click(screen.getByText("Document summary"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Updated notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Failed to save")).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledOnce();
    expect(api.patch).toHaveBeenCalledTimes(2);
  });

  it("hides both sections when the document has no encounter records", () => {
    renderSections([]);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
