import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import api from "@/api/client";
import { ToastProvider } from "@/contexts/ToastContext";
import TypeSpecificDetails from "./TypeSpecificDetails";

vi.mock("@/api/client", () => ({ default: { patch: vi.fn() } }));

describe("type-specific document details", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    await i18n.changeLanguage("de");
  });

  it("edits an insurance decision using stable codes and keeps reference details", async () => {
    const onSave = vi.fn();
    const doc = {
      id: 4,
      doc_type: "insurance_document",
      document_details: {
        insurance_document: { decision: "pending", reference_number: "AZ-123" },
      },
    };
    vi.mocked(api.patch).mockResolvedValue({
      data: { ...doc, notes: "saved" },
    });
    render(
      <ToastProvider>
        <TypeSpecificDetails doc={doc} onSave={onSave} />
      </ToastProvider>,
    );
    expect(screen.getByLabelText("Aktenzeichen")).toHaveValue("AZ-123");
    fireEvent.change(
      screen.getByLabelText("Entscheidung / Bearbeitungsstand"),
      {
        target: { value: "partially_approved" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/documents/4", {
        document_details: {
          insurance_document: {
            decision: "partially_approved",
            reference_number: "AZ-123",
          },
        },
      }),
    );
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "saved" }),
    );
  });

  it("shows both referral and examination details from a mixed PDF", () => {
    const doc = {
      id: 5,
      doc_type: "referral",
      document_details: {
        referral: { requested_service: "Koloskopie" },
        examination_report: { findings: "Unauffälliger Befund" },
      },
    };
    render(
      <ToastProvider>
        <TypeSpecificDetails doc={doc} onSave={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByLabelText("Auftrag")).toHaveValue("Koloskopie");
    expect(screen.getByLabelText("Befund")).toHaveValue("Unauffälliger Befund");
  });

  it("renders no additional fields for an ordinary medication prescription", () => {
    const { container } = render(
      <ToastProvider>
        <TypeSpecificDetails
          doc={{ id: 6, doc_type: "prescription" }}
          onSave={vi.fn()}
        />
      </ToastProvider>,
    );
    expect(container.querySelector("form")).toBeNull();
  });
});
