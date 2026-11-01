import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import api from "@/api/client";
import MatchingLanguagesSettings from "./MatchingLanguagesSettings";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
vi.mock("@/hooks/data", () => ({
  useSettings: Object.assign(vi.fn(), { updateCached: vi.fn() }),
}));

const policy = {
  matching_languages: ["en", "de"],
  include_unlabeled_aliases: true,
  available_languages: ["de", "en", "es", "fr", "it", "nl"],
  unlabeled_alias_count: 12,
  can_edit: true,
};

describe("matching-language settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: structuredClone(policy) });
    vi.mocked(api.patch).mockResolvedValue({ data: { status: "saved" } });
  });

  it("loads the selection and saves Dutch without changing the synonym lists", async () => {
    render(<MatchingLanguagesSettings />);
    const dutch = await screen.findByRole("checkbox", { name: "Dutch" });
    expect(screen.getByRole("checkbox", { name: "German" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "English" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "French" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Also use synonyms without a language",
      }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(dutch);
    await act(() => i18n.changeLanguage("de"));
    expect(
      screen.getByRole("checkbox", { name: "Niederländisch" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Französisch" }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/settings", {
        normalization_matching_languages: ["de", "en", "nl"],
        normalization_include_unlabeled_aliases: true,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Abgleichsprachen gespeichert.",
    );
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("checkbox", { name: "Französisch" }),
    ).toBeInTheDocument();
  });

  it("can disable untagged synonyms and keeps at least one matching language", async () => {
    render(<MatchingLanguagesSettings />);
    await screen.findByRole("checkbox", { name: "German" });
    fireEvent.click(screen.getByRole("checkbox", { name: "German" }));
    expect(screen.getByRole("checkbox", { name: "English" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Also use synonyms without a language",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/settings", {
        normalization_matching_languages: ["en"],
        normalization_include_unlabeled_aliases: false,
      }),
    );
  });

  it("shows the policy read-only to non-admin users", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { ...policy, can_edit: false },
    });
    render(<MatchingLanguagesSettings />);
    expect(
      await screen.findByRole("checkbox", { name: "German" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Only administrators can change this setting."),
    ).toBeInTheDocument();
  });

  it("retains the edited selection and shows save errors without retrying", async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error("Offline"));
    render(<MatchingLanguagesSettings />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Dutch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Dutch" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(api.patch).toHaveBeenCalledTimes(1);
  });
});
