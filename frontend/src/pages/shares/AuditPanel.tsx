import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useUiFormat } from "@/lib/formatting";
import { Activity, Loader2, ScrollText } from "lucide-react";
import type { AuditEvent } from "./types";

export default function AuditPanel({
  loading,
  events,
}: {
  loading: boolean;
  events: AuditEvent[];
}) {
  const { t: tx } = useFeatureTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  const { formatDateTime: formatLocal } = useUiFormat();
  if (loading) {
    return (
      <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />{" "}
        {tx("share:features.auditPanel.loadingAuditLog")}{" "}
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        {tx("share:features.auditPanel.noEventsRecordedYet")}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground mb-2">
        <ScrollText className="h-3 w-3" />{" "}
        {tx("share:features.auditPanel.auditLog")}
        {events.length})
      </div>
      <div className="rounded-md border bg-card overflow-hidden">
        {/* md+ keeps the 5-column table; below md each event stacks into
            a two-line row that wraps instead of overflowing the card. */}
        <table className="hidden w-full text-xs md:table">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-2 py-1">
                {tx("share:features.auditPanel.when")}
              </th>
              <th className="text-left px-2 py-1">
                {tx("share:features.auditPanel.action")}
              </th>
              <th className="text-left px-2 py-1">
                {tx("share:features.auditPanel.doc")}
              </th>
              <th className="text-left px-2 py-1">
                {tx("share:features.auditPanel.ip")}
              </th>
              <th className="text-left px-2 py-1">
                {tx("share:features.auditPanel.userAgent")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                  {formatLocal(e.created_at)}
                </td>
                <td className="px-2 py-1">
                  <ActionLabel action={e.action} />
                </td>
                <td className="px-2 py-1 text-muted-foreground">
                  {e.document_id ?? ""}
                </td>
                <td className="px-2 py-1 font-mono text-muted-foreground">
                  {e.client_ip || ""}
                </td>
                <td className="px-2 py-1 text-muted-foreground truncate max-w-[260px]">
                  {e.user_agent || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y text-xs md:hidden">
          {events.map((e) => (
            <li key={e.id} className="space-y-0.5 px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <ActionLabel action={e.action} />
                {e.document_id != null && (
                  <span className="text-muted-foreground">
                    {tx("share:features.auditPanel.doc2", {
                      value0: e.document_id,
                    })}
                  </span>
                )}
                <span className="ml-auto whitespace-nowrap text-muted-foreground">
                  {formatLocal(e.created_at)}
                </span>
              </div>
              {(e.client_ip || e.user_agent) && (
                <div className="truncate text-muted-foreground">
                  {e.client_ip && (
                    <span className="font-mono">{e.client_ip}</span>
                  )}
                  {e.client_ip && e.user_agent ? " · " : ""}
                  {e.user_agent || ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ActionLabel({ action }: { action: string }) {
  const { t: tx } = useFeatureTranslation(["common", "share"]);
  const map: Record<string, string> = {
    otp_request: tx("share:features.extra.auditActions.requestOtp"),
    otp_email_sent: tx("share:features.extra.auditActions.emailOtp"),
    otp_email_failed: tx("share:features.extra.auditActions.emailFailed"),
    otp_email_rate_limited: tx(
      "share:features.extra.auditActions.emailLimited",
    ),
    otp_verify_ok: tx("share:features.extra.auditActions.verifyOtp"),
    otp_verify_fail: tx("share:features.extra.auditActions.verifyFailed"),
    "share.locked": tx("share:features.extra.auditActions.shareLocked"),
    view_doc: tx("share:features.extra.auditActions.viewDocument"),
    view_file: tx("share:features.extra.auditActions.viewFile"),
    translate: tx("share:features.extra.auditActions.translate"),
    logout: tx("share:features.extra.auditActions.logout"),
    session_expired: tx("share:features.extra.auditActions.sessionExpired"),
  };
  const tone =
    action === "otp_verify_fail" ||
    action === "otp_email_failed" ||
    action === "share.locked"
      ? "text-destructive"
      : action === "otp_email_sent"
        ? "text-info"
        : action === "otp_email_rate_limited"
          ? "text-warning"
          : action === "view_file" || action === "view_doc"
            ? "text-success"
            : action === "translate"
              ? "text-info"
              : "text-foreground";
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <Activity className="h-3 w-3" /> {map[action] || action}
    </span>
  );
}
