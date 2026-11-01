import { act, render, screen } from "@testing-library/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { describe, expect, it } from "vitest";
import { i18n } from "./index";
import { COLUMNS, DOCUMENTS_DEFAULTS } from "@/components/documents/columns";
import { IMAGING_DEFAULTS } from "@/components/imaging/columns";
import { NAV_ITEMS, pageTitleFor } from "@/components/layout/nav";
import { stageLabel, formatElapsed } from "@/lib/pipelineStages";
import { formatDocType, statusLabel } from "@/lib/utils";

describe("shared display labels", () => {
  it("updates navigation, memoized columns, statuses and pipeline labels without changing IDs", async () => {
    const savedColumns = structuredClone(DOCUMENTS_DEFAULTS);
    const savedImaging = structuredClone(IMAGING_DEFAULTS);
    function Example() {
      const { t } = useTranslation("common");
      const columns = useMemo(
        () => COLUMNS.map((column) => t(column.labelKey)).join(" · "),
        [t],
      );
      return (
        <>
          <nav>
            {NAV_ITEMS.map((item) => (
              <span key={item.path}>{t(item.labelKey)}</span>
            ))}
          </nav>
          <h1>{pageTitleFor("/settings/appearance", t)}</h1>
          <p>{columns}</p>
          <p>{stageLabel("page_classification", t)}</p>
          <p>{statusLabel("needs_review", t)}</p>
          <p>{formatDocType("prescription", t)}</p>
        </>
      );
    }
    render(<Example />);
    expect(screen.getByText("Patients")).toBeInTheDocument();
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getByText("Patienten")).toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveTextContent("Einstellungen");
    expect(screen.getByText(/Hinzugefügt am/)).toBeInTheDocument();
    expect(screen.getByText("Seitenklassifizierung")).toBeInTheDocument();
    expect(screen.getByText("Prüfung erforderlich")).toBeInTheDocument();
    expect(screen.getByText("Rezept")).toBeInTheDocument();
    expect(DOCUMENTS_DEFAULTS).toEqual(savedColumns);
    expect(IMAGING_DEFAULTS).toEqual(savedImaging);
    expect(stageLabel("future_stage")).toBe("future stage");
    expect(formatDocType("future_type")).toBe("future type");
    expect(statusLabel("future_status")).toBe("future status");
    expect(formatElapsed(3500, "de-DE")).toBe(
      new Intl.NumberFormat("de-DE", {
        style: "unit",
        unit: "second",
        unitDisplay: "narrow",
      }).format(3),
    );
  });
});
