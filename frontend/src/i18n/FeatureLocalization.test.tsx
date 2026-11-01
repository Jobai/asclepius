import PromptsTab from "@/components/settings/PromptsTab";
import { useState } from "react";
import { Trans } from "react-i18next";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import api from "@/api/client";
import EventForm, { type EventFormData } from "@/pages/events/EventForm";
import SetupWizardPage from "@/pages/SetupWizardPage";
import PatientsPage from "@/pages/PatientsPage";
import LanguageTab from "@/components/settings/LanguageTab";
import ReprocessOptionsForm from "@/components/documents/ReprocessOptionsForm";
import ShareSessionEnded from "@/pages/share/ShareSessionEnded";
import { MedicationsSection } from "@/components/document-detail/child-records/MedicationsSection";
import { ToastProvider } from "@/contexts/ToastContext";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { formatFileSize } from "@/lib/formatting";

const settings = vi.hoisted(() => ({
  llm: {
    translation_allowed_languages: ["English", "German"],
    translation_target_language: "English",
  },
}));
vi.mock("@/api/client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/hooks/data", () => ({
  useSettings: () => ({ data: settings, refetch: vi.fn() }),
  usePatients: () => ({ data: [], loading: false, refetch: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ refreshUser: vi.fn() }),
}));
vi.mock("@/components/LanguageSwitcher", () => ({ default: () => null }));
vi.mock("@/hooks/useMediaQuery", () => ({
  useBreakpoint: () => ({ isMobile: false }),
  useMediaQuery: () => false,
}));

const changeLanguage = (language: "en" | "de") =>
  act(() => i18n.changeLanguage(language));
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("feature localization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("keeps an edited medical event and its identifiers while translating the form", async () => {
    const submit = vi.fn();
    function Example() {
      const [value, setValue] = useState<EventFormData>({
        title: "Original diagnosis",
        event_type: "surgery",
        description: "Original notes",
        date_start: "2026-03-08",
        date_end: "",
        is_ongoing: false,
        severity: "severe",
        diagnosis_text: "G47.3",
        notes: "",
      });
      return (
        <EventForm
          mode="edit"
          value={value}
          onChange={setValue}
          onSubmit={() => submit(value)}
          onCancel={vi.fn()}
        />
      );
    }
    const { container } = render(<Example />);
    const title = screen.getByDisplayValue("Original diagnosis");
    fireEvent.change(title, { target: { value: "Unsaved title" } });
    await changeLanguage("de");
    expect(
      screen.getByRole("heading", { name: "Ereignis bearbeiten" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Operation" })).toHaveValue(
      "surgery",
    );
    expect(screen.getByRole("option", { name: "Schwer" })).toHaveValue(
      "severe",
    );
    expect(screen.getByDisplayValue("Unsaved title")).toBe(title);
    expect(container.querySelector('input[type="date"]')).toHaveValue(
      "2026-03-08",
    );
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(submit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "Unsaved title",
        event_type: "surgery",
        severity: "severe",
        diagnosis_text: "G47.3",
        date_start: "2026-03-08",
      }),
    );
    await changeLanguage("en");
    expect(
      screen.getByRole("heading", { name: "Edit Event" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Unsaved title")).toBe(title);
  });

  it("preserves the setup step and credentials when switching languages", async () => {
    const { container } = render(
      <Providers>
        <SetupWizardPage />
      </Providers>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));
    const username = screen.getByPlaceholderText("e.g. jsmith");
    fireEvent.change(username, { target: { value: "test-account" } });
    fireEvent.change(container.querySelector('input[type="password"]')!, {
      target: { value: "unchanged-password" },
    });
    await changeLanguage("de");
    expect(
      screen.getByRole("heading", { name: "Konto erstellen" }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("z. B. mmustermann")).toBe(username);
    expect(username).toHaveValue("test-account");
    expect(container.querySelector('input[type="password"]')).toHaveValue(
      "unchanged-password",
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("translates patient controls without changing the saved clinical values", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 1 } });
    const { container } = render(
      <Providers>
        <PatientsPage />
      </Providers>,
    );
    fireEvent.click(screen.getByRole("button", { name: "New Patient" }));
    const name = container.querySelector('input[type="text"]')!;
    fireEvent.change(name, { target: { value: "Original Patient" } });
    await changeLanguage("de");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "F" } });
    expect(screen.getByRole("option", { name: "Weiblich" })).toHaveValue("F");
    expect(name).toHaveValue("Original Patient");
    fireEvent.click(screen.getByRole("button", { name: "Patient anlegen" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/patients",
        expect.objectContaining({ display_name: "Original Patient", sex: "F" }),
      ),
    );
  });

  it("translates translation-language labels but submits the original API language names", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    render(
      <Providers>
        <LanguageTab />
      </Providers>,
    );
    const select = screen.getByRole("combobox");
    await changeLanguage("de");
    expect(screen.getByRole("option", { name: "Deutsch" })).toHaveValue(
      "German",
    );
    expect(select).toHaveValue("English");
    fireEvent.change(select, { target: { value: "German" } });
    await changeLanguage("en");
    expect(screen.getByRole("combobox")).toBe(select);
    expect(select).toHaveValue("German");
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledExactlyOnceWith("/settings", {
        translation_target_language: "German",
        translation_allowed_languages: ["English", "German"],
      }),
    );
  });

  it("does not start processing on a language switch and retains provider selections", async () => {
    const submit = vi.fn();
    render(
      <ReprocessOptionsForm
        selectedCount={2}
        bulkBusy={null}
        llmProviders={[
          { id: "model-id", name: "gpt-6.1-terra", enabled: true },
        ]}
        ocrProviders={[{ id: "ocr-id", name: "Original OCR", enabled: true }]}
        onSubmit={submit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "LLM only" }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "model-id" },
    });
    await changeLanguage("de");
    expect(screen.getByRole("button", { name: "Nur LLM" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("model-id");
    expect(
      screen.getByRole("option", { name: "gpt-6.1-terra" }),
    ).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Erneute Verarbeitung starten (2)" }),
    );
    expect(submit).toHaveBeenCalledExactlyOnceWith("llm", "model-id", "");
  });

  it("keeps extracted medication names and doses literal", async () => {
    render(
      <Providers>
        <MedicationsSection
          medications={[
            {
              id: 1,
              active_ingredient_original: "Acetylsalicylsäure",
              dosage: "0.1000 mg",
              frequency: "Original frequency",
            },
          ]}
        />
      </Providers>,
    );
    await changeLanguage("de");
    expect(screen.getByText("Dosierung")).toBeInTheDocument();
    expect(screen.getAllByText("Acetylsalicylsäure").length).toBeGreaterThan(0);
    expect(screen.getByText("0.1000 mg")).toBeInTheDocument();
    expect(screen.getByText("Original frequency")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("updates the inert share-ended screen without requesting access again", async () => {
    render(<ShareSessionEnded reason="idle" />);
    expect(
      screen.getByRole("heading", { name: "Session ended after inactivity" }),
    ).toBeInTheDocument();
    await changeLanguage("de");
    expect(
      screen.getByRole("heading", {
        name: "Sitzung wegen Inaktivität beendet",
      }),
    ).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("renders interpolated source text safely inside translated emphasis", async () => {
    await changeLanguage("de");
    const { container } = render(
      <Trans
        ns="share"
        i18nKey="features.shareDialog.codeEmailedToPart0Part0TheAdminCan"
        components={{ part0: <strong /> }}
        values={{ value0: "<b>original@example.com</b>" }}
      />,
    );
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("strong")).toHaveTextContent(
      "<b>original@example.com</b>",
    );
    expect(container).toHaveTextContent(
      "Der Administrator kann ihn nicht einsehen.",
    );
  });

  it("translates prompt metadata while preserving the edited prompt and placeholder tokens", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        {
          key: "classification",
          description: "Backend metadata",
          text: "Keep {ocr_text} literal",
          is_custom: false,
          variables: [
            { name: "ocr_text", description: "Full OCR text", optional: false },
          ],
        },
      ],
    });
    vi.mocked(api.put).mockResolvedValue({ data: { ok: true } });
    render(
      <Providers>
        <PromptsTab />
      </Providers>,
    );
    fireEvent.click(await screen.findByText("Document classification"));
    const editor = screen.getByDisplayValue("Keep {ocr_text} literal");
    fireEvent.change(editor, {
      target: { value: "Unsaved English prompt: {ocr_text}" },
    });
    await changeLanguage("de");
    expect(screen.getByText("Dokumentklassifizierung")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Unsaved English prompt: {ocr_text}")).toBe(
      editor,
    );
    expect(screen.getByRole("button", { name: "{ocr_text}" })).toHaveAttribute(
      "title",
      expect.stringContaining("Vollständiger per OCR erkannter Dokumenttext."),
    );
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledExactlyOnceWith(
        "/settings/prompts/classification",
        { text: "Unsaved English prompt: {ocr_text}" },
      ),
    );
  });

  it("uses reviewed plural grammar for zero, one, and two and localizes file sizes", async () => {
    for (const [language, expected] of [
      ["en", ["0 results found", "1 result found", "2 results found"]],
      [
        "de",
        [
          "0 Ergebnisse gefunden",
          "1 Ergebnis gefunden",
          "2 Ergebnisse gefunden",
        ],
      ],
    ] as const) {
      await i18n.changeLanguage(language);
      for (const count of [0, 1, 2])
        expect(i18n.t("common:features.search.resultFound", { count })).toBe(
          expected[count],
        );
    }
    expect(formatFileSize(1536, "de-DE")).toBe("1,5 KB");
    expect(formatFileSize(1536, "en-GB")).toBe("1.5 KB");
  });
});
