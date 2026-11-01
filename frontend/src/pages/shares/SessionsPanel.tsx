import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useUiFormat } from "@/lib/formatting";
import { Activity, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { SessionsResponse } from "./types";

export default function SessionsPanel({
  loading,
  data,
  onRefresh,
  onRevokeSession,
  onDropQueue,
}: {
  loading: boolean;
  data: SessionsResponse | undefined;
  onRefresh: () => void;
  onRevokeSession: (rowid: number) => void;
  onDropQueue: (rowid: number) => void;
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
  const active = data?.active || [];
  const queued = data?.queued || [];
  const empty = !loading && active.length === 0 && queued.length === 0;
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground mb-2">
        <Activity className="h-3 w-3" />{" "}
        {tx("share:features.sessionsPanel.sessions")}{" "}
        <button
          onClick={onRefresh}
          className="rounded p-0.5 hover:bg-accent"
          title={tx("share:features.sessionsPanel.refreshSessions")}
          aria-label={tx("share:features.sessionsPanel.refreshSessions")}
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />{" "}
          {tx("common:ui.loading")}{" "}
        </div>
      ) : empty ? (
        <div className="text-xs text-muted-foreground italic">
          {tx("share:features.sessionsPanel.noActiveSessionAndNoWaiters")}
        </div>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <SessionsTable
              title={tx("share:features.sessionsPanel.active")}
              caption={tx(
                "share:features.sessionsPanel.atMostOneSlotPerShareIdleSessions",
              )}
              rows={active}
              actionLabel={tx("share:features.extra.revokeSession")}
              actionTitle={tx("share:features.extra.terminateSession")}
              onAction={onRevokeSession}
              renderStatus={(r) =>
                r.is_idle ? (
                  <span className="rounded bg-warning-soft px-1.5 py-0.5 text-warning">
                    {tx("share:features.sessionsPanel.idle")}
                  </span>
                ) : (
                  <span className="rounded bg-success-soft px-1.5 py-0.5 text-success">
                    {tx("share:features.sessionsPanel.live")}
                  </span>
                )
              }
            />
          )}
          {queued.length > 0 && (
            <SessionsTable
              title={tx("share:features.sessionsPanel.queued", {
                value0: queued.length,
              })}
              caption={tx(
                "share:features.sessionsPanel.waitersAreFirstComeFirstServedOnceThe",
              )}
              rows={queued}
              actionLabel={tx("share:features.extra.dropWaiter")}
              actionTitle={tx("share:features.extra.removeWaiter")}
              onAction={onDropQueue}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface SessionTableRow {
  rowid: number;
  expires_at: string;
  client_ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at?: string | null;
  is_idle?: boolean;
}

function SessionsTable<T extends SessionTableRow>({
  title,
  caption,
  rows,
  actionLabel,
  actionTitle,
  onAction,
  renderStatus,
}: {
  title: string;
  caption: string;
  rows: T[];
  actionLabel: string;
  actionTitle: string;
  onAction: (rowid: number) => void;
  renderStatus?: (r: T) => React.ReactNode;
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
  const actionButton = (rowid: number) => (
    <button
      onClick={() => onAction(rowid)}
      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-0.5 text-destructive hover:bg-destructive/10 coarse:min-h-11 coarse:px-3"
      title={actionTitle}
    >
      <Trash2 className="h-3 w-3" /> {actionLabel}
    </button>
  );
  const statusPill = (r: T) =>
    renderStatus ? (
      renderStatus(r)
    ) : (
      <span className="rounded bg-info-soft px-1.5 py-0.5 text-info">
        {tx("share:features.sessionsPanel.waiting")}
      </span>
    );
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="bg-muted/30 px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
        {title}
      </div>
      {/* md+ keeps the 6-column table; below md each session stacks into
          a two-line row so nothing pushes the card wider than the phone. */}
      <table className="hidden w-full text-xs md:table">
        <thead className="bg-muted/20 text-muted-foreground">
          <tr>
            <th className="text-left px-2 py-1 w-20">
              {tx("common:columns.status")}
            </th>
            <th className="text-left px-2 py-1">
              {tx("share:features.sessionsPanel.started")}
            </th>
            <th className="text-left px-2 py-1">
              {tx("share:features.sessionsPanel.lastSeen")}
            </th>
            <th className="text-left px-2 py-1">
              {tx("share:features.sessionsPanel.expires")}
            </th>
            <th className="text-left px-2 py-1">
              {tx("share:features.auditPanel.ip")}
            </th>
            <th className="text-left px-2 py-1">
              {tx("share:features.auditPanel.userAgent")}
            </th>
            <th className="text-right px-2 py-1 w-20"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.rowid}>
              <td className="px-2 py-1">{statusPill(r)}</td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {formatLocal(r.created_at)}
              </td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {r.last_seen_at ? formatLocal(r.last_seen_at) : "—"}
              </td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {formatLocal(r.expires_at)}
              </td>
              <td className="px-2 py-1 font-mono text-muted-foreground">
                {r.client_ip || ""}
              </td>
              <td className="px-2 py-1 text-muted-foreground truncate max-w-[260px]">
                {r.user_agent || ""}
              </td>
              <td className="px-2 py-1 text-right">{actionButton(r.rowid)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y text-xs md:hidden">
        {rows.map((r) => (
          <li key={r.rowid} className="space-y-1 px-2 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {statusPill(r)}
              {r.client_ip && (
                <span className="font-mono text-muted-foreground">
                  {r.client_ip}
                </span>
              )}
              <span className="ml-auto">{actionButton(r.rowid)}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
              <span>
                {tx("share:features.sessionsPanel.started2", {
                  value0: formatLocal(r.created_at),
                })}
              </span>
              <span>
                {tx("share:features.sessionsPanel.seen", {
                  value0: r.last_seen_at ? formatLocal(r.last_seen_at) : "—",
                })}
              </span>
              <span>
                {tx("share:features.sessionsPanel.expires2", {
                  value0: formatLocal(r.expires_at),
                })}
              </span>
            </div>
            {r.user_agent && (
              <div className="truncate text-muted-foreground">
                {r.user_agent}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="px-2 py-1 text-[11px] italic text-muted-foreground border-t">
        {caption}
      </p>
    </div>
  );
}
