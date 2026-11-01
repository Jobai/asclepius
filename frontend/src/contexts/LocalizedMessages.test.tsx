import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { message, useMessage } from "@/i18n/messages";
import { ConfirmProvider, useConfirm } from "./ConfirmContext";
import { ToastProvider, useToast } from "./ToastContext";
import { buildBulkConfirm } from "@/lib/confirmBulk";
import { EditableField } from "@/components/document-detail/helpers/EditableField";
import api from "@/api/client";

vi.mock("@/api/client", () => ({ default: { patch: vi.fn() } }));

describe("persistent translated messages", () => {
  it("updates an open confirmation without resolving or replacing its promise", async () => {
    const result = vi.fn();
    function Example() {
      const confirm = useConfirm();
      return (
        <button
          onClick={() => {
            void confirm({
              title: message("feedback.documentsDelete", { count: 2 }),
              description: message("messages.deleteDescription"),
              variant: "destructive",
            }).then(result);
          }}
        >
          Open
        </button>
      );
    }
    render(
      <ConfirmProvider>
        <Example />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByText("Open"));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByText("Delete 2 documents?")).toBeInTheDocument();
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByText("2 Dokumente löschen?")).toBeInTheDocument();
    expect(result).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(result).toHaveBeenCalledExactlyOnceWith(true));
  });
  it("updates active toast descriptors while preserving literal diagnostics and escaping values", async () => {
    function Example() {
      const { toast } = useToast();
      return (
        <button
          onClick={() =>
            toast({
              title: message("messages.deleteTitle", {
                name: "<b>report.pdf</b>",
              }),
              description: "Provider XYZ: unsupported_parameter",
            })
          }
        >
          Notify
        </button>
      );
    }
    const { container } = render(
      <ToastProvider>
        <Example />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("Notify"));
    await act(() => i18n.changeLanguage("de"));
    expect(
      await screen.findByText("<b>report.pdf</b> löschen?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Provider XYZ: unsupported_parameter"),
    ).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Schließen" }),
    ).toBeInTheDocument();
  });
  it("keeps bulk action grammar and error descriptors reactive", async () => {
    function Example() {
      const renderMessage = useMessage();
      return (
        <p>
          {renderMessage(
            buildBulkConfirm({
              count: 12,
              action: "merge",
              targetLabel: "Vitamin D",
              description: "literal",
            }).title,
          )}
        </p>
      );
    }
    render(<Example />);
    expect(
      screen.getByText('Merge 12 entries into "Vitamin D"?'),
    ).toBeInTheDocument();
    await act(() => i18n.changeLanguage("de"));
    expect(
      screen.getByText("12 Einträge mit „Vitamin D“ zusammenführen?"),
    ).toBeInTheDocument();
  });

  it("preserves a raw clinical edit and its save payload across language changes", async () => {
    const patch = vi.mocked(api.patch).mockResolvedValue({ data: { id: 7 } });
    render(
      <ToastProvider>
        <EditableField
          label="Result"
          value="0.1000"
          field="result"
          docId={7}
          onSave={vi.fn()}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("0.1000"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "<0.1000" } });
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveValue("<0.1000");
    expect(patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/documents/7", { result: "<0.1000" }),
    );
  });

  it("translates nested action descriptors inside persistent progress messages", async () => {
    function Example() {
      const renderMessage = useMessage();
      return (
        <p>
          {renderMessage(
            message("feedback.done", {
              value0: message("actions.delete"),
              value1: 2,
              value2: 2,
            }),
          )}
        </p>
      );
    }
    render(<Example />);
    expect(screen.getByText("Delete: 2/2 done")).toBeInTheDocument();
    await act(() => i18n.changeLanguage("de"));
    expect(screen.getByText("Löschen: 2/2 abgeschlossen")).toBeInTheDocument();
  });
});
