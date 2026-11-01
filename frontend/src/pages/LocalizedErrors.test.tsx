import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/api/client";
import shareApi from "@/api/shareClient";
import LoginPage from "./LoginPage";
import ShareVerifyPage from "./share/ShareVerifyPage";
import FileUpload from "@/components/FileUpload";

vi.mock("@/components/LanguageSwitcher", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/contexts/PatientContext", () => ({
  usePatient: () => ({ selectedPatient: { id: 7, display_name: "Patient" } }),
}));
vi.mock("@/hooks/data", () => ({
  usePatients: () => ({ data: [] }),
  useEvents: () => ({ data: [] }),
}));
vi.mock("@/api/client", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/api/shareClient", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

describe("error presentation at API consumers", () => {
  it("updates a login error in place without submitting again or losing edits", async () => {
    const login = vi
      .fn()
      .mockRejectedValue({
        response: {
          status: 401,
          data: { code: "invalid_credentials", detail: "private diagnostic" },
        },
      });
    vi.mocked(useAuth).mockReturnValue({
      login,
      user: null,
      needsSetup: false,
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(api.get).mockResolvedValue({ data: { enabled: false } });
    const { container } = render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    const username = container.querySelector('input[autocomplete="username"]')!;
    fireEvent.change(username, { target: { value: "alice" } });
    fireEvent.change(container.querySelector('input[type="password"]')!, {
      target: { value: "original-password" },
    });
    fireEvent.submit(container.querySelector("form")!);
    expect(
      await screen.findByText("Invalid username or password."),
    ).toBeInTheDocument();
    await act(() => i18n.changeLanguage("de"));
    expect(
      screen.getByText("Benutzername oder Passwort ist ungültig."),
    ).toBeInTheDocument();
    expect(username).toHaveValue("alice");
    expect(login).toHaveBeenCalledExactlyOnceWith("alice", "original-password");
    expect(screen.queryByText("private diagnostic")).toBeNull();
  });

  it("displays the coded OTP failure in German without retrying", async () => {
    await i18n.changeLanguage("de");
    vi.mocked(shareApi.get).mockResolvedValue({ data: { delivery: "manual" } });
    const post = vi
      .mocked(shareApi.post)
      .mockRejectedValue({
        response: {
          status: 422,
          data: { code: "share_code_invalid", detail: "English OTP detail" },
        },
      });
    const { container } = render(
      <MemoryRouter initialEntries={["/share/token/verify"]}>
        <Routes>
          <Route path="/share/:token/verify" element={<ShareVerifyPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "123456" },
    });
    fireEvent.submit(container.querySelector("form")!);
    expect(
      await screen.findByText(/Der Zugangscode ist ungültig oder abgelaufen/),
    ).toBeInTheDocument();
    expect(post).toHaveBeenCalledExactlyOnceWith("/token/verify-otp", {
      code: "123456",
    });
    expect(screen.queryByText("English OTP detail")).toBeNull();
  });

  it("keeps upload failures reactive and preserves the filename", async () => {
    const post = vi
      .mocked(api.post)
      .mockRejectedValue({
        response: {
          status: 415,
          data: {
            code: "unsupported_file_type",
            detail: "internal MIME diagnostic",
          },
        },
      });
    const done = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <FileUpload onUploadComplete={done} />
      </MemoryRouter>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["data"], "report.pdf", { type: "application/pdf" })],
      },
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("0 uploaded, 1 failed."),
    ).toBeInTheDocument();
    // Failure details are collapsed until requested by the user.
    fireEvent.click(screen.getByText(/Show details/));
    expect(
      await screen.findByText("This file type is not supported."),
    ).toBeInTheDocument();
    await act(() => i18n.changeLanguage("de"));
    expect(
      screen.getByText("Dieses Dateiformat wird nicht unterstützt."),
    ).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("internal MIME diagnostic")).toBeNull();
  });
});
