import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n";
import { message, useMessage } from "@/i18n/messages";
import { BUDGET_ERROR_CODE } from "@/api/fourxxBudget";
import { getErrorDetails, getErrorMessage } from "./errors";

const reply = (
  code?: unknown,
  params?: unknown,
  detail: unknown = "Untranslated diagnostic",
  status = 400,
) => ({ response: { status, data: { code, params, detail } } });

describe("localizable errors", () => {
  it("keeps an existing error reactive without recomputing it or exposing diagnostics", async () => {
    const error = reply("invalid_credentials");
    const descriptor = getErrorMessage(error);
    const { result } = renderHook(() => useMessage()(descriptor));
    expect(result.current).toBe("Invalid username or password.");
    await act(() => i18n.changeLanguage("de"));
    expect(result.current).toBe("Benutzername oder Passwort ist ungültig.");
    expect(getErrorDetails(error)).toBe("Untranslated diagnostic");
  });

  it("has a translated descriptor for every published backend code", () => {
    const { result } = renderHook(() => useMessage());
    const schema = i18n.getResourceBundle("en", "errors").codes;
    const codes = Object.keys(schema).filter((key) => key !== "upload_limit");
    for (const code of [...codes, "validation_error"]) {
      const value = result.current(getErrorMessage(reply(code)));
      expect(value).not.toContain("errors:");
      expect(value).not.toContain("Untranslated diagnostic");
      expect(value).not.toContain("{{");
    }
  });

  it("uses safe numeric parameters and rejects arbitrary server interpolation", async () => {
    await i18n.changeLanguage("de");
    const { result } = renderHook(() => useMessage());
    expect(
      result.current(
        getErrorMessage(reply("upload_too_large", { max_bytes: 12345 })),
      ),
    ).toContain("12.345");
    expect(
      result.current(
        getErrorMessage(reply("rate_limited_retry", { retry_after: 30 })),
      ),
    ).toContain("30 Sekunden");
    for (const unsafe of [
      "<script>secret</script>",
      -1,
      NaN,
      Infinity,
      {},
      true,
    ]) {
      const text = result.current(
        getErrorMessage(reply("rate_limited_retry", { retry_after: unsafe })),
      );
      expect(text).toBe(
        "Zu viele Anfragen. Bitte warten Sie und versuchen Sie es erneut.",
      );
    }
  });

  it("translates typed validation arrays and field labels rather than backend msg/input", async () => {
    const descriptor = getErrorMessage(
      reply(
        "validation_error",
        undefined,
        [
          {
            type: "missing",
            loc: ["body", "username"],
            msg: "English secret",
            input: "private",
          },
          {
            type: "string_too_short",
            loc: ["body", "password"],
            ctx: { min_length: 8 },
          },
          { type: "int_parsing", loc: ["query", "patient_id"] },
        ],
        422,
      ),
    );
    const { result } = renderHook(() => useMessage()(descriptor));
    expect(result.current).toContain("Username");
    await act(() => i18n.changeLanguage("de"));
    expect(result.current).toBe(
      "Benutzername ist erforderlich.; Passwort muss mindestens 8 Zeichen enthalten.; Bitte geben Sie für Patient eine gültige Zahl ein.",
    );
    expect(result.current).not.toMatch(/English secret|private/);
  });

  it("handles legacy and malformed validation arrays with safe fallbacks", () => {
    const { result } = renderHook(() => useMessage());
    const error = reply(
      undefined,
      undefined,
      [
        { type: "missing", loc: ["body", "private-field-name"] },
        { type: "future_type", msg: "SECRET" },
        null,
      ],
      422,
    );
    expect(result.current(getErrorMessage(error))).toContain("This field");
    expect(result.current(getErrorMessage(error))).not.toMatch(
      /SECRET|private-field-name/,
    );
    expect(
      result.current(getErrorMessage(reply(undefined, undefined, [], 422))),
    ).toBe(i18n.t("errors:validation.invalid"));
  });

  it.each([
    [BUDGET_ERROR_CODE, "errors:local.budget"],
    ["ERR_SHARE_SESSION_ENDED", "errors:codes.share_session_ended"],
    ["ERR_AUTH_REDIRECT", "errors:codes.session_expired"],
    ["ECONNABORTED", "errors:local.timeout"],
    ["ETIMEDOUT", "errors:local.timeout"],
    ["ERR_NETWORK", "errors:local.network"],
  ] as const)(
    "maps local error %s without raw English matching",
    (code, key) => {
      expect(getErrorMessage({ code, message: "private diagnostics" })).toEqual(
        message(key),
      );
    },
  );

  it("distinguishes a failed transport from cancellation and uses contextual unknown fallbacks", () => {
    const fallback = message("feedback.failedToSave");
    expect(getErrorMessage({ request: {} }, fallback)).toEqual(
      message("errors:local.network"),
    );
    expect(
      getErrorMessage({ request: {}, code: "ERR_CANCELED" }, fallback),
    ).toBe(fallback);
    expect(
      getErrorMessage(reply("future_code", {}, "private text", 500), fallback),
    ).toBe(fallback);
    expect(getErrorMessage(new Error("private text"), fallback)).toBe(fallback);
    expect(getErrorMessage(reply("toString"), fallback)).toBe(fallback);
  });

  it("supports legacy HTTP statuses and safe Retry-After without changing retry behavior", () => {
    expect(
      getErrorMessage(reply(undefined, undefined, "English", 403)),
    ).toEqual(message("errors:codes.forbidden"));
    expect(
      getErrorMessage({
        response: { status: 429, headers: { "retry-after": "17" } },
      }),
    ).toEqual(message("errors:codes.rate_limited_retry", { retry_after: 17 }));
    expect(
      getErrorMessage({
        response: { status: 429, headers: { "retry-after": "private" } },
      }),
    ).toEqual(message("errors:codes.rate_limited"));
  });
});
