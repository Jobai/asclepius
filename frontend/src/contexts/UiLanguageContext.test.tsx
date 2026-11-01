import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UiLanguagePreference } from "@/i18n/types";
import { UiLanguageProvider } from "./UiLanguageContext";
import AccountLanguageBridge from "@/components/AccountLanguageBridge";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SettingsPage from "@/pages/SettingsPage";

const auth = vi.hoisted(() => ({
  user: null as null | {
    id: number;
    role: string;
    ui_language: UiLanguagePreference | null;
  },
  recordUiLanguage: vi.fn(),
}));
const patch = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/api/client", () => ({ default: { patch } }));

function Content() {
  const location = useLocation();
  return (
    <>
      <LanguageSwitcher />
      <input aria-label="Unsaved form" defaultValue="draft" />
      <span>
        {location.pathname}
        {location.search}
      </span>
      <Link to="/share/abc">Shared page</Link>
      <Link to="/documents?filter=done">Core page</Link>
    </>
  );
}
function Surface({ settings = false }: { settings?: boolean }) {
  const { pathname } = useLocation();
  if (pathname.startsWith("/share")) return <Content />;
  return (
    <AccountLanguageBridge>
      {settings ? <SettingsPage /> : <Content />}
    </AccountLanguageBridge>
  );
}
function tree(path = "/documents?filter=done", settings = false) {
  return (
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <UiLanguageProvider>
          <Surface settings={settings} />
        </UiLanguageProvider>
      </MemoryRouter>
    </StrictMode>
  );
}
const choose = (value: string) =>
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });

beforeEach(() => {
  auth.user = null;
  auth.recordUiLanguage.mockReset().mockImplementation((id, language) => {
    if (auth.user && auth.user.id === id)
      auth.user = { ...auth.user, ui_language: language };
  });
  localStorage.clear();
  patch.mockReset().mockResolvedValue({ data: {} });
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UI language integration", () => {
  it("switches guests immediately, preserves form/URL, and survives remount", () => {
    const first = render(tree("/login"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "unsaved" },
    });
    const input = screen.getByRole("textbox");
    choose("de");
    expect(document.documentElement.lang).toBe("de");
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveValue("unsaved");
    expect(screen.getByText("/login")).toBeInTheDocument();
    expect(localStorage.getItem("asclepius:ui-language:core")).toBe("de");
    expect(patch).not.toHaveBeenCalled();
    first.unmount();
    render(tree("/login"));
    expect(screen.getByRole("combobox")).toHaveValue("de");
  });

  it("uses auto detection in browser order and follows languagechange only in auto", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([
      "fr",
      "de-CH",
      "en",
    ]);
    render(tree());
    expect(document.documentElement.lang).toBe("de");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en"]);
    act(() => window.dispatchEvent(new Event("languagechange")));
    expect(document.documentElement.lang).toBe("en");
    choose("de");
    act(() => window.dispatchEvent(new Event("languagechange")));
    expect(document.documentElement.lang).toBe("de");
  });

  it("applies saved account preferences before revealing content, with no login write", () => {
    localStorage.setItem("asclepius:ui-language:core", "en");
    auth.user = { id: 1, role: "viewer", ui_language: "de" };
    render(tree());
    expect(screen.getByRole("combobox")).toHaveValue("de");
    expect(document.documentElement.lang).toBe("de");
    expect(patch).not.toHaveBeenCalled();
  });

  it("treats account auto as explicit and does not backfill an unset account", () => {
    localStorage.setItem("asclepius:ui-language:core", "de");
    auth.user = { id: 1, role: "viewer", ui_language: "auto" };
    const view = render(tree());
    expect(screen.getByRole("combobox")).toHaveValue("auto");
    expect(document.documentElement.lang).toBe("en");
    auth.user = { id: 2, role: "editor", ui_language: null };
    view.rerender(tree());
    expect(screen.getByRole("combobox")).toHaveValue("de");
    expect(patch).not.toHaveBeenCalled();
  });

  it("saves a signed-in selection without overwriting the guest preference on logout", async () => {
    localStorage.setItem("asclepius:ui-language:core", "en");
    auth.user = { id: 1, role: "admin", ui_language: null };
    const view = render(tree());
    choose("de");
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/auth/me/preferences",
        { ui_language: "de" },
        { signal: expect.any(AbortSignal) },
      ),
    );
    auth.user = null;
    view.rerender(tree());
    expect(screen.getByRole("combobox")).toHaveValue("en");
    expect(localStorage.getItem("asclepius:ui-language:core")).toBe("en");
  });

  it("keeps failed saves applied and reports them in the chosen language", async () => {
    auth.user = { id: 1, role: "viewer", ui_language: "en" };
    patch.mockRejectedValue(new Error("offline"));
    render(tree());
    choose("de");
    expect(
      await screen.findByText(/konnte nicht gespeichert werden/),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("de");
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("keeps share storage independent and never saves a share choice to an account", () => {
    auth.user = { id: 1, role: "admin", ui_language: "de" };
    render(tree());
    fireEvent.click(screen.getByText("Shared page"));
    expect(screen.getByRole("combobox")).toHaveValue("auto");
    choose("en");
    expect(localStorage.getItem("asclepius:ui-language:share")).toBe("en");
    fireEvent.click(screen.getByText("Core page"));
    expect(screen.getByRole("combobox")).toHaveValue("de");
    expect(patch).not.toHaveBeenCalled();
  });

  it("remembers a successfully saved selection when returning from a share route", async () => {
    auth.user = { id: 1, role: "viewer", ui_language: "en" };
    render(tree());
    choose("de");
    await waitFor(() =>
      expect(auth.recordUiLanguage).toHaveBeenCalledWith(1, "de"),
    );
    fireEvent.click(screen.getByText("Shared page"));
    fireEvent.click(screen.getByText("Core page"));
    expect(screen.getByRole("combobox")).toHaveValue("de");
  });

  it("discards in-flight and queued saves on account change", async () => {
    let finish!: () => void;
    patch.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    auth.user = { id: 1, role: "viewer", ui_language: "en" };
    const view = render(tree());
    choose("de");
    choose("auto");
    auth.user = { id: 2, role: "editor", ui_language: "en" };
    view.rerender(tree());
    await act(async () => finish());
    expect(screen.getByRole("combobox")).toHaveValue("en");
    expect(patch).toHaveBeenCalledTimes(1);
    expect(auth.recordUiLanguage).not.toHaveBeenCalled();
  });

  it("does not crash when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(tree());
    choose("de");
    expect(document.documentElement.lang).toBe("de");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "konnte nicht gespeichert werden",
    );
  });

  it.each(["viewer", "editor", "admin"])(
    "makes appearance accessible to %s on mobile",
    async (role) => {
      auth.user = { id: 1, role, ui_language: "en" };
      render(tree("/settings/appearance", true));
      expect(
        screen.getByRole("heading", { name: "Appearance", level: 1 }),
      ).toBeInTheDocument();
      choose("de");
      expect(
        screen.getByRole("heading", { name: "Darstellung", level: 1 }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(auth.recordUiLanguage).toHaveBeenCalledWith(1, "de"),
      );
    },
  );

  it.each(["viewer", "editor", "admin"])(
    "makes appearance accessible to %s on desktop",
    (role) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query) => ({
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
      auth.user = { id: 1, role, ui_language: "en" };
      render(tree("/settings/appearance", true));
      expect(
        screen.getByRole("tab", { name: "Appearance" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
      if (role === "admin")
        expect(
          screen.getByRole("tab", { name: "Document translation" }),
        ).toBeInTheDocument();
      else
        expect(
          screen.queryByRole("tab", { name: "Document translation" }),
        ).not.toBeInTheDocument();
    },
  );
});
