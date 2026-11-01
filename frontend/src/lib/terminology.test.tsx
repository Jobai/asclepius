import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { message, termMessage, useMessage } from "@/i18n/messages";
import api from "@/api/client";
import { createResource } from "@/hooks/data/createResource";
import { useTranslation } from "react-i18next";
import { RowsTable } from "@/pages/lab-results/RowsTable";
import { TrendChartPanel } from "@/pages/lab-results/TrendChartPanel";
import type { LabRow } from "@/pages/lab-results/types";
import TermDisplayNamesEditor from "@/components/settings/normalization/TermDisplayNamesEditor";
import type { NormItem } from "@/components/settings/normalization/types";
import {
  labLabel,
  preferredTermName,
  sortTerms,
  termLabel,
  termMatches,
} from "./terminology";

vi.mock("@/api/client", () => ({ default: { patch: vi.fn(), get: vi.fn() } }));
vi.mock("@/components/lab-results/LabTrendChart", () => ({
  default: ({ selectedCodes }: { selectedCodes: string[] }) => (
    <output data-testid="selected-codes">{selectedCodes.join(",")}</output>
  ),
}));

const term = {
  id: 7,
  canonical_code: "hemoglobin",
  canonical_display: "Hemoglobin",
  display_names: { en: "Hemoglobin", de: "Hämoglobin" },
  search_terms: ["Hb", "Emoglobina"],
};
const row: LabRow = {
  id: 1,
  document_id: 2,
  document_filename: "lab.pdf",
  document_doc_type: "lab_test",
  document_event_date: null,
  document_missing: 0,
  patient_id: 1,
  test_name_original: "Hb original",
  test_name_canonical: "Hemoglobin",
  test_display_names: term.display_names,
  canonical_code: "hemoglobin",
  value: 0.1,
  value_text: "<0.1",
  unit: "g/dL",
  reference_range_low: 1,
  reference_range_high: 2,
  is_abnormal: 1,
  sample_type: null,
  panel_name: null,
  test_date: "2026-11-01",
};

describe("preferred terminology names", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses the selected language and falls back to canonical then original text", async () => {
    expect(
      preferredTermName({ de: "Hämoglobin" }, "Hemoglobin", "Hb", "de-DE"),
    ).toBe("Hämoglobin");
    expect(
      preferredTermName({ de: "Hämoglobin" }, "Hemoglobin", "Hb", "en"),
    ).toBe("Hemoglobin");
    expect(preferredTermName({}, null, "Original", "de")).toBe("Original");
    expect(preferredTermName({ de: "  " }, "Canonical", null, "de")).toBe(
      "Canonical",
    );
    expect(termMatches(term, "HÄMOGLOBIN")).toBe(true);
    expect(termMatches(term, "hemoglobin")).toBe(true);
    expect(termMatches(term, "emoglobina")).toBe(true);
    const terms = [
      term,
      {
        id: 8,
        canonical_code: "alp",
        canonical_display: "Z-last",
        display_names: { de: "Alkalische Phosphatase", en: "Z-last" },
      },
    ];
    expect(sortTerms(terms).map((x) => x.id)).toEqual([7, 8]);
    await i18n.changeLanguage("de");
    expect(sortTerms(terms).map((x) => x.id)).toEqual([8, 7]);
    expect(terms.map((x) => x.id)).toEqual([7, 8]);
    expect(termLabel(term)).toBe("Hämoglobin");
    expect(labLabel(row)).toBe("Hämoglobin");
  });

  it("switches an open confirmation's nested term name at render time", async () => {
    const descriptor = message("feedback.delete", {
      value0: termMessage(term),
    });
    function Example() {
      const renderMessage = useMessage();
      return <p data-testid="message">{renderMessage(descriptor)}</p>;
    }
    render(<Example />);
    expect(screen.getByTestId("message")).toHaveTextContent("Hemoglobin");
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getByTestId("message")).toHaveTextContent("Hämoglobin");
  });

  it("changes lab table names while preserving report values and the raw editor", async () => {
    const original = structuredClone(row);
    const props = {
      rows: [row],
      editingId: null as number | null,
      editVals: {},
      setEditVals: vi.fn(),
      startEdit: vi.fn(),
      cancelEdit: vi.fn(),
      saveEdit: vi.fn(),
      deleteRow: vi.fn(),
      saving: false,
    };
    const view = render(
      <MemoryRouter>
        <RowsTable {...props} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Hemoglobin")).toHaveLength(2);
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getAllByText("Hämoglobin")).toHaveLength(2);
    expect(screen.getAllByText(/<0\.1/)).toHaveLength(2);
    view.rerender(
      <MemoryRouter>
        <RowsTable {...props} editingId={1} editVals={row} />
      </MemoryRouter>,
    );
    expect(screen.getAllByDisplayValue("Hb original")).toHaveLength(2);
    expect(row).toEqual(original);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("keeps chart selections and bilingual search through a language change", async () => {
    render(<TrendChartPanel rows={[row]} />);
    fireEvent.click(screen.getByRole("button", { name: /trend chart/i }));
    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    fireEvent.click(screen.getByRole("button", { name: /Hemoglobin/ }));
    expect(screen.getByTestId("selected-codes")).toHaveTextContent(
      "hemoglobin",
    );
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getAllByText("Hämoglobin").length).toBeGreaterThan(0);
    expect(screen.getByTestId("selected-codes")).toHaveTextContent(
      "hemoglobin",
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Hemoglobin" },
    });
    expect(
      screen.getByRole("button", { name: /Hämoglobin/ }),
    ).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("preserves unsaved preferred names during language switching and writes only labels", async () => {
    const patched = {
      ...term,
      display_names: { en: "Hemoglobin", de: "Mein Hämoglobin" },
    };
    vi.mocked(api.patch).mockResolvedValueOnce({ data: patched });
    function Editor() {
      const [item, setItem] = useState<NormItem>(term);
      return (
        <TermDisplayNamesEditor
          item={item}
          normType="lab_tests"
          onSaved={setItem}
        />
      );
    }
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("German"), {
      target: { value: "Mein Hämoglobin" },
    });
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getByLabelText("Deutsch")).toHaveValue("Mein Hämoglobin");
    fireEvent.click(
      screen.getByRole("button", { name: "Anzeigenamen speichern" }),
    );
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/normalization/lab_tests/7", {
        display_names: { en: "Hemoglobin", de: "Mein Hämoglobin" },
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Anzeigenamen speichern" }),
      ).toBeDisabled(),
    );
  });

  it("updates an already loaded picker cache without another language request", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [term] });
    const useTerms = createResource<Array<typeof term>>(
      "/normalization/lab_tests",
    );
    function Picker() {
      useTranslation();
      const { data } = useTerms();
      return <p>{data?.map(termLabel).join(", ")}</p>;
    }
    render(<Picker />);
    await screen.findByText("Hemoglobin");
    act(() =>
      useTerms.updateCached((items) =>
        items.map((item) => ({
          ...item,
          display_names: { ...item.display_names, de: "Eigener Name" },
        })),
      ),
    );
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getByText("Eigener Name")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
