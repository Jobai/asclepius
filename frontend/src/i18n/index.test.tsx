import { render, screen, act } from "@testing-library/react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createUiI18n } from "./index";

describe("bundled UI translations", () => {
  it("initializes synchronously without API calls or browser detection", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const instance = createUiI18n();
      expect(instance.isInitialized).toBe(true);
      expect(instance.resolvedLanguage).toBe("en");
      expect(instance.t("actions.save")).toBe("Save");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("supports namespace keys, interpolation and plural counts", () => {
    const instance = createUiI18n("de");
    expect(instance.t("errors:required", { field: "Name" })).toBe("Bitte geben Sie Name ein.");
    for (const count of [0, 1, 2]) {
      expect(instance.t("documents:selected", { count })).toBe(
        `${count} ${count === 1 ? "Dokument" : "Dokumente"} ausgewählt`,
      );
    }
  });

  it("falls back to English when a German key is missing", () => {
    const instance = createUiI18n("de");
    // Clone via remove/add so the shared bundled resources remain unchanged.
    const german = { ...instance.getResourceBundle("de", "common") };
    const withoutLoading = { ...german };
    delete withoutLoading.loading;
    instance.removeResourceBundle("de", "common");
    instance.addResourceBundle("de", "common", withoutLoading);
    expect(instance.t("loading")).toBe("Loading…");
  });

  it("updates subscribed React components without remounting their state", async () => {
    const instance = createUiI18n();
    function Example() {
      const { t } = useTranslation();
      return <label>{t("actions.save")}<input aria-label="draft" defaultValue="Unsaved draft" /></label>;
    }
    render(<I18nextProvider i18n={instance}><Example /></I18nextProvider>);
    const input = screen.getByRole("textbox");
    expect(screen.getByText("Save")).toBeInTheDocument();
    await act(() => instance.changeLanguage("de"));
    expect(screen.getByText("Speichern")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveValue("Unsaved draft");
  });

  it("checks translation keys during the TypeScript build", () => {
    const instance = createUiI18n();
    // @ts-expect-error Unknown key must remain a compile-time error.
    instance.t("actions.nonexistent");
    // @ts-expect-error Unknown namespace must remain a compile-time error.
    instance.t("missing:title");
    expect(instance.t("auth:signIn")).toBe("Sign in");
  });
});
