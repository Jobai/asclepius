import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import {
  formatClinicalResult,
  formatClinicalValue,
  formatNumber,
  useUiFormat,
} from "./formatting";
import { formatDate } from "./utils";
import { formatDateTime, formatRelative, parseBackendTs } from "./datetime";

describe("locale-aware clinical formatting", () => {
  it.each(["<0.1", "> 5", "3.5–4.8", "negativ", "0.1000", "1,25"])(
    "preserves raw %s exactly",
    (value) => {
      expect(formatClinicalValue(value, "de-DE")).toBe(value);
      expect(
        formatClinicalResult({ value: 0.1, value_text: value }, "de-DE"),
      ).toBe(value);
    },
  );
  it("preserves numeric precision, tiny values and units without parsing display text", () => {
    expect(formatClinicalValue(1.2345678901234567, "de-DE")).toBe(
      "1,2345678901234567",
    );
    expect(formatClinicalValue(0.000000001, "de-DE")).toBe("0,000000001");
    expect(formatClinicalResult({ value: 0 }, "de-DE")).toBe("0");
    expect(formatClinicalResult({ value: null }, "de-DE")).toBe("—");
    expect(formatNumber(1234, "de-DE", { maximumFractionDigits: 0 })).toBe(
      "1.234",
    );
  });
  it("keeps date-only days stable and timestamps equivalent across offsets", () => {
    expect(formatDate("2026-03-29", "de-DE")).toBe("29. März 2026");
    expect(formatDate("bad", "de-DE")).toBe("bad");
    const naive = "2026-03-29T01:30:00";
    const offset = "2026-03-29T03:30:00+02:00";
    expect(parseBackendTs(naive)).toBe(parseBackendTs(offset));
    expect(formatDateTime(naive, "de-DE")).toBe(
      formatDateTime(offset, "de-DE"),
    );
    expect(
      formatDateTime(naive, "de-DE", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ).toBe("01:30");
  });
  it("uses localized relative times with explicit boundary labels", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 1, 12));
    try {
      expect(formatRelative("2026-11-01T11:57:00", "past", "de-DE")).toContain(
        "vor 3",
      );
      expect(
        formatRelative("2026-11-01T12:02:00", "future", "de-DE"),
      ).toContain("in 2");
      expect(
        formatRelative("2026-11-01T11:00:00", "future", "de-DE", {
          expired: "abgelaufen",
          justNow: "gerade eben",
        }),
      ).toBe("abgelaufen");
    } finally {
      vi.restoreAllMocks();
    }
  });
  it("updates hook-bound formatters when the language changes", async () => {
    function Example() {
      const { formatClinicalValue, formatDateTime } = useUiFormat();
      return (
        <p>
          {formatClinicalValue(1.25)} ·{" "}
          {formatDateTime("2026-11-01T12:00:00", {
            timeZone: "UTC",
            month: "long",
          })}
        </p>
      );
    }
    render(<Example />);
    expect(screen.getByText("1.25 · November")).toBeInTheDocument();
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getByText("1,25 · November")).toBeInTheDocument();
  });
});
