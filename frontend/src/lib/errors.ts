import {
  message,
  type UiMessage,
  type TranslatedMessage,
} from "@/i18n/messages";
import { BUDGET_ERROR_CODE } from "@/api/fourxxBudget";
import type { components } from "@/api/schema";

type ApiErrorCode = components["schemas"]["ErrorCode"];
type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord =>
  value !== null && typeof value === "object" ? (value as UnknownRecord) : {};
const owns = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

const codeMessages = {
  invalid_credentials: "errors:codes.invalid_credentials",
  authentication_required: "errors:codes.authentication_required",
  session_expired: "errors:codes.session_expired",
  forbidden: "errors:codes.forbidden",
  not_found: "errors:codes.not_found",
  conflict: "errors:codes.conflict",
  invalid_request: "errors:codes.invalid_request",
  validation_error: "errors:validation.invalid",
  upload_too_large: "errors:codes.upload_too_large",
  unsupported_file_type: "errors:codes.unsupported_file_type",
  invalid_archive: "errors:codes.invalid_archive",
  unsafe_filename: "errors:codes.unsafe_filename",
  rate_limited: "errors:codes.rate_limited",
  rate_limited_retry: "errors:codes.rate_limited",
  share_expired: "errors:codes.share_expired",
  share_code_invalid: "errors:codes.share_code_invalid",
  share_queue_expired: "errors:codes.share_queue_expired",
  share_session_ended: "errors:codes.share_session_ended",
  service_unavailable: "errors:codes.service_unavailable",
  otp_delivery_failed: "errors:codes.otp_delivery_failed",
  translation_unavailable: "errors:codes.translation_unavailable",
  language_not_allowed: "errors:codes.language_not_allowed",
  document_unavailable: "errors:codes.document_unavailable",
} as const satisfies Record<ApiErrorCode, TranslatedMessage["key"]>;

const fieldMessages = {
  username: "errors:fields.username",
  password: "errors:fields.password",
  code: "errors:fields.code",
  ui_language: "errors:fields.ui_language",
  display_name: "errors:fields.display_name",
  patient_id: "errors:fields.patient_id",
  filename: "errors:fields.filename",
  file: "errors:fields.file",
  target_language: "errors:fields.target_language",
} as const;

const nonnegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function validationMessage(item: unknown): UiMessage {
  const error = record(item);
  const loc = Array.isArray(error.loc) ? error.loc : [];
  const fieldName = loc.filter((part) => typeof part === "string").slice(-1)[0];
  const field = message(
    fieldName && owns(fieldMessages, fieldName)
      ? fieldMessages[fieldName as keyof typeof fieldMessages]
      : "errors:fields.value",
  );
  const ctx = record(error.ctx);
  switch (error.type) {
    case "missing":
      return message("errors:validation.required", { field });
    case "int_parsing":
    case "int_type":
    case "float_parsing":
    case "float_type":
      return message("errors:validation.number", { field });
    case "string_too_short":
      if (nonnegativeInteger(ctx.min_length))
        return message("errors:validation.tooShort", {
          field,
          limit: ctx.min_length,
        });
      break;
    case "string_too_long":
      if (nonnegativeInteger(ctx.max_length))
        return message("errors:validation.tooLong", {
          field,
          limit: ctx.max_length,
        });
      break;
    case "literal_error":
    case "enum":
    case "string_type":
    case "string_pattern_mismatch":
      return message("errors:validation.invalidField", { field });
    case "extra_forbidden":
      return message("errors:validation.extra");
    case "json_invalid":
      return message("errors:validation.json");
  }
  return message("errors:validation.invalid");
}

/** Store descriptors in UI state so errors remain reactive to language changes.
 * Neither raw server text nor a provider message is a translation lookup key.
 */
export function getErrorMessage(
  err: unknown,
  fallback: UiMessage = message("errors:unexpected"),
): UiMessage {
  const error = record(err);
  const response = record(error.response);
  const data = record(response.data);
  if (error.code === BUDGET_ERROR_CODE) return message("errors:local.budget");
  if (error.code === "ERR_SHARE_SESSION_ENDED")
    return message("errors:codes.share_session_ended");
  if (error.code === "ERR_AUTH_REDIRECT")
    return message("errors:codes.session_expired");
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
    return message("errors:local.timeout");
  if (
    error.code === "ERR_NETWORK" ||
    (!error.response && error.request && error.code !== "ERR_CANCELED")
  ) {
    return message("errors:local.network");
  }
  if (
    Array.isArray(data.detail) &&
    (response.status === 422 || data.code === "validation_error")
  ) {
    return data.detail.length
      ? { messages: data.detail.map(validationMessage) }
      : message("errors:validation.invalid");
  }
  if (typeof data.code === "string" && owns(codeMessages, data.code)) {
    const params = record(data.params);
    if (
      data.code === "rate_limited_retry" &&
      nonnegativeInteger(params.retry_after)
    ) {
      return message("errors:codes.rate_limited_retry", {
        retry_after: params.retry_after,
      });
    }
    if (
      data.code === "upload_too_large" &&
      nonnegativeInteger(params.max_bytes)
    ) {
      return message("errors:codes.upload_limit", {
        max_bytes: params.max_bytes,
      });
    }
    return message(codeMessages[data.code as ApiErrorCode]);
  }
  // Status-only compatibility for ordinary/older errors; never guess from detail text.
  switch (response.status) {
    case 401:
      return message("errors:codes.authentication_required");
    case 403:
      return message("errors:codes.forbidden");
    case 404:
      return message("errors:codes.not_found");
    case 413:
      return message("errors:codes.upload_too_large");
    case 415:
      return message("errors:codes.unsupported_file_type");
    case 422:
      return message("errors:validation.invalid");
    case 429: {
      const retry = record(response.headers)["retry-after"];
      const seconds =
        typeof retry === "string" && /^\d+$/.test(retry)
          ? Number(retry)
          : retry;
      return nonnegativeInteger(seconds)
        ? message("errors:codes.rate_limited_retry", { retry_after: seconds })
        : message("errors:codes.rate_limited");
    }
  }
  return fallback;
}

/** Explicit diagnostic access for existing technical-detail areas and batch reports. */
export function getErrorDetails(err: unknown, fallback = ""): string {
  const error = record(err);
  const detail = record(record(error.response).data).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((d) => (typeof d === "string" ? d : record(d).msg))
      .filter((m): m is string => typeof m === "string" && m.length > 0);
    if (messages.length) return messages.join("; ");
  }
  if (typeof record(detail).msg === "string")
    return record(detail).msg as string;
  return typeof error.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}
