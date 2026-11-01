import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";
import { getErrorDetails } from "./errors";

/**
 * Build a minimal AxiosError-shaped object whose `response.data.detail`
 * equals `detail`. getErrorDetails only reads `response.data.detail`, so a
 * plain object cast is enough to exercise every branch without a real HTTP
 * round-trip.
 */
function axiosLike(detail: unknown): AxiosError<{ detail?: unknown }> {
  return {
    response: { data: { detail } },
  } as AxiosError<{ detail?: unknown }>;
}

describe("getErrorDetails", () => {
  it("returns a string `detail` verbatim (our HTTPException convention)", () => {
    expect(getErrorDetails(axiosLike("Patient not found"))).toBe(
      "Patient not found",
    );
  });

  it("ignores a whitespace-only string detail and falls through", () => {
    expect(getErrorDetails(axiosLike("   "), "fallback")).toBe("fallback");
  });

  it("joins an array detail of {msg} objects with '; ' (FastAPI 422 shape)", () => {
    const detail = [
      { msg: "field required" },
      { msg: "value is not a valid email" },
    ];
    expect(getErrorDetails(axiosLike(detail))).toBe(
      "field required; value is not a valid email",
    );
  });

  it("handles a mixed array of strings and {msg} objects, dropping empties", () => {
    const detail = [
      "plain string",
      { msg: "from object" },
      { notMsg: "x" },
      {},
    ];
    expect(getErrorDetails(axiosLike(detail))).toBe(
      "plain string; from object",
    );
  });

  it("reads `msg` from a single object detail", () => {
    expect(getErrorDetails(axiosLike({ msg: "single object message" }))).toBe(
      "single object message",
    );
  });

  it("falls back to Error.message when there is no axios detail", () => {
    expect(getErrorDetails(new Error("network down"))).toBe("network down");
  });

  it("returns the provided fallback for unknown / empty values", () => {
    expect(getErrorDetails(undefined)).toBe("");
    expect(getErrorDetails(null, "custom fallback")).toBe("custom fallback");
    expect(getErrorDetails(42, "custom fallback")).toBe("custom fallback");
  });
});
