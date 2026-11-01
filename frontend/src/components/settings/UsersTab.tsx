import { enumLabel } from "@/lib/labels";
import { Trans as FeatureTrans } from "react-i18next";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message, type UiMessage } from "@/i18n/messages";
import { useEffect, useMemo, useState } from "react";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { useConfirm } from "@/contexts/ConfirmContext";
import { useToast } from "@/contexts/ToastContext";
import { Plus, Trash2, ScrollText, UserCog, Check } from "lucide-react";
import { usePatients } from "@/hooks/data";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";

interface Patient {
  id: number;
  display_name: string;
  slug?: string;
}

interface Grant {
  id: number;
  display_name: string;
  role: string;
}

export default function UsersTab() {
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
  const confirm = useConfirm();
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    display_name: "",
    role: "editor",
  });
  const { data: patientsData } = usePatients();
  const patients: Patient[] = Array.isArray(patientsData)
    ? (patientsData as Patient[])
    : [];
  // Map of user_id → their current access grants. Loaded in parallel on mount.
  const [grants, setGrants] = useState<Record<number, Grant[]>>({});
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [auditTotal, setAuditTotal] = useState(0);
  // User id whose access modal is currently open, null otherwise.
  const [accessForUser, setAccessForUser] = useState<number | null>(null);
  // Set when /settings/users returns 403 so we can render an explainer
  // instead of an empty table. SettingsPage already hides this whole tab
  // from non-admins; this is defence-in-depth for direct URL access.
  const [forbidden, setForbidden] = useState(false);

  const loadUsers = async () => {
    try {
      const res = await api.get("/settings/users");
      const list: any[] = res.data || [];
      setUsers(list);
      // Fetch every user's grants in parallel so the row chips and the modal
      // open without additional round-trips.
      const entries = await Promise.all(
        list.map(async (u) => {
          try {
            const r = await api.get(`/settings/users/${u.id}/access`);
            return [u.id, (r.data || []) as Grant[]] as const;
          } catch {
            return [u.id, [] as Grant[]] as const;
          }
        }),
      );
      setGrants(Object.fromEntries(entries));
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setForbidden(true);
      }
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  if (forbidden) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">
          {tx("settings:features.usersTab.adminAccessRequired")}
        </p>
        <p>
          {tx(
            "settings:features.usersTab.onlyAdministratorsCanListAndManageUsersSign",
          )}
        </p>
      </div>
    );
  }

  const loadAuditLog = async () => {
    try {
      const res = await api.get("/settings/audit-log", {
        params: { limit: 100 },
      });
      setAuditLog(res.data.items || []);
      setAuditTotal(res.data.total || 0);
    } catch {
      setAuditLog([]);
    }
  };

  const createUser = async () => {
    await api.post("/settings/users", newUser);
    setNewUser({
      username: "",
      password: "",
      display_name: "",
      role: "editor",
    });
    setShowCreate(false);
    await loadUsers();
  };

  const deleteUser = async (id: number) => {
    const ok = await confirm({
      title: message("feedback.deleteThisUser"),
      description: message(
        "feedback.theUserSLoginWillBeRemovedAndTheirPatient",
      ),
      variant: "destructive",
    });
    if (!ok) return;
    await api.delete(`/settings/users/${id}`);
    setUsers(users.filter((u) => u.id !== id));
    setGrants((g) => {
      const next = { ...g };
      delete next[id];
      return next;
    });
  };

  const updateRole = async (userId: number, role: string) => {
    await api.patch(`/settings/users/${userId}`, { role });
    setUsers(users.map((u) => (u.id === userId ? { ...u, role } : u)));
  };

  const roleBadgeVariant = (role: string): BadgeVariant => {
    switch (role) {
      case "admin":
        return "destructive";
      case "editor":
        return "info";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          {tx("settings:features.usersTab.userManagement")}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setShowAudit(!showAudit);
              if (!showAudit) loadAuditLog();
            }}
          >
            <ScrollText className="h-4 w-4" />
            {showAudit
              ? tx("settings:features.usersTab.hideAuditLog")
              : tx("settings:features.usersTab.auditLog")}
          </Button>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4" />{" "}
            {tx("settings:features.usersTab.addUser")}{" "}
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-lg border p-4 space-y-3 max-w-md">
          <Input
            type="text"
            placeholder={tx("errors:fields.username")}
            value={newUser.username}
            onChange={(e) =>
              setNewUser({ ...newUser, username: e.target.value })
            }
          />
          <Input
            type="password"
            placeholder={tx("errors:fields.password")}
            value={newUser.password}
            onChange={(e) =>
              setNewUser({ ...newUser, password: e.target.value })
            }
          />
          <Input
            type="text"
            placeholder={tx("settings:features.normalizationRow.displayName")}
            value={newUser.display_name}
            onChange={(e) =>
              setNewUser({ ...newUser, display_name: e.target.value })
            }
          />
          <Select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
          >
            <option value="admin">
              {tx("settings:features.usersTab.admin")}
            </option>
            <option value="editor">
              {tx("settings:features.usersTab.editor")}
            </option>
            <option value="viewer">
              {tx("settings:features.usersTab.viewer")}
            </option>
          </Select>
          <Button onClick={createUser}>
            {tx("settings:features.usersTab.create")}
          </Button>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <FeatureTrans
            ns="settings"
            i18nKey="features.usersTab.part0AdminPart0FullAccessSettingsUserManagement"
            components={{ part0: <strong /> }}
            values={{}}
          />
        </p>
        <p>
          <FeatureTrans
            ns="settings"
            i18nKey="features.usersTab.part0EditorPart0CanViewEditDocumentsAnd"
            components={{ part0: <strong /> }}
            values={{}}
          />
        </p>
        <p>
          <FeatureTrans
            ns="settings"
            i18nKey="features.usersTab.part0ViewerPart0ReadOnlyAccessToAssigned"
            components={{ part0: <strong /> }}
            values={{}}
          />
        </p>
      </div>

      {/* md+ table */}
      <div className="hidden rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">
                {tx("errors:fields.username")}
              </th>
              <th className="px-4 py-2 text-left font-medium">
                {tx("settings:features.normalizationRow.displayName")}
              </th>
              <th className="px-4 py-2 text-left font-medium">
                {tx("settings:features.usersTab.role")}
              </th>
              <th className="px-4 py-2 text-left font-medium">
                {tx("settings:features.backupTab.created")}
              </th>
              <th className="px-4 py-2 text-left font-medium">
                {tx("settings:features.usersTab.patientAccess")}
              </th>
              <th className="px-4 py-2 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => {
              const userGrants = grants[u.id] || [];
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium">{u.username}</td>
                  <td className="px-4 py-2">{u.display_name}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={roleBadgeVariant(u.role || "editor")}>
                        {u.role || tx("settings:features.usersTab.editor2")}
                      </Badge>
                      <select
                        value={u.role || "editor"}
                        onChange={(e) => updateRole(u.id, e.target.value)}
                        className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
                        title={tx("settings:features.usersTab.changeRole")}
                      >
                        <option value="admin">
                          {tx("settings:features.usersTab.admin")}
                        </option>
                        <option value="editor">
                          {tx("settings:features.usersTab.editor")}
                        </option>
                        <option value="viewer">
                          {tx("settings:features.usersTab.viewer")}
                        </option>
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {u.created_at?.split("T")[0]}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <GrantChips role={u.role} userGrants={userGrants} />
                      <button
                        onClick={() => setAccessForUser(u.id)}
                        className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-accent"
                      >
                        <UserCog className="h-3 w-3" />{" "}
                        {tx("settings:features.usersTab.manage")}{" "}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <IconButton
                      label={tx("settings:features.usersTab.deleteUser")}
                      variant="danger"
                      size="sm"
                      onClick={() => deleteUser(u.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* < md stacked cards */}
      <ul className="divide-y overflow-hidden rounded-lg border bg-card md:hidden">
        {users.map((u) => {
          const userGrants = grants[u.id] || [];
          return (
            <li key={u.id} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {u.display_name || u.username}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username}
                    {u.created_at
                      ? tx("settings:features.usersTab.created", {
                          value0: u.created_at.split("T")[0],
                        })
                      : ""}
                  </p>
                </div>
                <Badge
                  variant={roleBadgeVariant(u.role || "editor")}
                  className="shrink-0"
                >
                  {u.role || tx("settings:features.usersTab.editor2")}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <GrantChips role={u.role} userGrants={userGrants} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={u.role || "editor"}
                  onChange={(e) => updateRole(u.id, e.target.value)}
                  title={tx("settings:features.usersTab.changeRole")}
                  className="h-9 w-auto min-w-[6.5rem] flex-none"
                >
                  <option value="admin">
                    {tx("settings:features.usersTab.admin")}
                  </option>
                  <option value="editor">
                    {tx("settings:features.usersTab.editor")}
                  </option>
                  <option value="viewer">
                    {tx("settings:features.usersTab.viewer")}
                  </option>
                </Select>
                <Button
                  variant="secondary"
                  onClick={() => setAccessForUser(u.id)}
                >
                  <UserCog className="h-4 w-4" />{" "}
                  {tx("settings:features.usersTab.manageAccess")}{" "}
                </Button>
                <IconButton
                  label={tx("settings:features.usersTab.deleteUser")}
                  variant="danger"
                  className="ml-auto"
                  onClick={() => deleteUser(u.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Access management modal */}
      {accessForUser !== null && (
        <AccessModal
          user={users.find((u) => u.id === accessForUser)}
          patients={patients}
          initialGrants={grants[accessForUser] || []}
          onClose={() => setAccessForUser(null)}
          onSaved={async (updated) => {
            setGrants((g) => ({ ...g, [accessForUser]: updated }));
            setAccessForUser(null);
          }}
          toast={toast}
        />
      )}

      {/* Audit Log */}
      {showAudit && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {tx("settings:features.usersTab.auditLog")}
            </h3>
            <span className="text-xs text-muted-foreground">
              {tx("settings:features.usersTab.totalEntries", {
                value0: auditTotal,
              })}
            </span>
          </div>
          <div className="rounded-lg border max-h-[400px] overflow-y-auto">
            {/* md+ table */}
            <table className="hidden w-full text-xs md:table">
              <thead className="border-b bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    {tx("settings:features.usersTab.time")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {tx("settings:features.sessionsTab.user")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {tx("settings:features.usersTab.action")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {tx("settings:features.usersTab.resource")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {tx("settings:features.usersTab.details")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {tx("settings:features.sessionsTab.ip")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditLog.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-4 text-center text-muted-foreground"
                    >
                      {tx("settings:features.usersTab.noAuditLogEntries")}
                    </td>
                  </tr>
                ) : (
                  auditLog.map((entry) => (
                    <tr key={entry.id} className="hover:bg-accent/20">
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                        {entry.created_at?.replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        {entry.username || `#${entry.user_id}`}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {entry.resource_type && `${entry.resource_type}`}
                        {entry.resource_id && ` #${entry.resource_id}`}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">
                        {entry.details}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground font-mono">
                        {entry.ip_address}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* < md two-line rows */}
            <ul className="divide-y md:hidden">
              {auditLog.length === 0 ? (
                <li className="p-4 text-center text-sm text-muted-foreground">
                  {tx("settings:features.usersTab.noAuditLogEntries")}
                </li>
              ) : (
                auditLog.map((entry) => (
                  <li key={entry.id} className="px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="font-medium">
                        {entry.username || `#${entry.user_id}`}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                        {entry.action}
                      </span>
                      {(entry.resource_type || entry.resource_id) && (
                        <span className="text-muted-foreground">
                          {entry.resource_type && `${entry.resource_type}`}
                          {entry.resource_id && ` #${entry.resource_id}`}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 break-words text-muted-foreground">
                      {entry.details && <span>{entry.details} · </span>}
                      <span>
                        {entry.created_at?.replace("T", " ").slice(0, 19)}
                      </span>
                      {entry.ip_address && (
                        <span className="font-mono"> · {entry.ip_address}</span>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Patient-access chips (shared by the md+ table and the phone cards) ──

function GrantChips({
  role,
  userGrants,
}: {
  role?: string;
  userGrants: Grant[];
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
  if (role === "admin") {
    return (
      <span className="text-xs italic text-muted-foreground">
        {tx("settings:features.usersTab.allPatientsAdmin")}
      </span>
    );
  }
  if (userGrants.length === 0) {
    return (
      <span className="text-xs italic text-muted-foreground">
        {tx("settings:features.usersTab.noAccess")}
      </span>
    );
  }
  return (
    <>
      {userGrants.slice(0, 3).map((g) => (
        <span
          key={g.id}
          className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs"
        >
          {g.display_name}
          <span className="text-[10px] text-muted-foreground">
            ({enumLabel("role", g.role)})
          </span>
        </span>
      ))}
      {userGrants.length > 3 && (
        <span className="text-xs text-muted-foreground">
          {tx("settings:features.usersTab.more", {
            value0: userGrants.length - 3,
          })}
        </span>
      )}
    </>
  );
}

// ── Access management modal ──────────────────────────────────────

interface AccessModalProps {
  user: any;
  patients: Patient[];
  initialGrants: Grant[];
  onClose: () => void;
  onSaved: (updated: Grant[]) => void | Promise<void>;
  toast: (args: {
    title: UiMessage;
    description?: UiMessage;
    variant?: "default" | "error";
  }) => void;
}

function AccessModal({
  user,
  patients,
  initialGrants,
  onClose,
  onSaved,
  toast,
}: AccessModalProps) {
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
  // patient_id → role (undefined means no access)
  const initialMap = useMemo(
    () =>
      Object.fromEntries(initialGrants.map((g) => [g.id, g.role])) as Record<
        number,
        string
      >,
    [initialGrants],
  );
  const [selection, setSelection] =
    useState<Record<number, string>>(initialMap);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.display_name.toLowerCase().includes(q));
  }, [patients, filter]);

  const toggle = (id: number) => {
    setSelection((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = "viewer";
      return next;
    });
  };

  const setRole = (id: number, role: string) => {
    setSelection((prev) => ({ ...prev, [id]: role }));
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((p) => p.id in selection);
  const toggleAllVisible = () => {
    setSelection((prev) => {
      const next = { ...prev };
      if (allVisibleSelected) {
        for (const p of filtered) delete next[p.id];
      } else {
        for (const p of filtered) if (!(p.id in next)) next[p.id] = "viewer";
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const grants: Array<[number, string]> = [];
      const revokes: number[] = [];
      for (const [pidStr, role] of Object.entries(selection)) {
        const pid = Number(pidStr);
        if (initialMap[pid] !== role) grants.push([pid, role]); // new or role-changed
      }
      for (const pidStr of Object.keys(initialMap)) {
        const pid = Number(pidStr);
        if (!(pid in selection)) revokes.push(pid);
      }

      // Run all mutations in parallel; gather errors rather than bailing
      // early so the user sees a partial-success summary.
      const results = await Promise.allSettled([
        ...grants.map(([pid, role]) =>
          api.post(`/settings/users/${user.id}/access`, {
            patient_id: pid,
            role,
          }),
        ),
        ...revokes.map((pid) =>
          api.delete(`/settings/users/${user.id}/access/${pid}`),
        ),
      ]);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast({
          title: message("feedback.someChangesFailed"),
          description: message("feedback.ofAccessUpdatesDidNotApply", {
            value0: String(failed),
            value1: String(results.length),
          }),
          variant: "error",
        });
      }

      const updated: Grant[] = Object.entries(selection).map(
        ([pidStr, role]) => {
          const pid = Number(pidStr);
          const p = patients.find((x) => x.id === pid);
          return { id: pid, display_name: p?.display_name || `#${pid}`, role };
        },
      );
      updated.sort((a, b) => a.display_name.localeCompare(b.display_name));
      await onSaved(updated);
    } catch (err: any) {
      toast({
        title: message("feedback.saveFailed"),
        description: getErrorMessage(err, message("errors:unexpected")),
        variant: "error",
      });
    }
    setSaving(false);
  };

  const changeCount = useMemo(() => {
    let n = 0;
    for (const [pidStr, role] of Object.entries(selection)) {
      if (initialMap[Number(pidStr)] !== role) n += 1;
    }
    for (const pidStr of Object.keys(initialMap)) {
      if (!(Number(pidStr) in selection)) n += 1;
    }
    return n;
  }, [selection, initialMap]);

  // Guard placed after all hooks so hook order stays stable across renders
  // (react-hooks/rules-of-hooks). The early return only short-circuits the
  // JSX/callbacks below, which is behaviour-identical to the prior guard.
  if (!user) return null;

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={tx("settings:features.usersTab.patientAccess2")}
      description={
        <>
          {tx("settings:features.usersTab.for")}{" "}
          <span className="font-medium">
            {user.display_name || user.username}
          </span>{" "}
          (@{user.username})
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tx("common:feedback.cancel")}
          </Button>
          <Button
            onClick={save}
            disabled={saving || changeCount === 0}
            className="px-4 py-1.5 disabled:opacity-50"
          >
            {saving
              ? tx("common:ui.saving")
              : changeCount === 0
                ? tx("settings:features.usersTab.noChanges")
                : tx("settings:features.usersTab.applyChange", {
                    count: changeCount,
                  })}
          </Button>
        </>
      }
    >
      <div className="border-b pb-3 space-y-2">
        <Input
          type="text"
          placeholder={tx("settings:features.usersTab.filterPatients")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            onClick={toggleAllVisible}
            className="inline-flex items-center hover:text-foreground coarse:min-h-11"
          >
            {allVisibleSelected
              ? tx("settings:features.usersTab.clearVisible")
              : tx("settings:features.usersTab.selectAllVisible")}
          </button>
          <span>
            {Object.keys(selection).length}{" "}
            {tx("settings:features.usersTab.selected")}{" "}
            {changeCount > 0 && (
              <span className="ml-2 text-primary">
                {tx("settings:features.usersTab.change", {
                  count: changeCount,
                })}
              </span>
            )}
          </span>
        </div>
      </div>

      <div>
        {patients.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {tx("settings:features.usersTab.noPatientsExistYet")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {tx("settings:features.usersTab.noPatientsMatch", {
              value0: filter,
            })}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((p) => {
              const checked = p.id in selection;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 ${checked ? "bg-primary/5" : ""}`}
                >
                  <label className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer coarse:min-h-11">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 coarse:h-5 coarse:w-5"
                    />
                    <span className="text-sm">{p.display_name}</span>
                    {initialMap[p.id] && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Check className="h-3 w-3 text-primary" />{" "}
                        {tx("settings:features.sessionsTab.current")}{" "}
                      </span>
                    )}
                  </label>
                  {checked && (
                    <select
                      value={selection[p.id]}
                      onChange={(e) => setRole(p.id, e.target.value)}
                      className="rounded-md border bg-background px-2 py-0.5 text-xs coarse:min-h-11"
                    >
                      <option value="viewer">
                        {tx("settings:features.oidcTab.viewer")}
                      </option>
                      <option value="owner">
                        {tx("settings:features.usersTab.owner")}
                      </option>
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
