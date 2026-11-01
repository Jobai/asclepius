import { useUiFormat } from "@/lib/formatting";
import { Trans as FeatureTrans } from "react-i18next";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useEffect, useState } from "react";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { Download, Play, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import {
  SettingsForm,
  NumberField,
  SelectField,
  ToggleField,
  useSettingsSave,
} from "./SettingsFormHelpers";
import { useSettings } from "@/hooks/data";

type JobKind = "db" | "vault" | "full";
type Schedule = "hourly" | "daily" | "weekly";
type RetentionMode = "count" | "days";

type BackupState = {
  directory: string;
  enabled: boolean;
  include_database: boolean;
  include_vault: boolean;
  schedule: Schedule;
  retention_mode: RetentionMode;
  retention_value: number;
  last_backup_at: string | null;
};

type BackupFile = {
  name: string;
  size: number;
  created_at: string;
  type: JobKind;
};

const SCHEDULE_OPTIONS = [
  {
    value: "hourly",
    labelKey: "settings:features.extra.backups.schedules.hourly",
  },
  {
    value: "daily",
    labelKey: "settings:features.extra.backups.schedules.daily",
  },
  {
    value: "weekly",
    labelKey: "settings:features.extra.backups.schedules.weekly",
  },
] as const;

const RETENTION_OPTIONS = [
  {
    value: "count",
    labelKey: "settings:features.extra.backups.retention.count",
  },
  { value: "days", labelKey: "settings:features.extra.backups.retention.days" },
] as const;

export default function BackupTab() {
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
  const { formatFileSize, formatDateTime } = useUiFormat();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { saving, saved, save } = useSettingsSave();

  const [state, setState] = useState<BackupState | null>(null);
  const [form, setForm] = useState<BackupState | null>(null);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [running, setRunning] = useState(false);
  const [downloadingOneShot, setDownloadingOneShot] = useState(false);
  const { data: settingsData, refetch: refetchSettings } = useSettings();

  useEffect(() => {
    if (!settingsData) return;
    const b: BackupState = settingsData.backup;
    setState(b);
    setForm(structuredClone(b));
  }, [settingsData]);

  const loadSettings = async () => {
    await refetchSettings();
  };

  const loadFiles = async () => {
    try {
      const res = await api.get("/settings/backup/files");
      setFiles(res.data.files || []);
    } catch {
      setFiles([]);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  if (!state || !form)
    return (
      <div className="text-muted-foreground">{tx("common:ui.loading")}</div>
    );

  const scopeOk = form.include_database || form.include_vault;

  const changedUpdates = (): Record<string, any> => {
    const out: Record<string, any> = {};
    const keys: (keyof BackupState)[] = [
      "enabled",
      "include_database",
      "include_vault",
      "schedule",
      "retention_mode",
      "retention_value",
    ];
    keys.forEach((k) => {
      if (form[k] !== state[k]) out[`backup_${k}`] = form[k];
    });
    return out;
  };

  const saveJob = async () => {
    if (!scopeOk) {
      toast({
        title: message("feedback.selectAtLeastOneOfDatabaseOrVault"),
        variant: "error",
      });
      return;
    }
    const updates = changedUpdates();
    if (Object.keys(updates).length === 0) return;
    await save(updates);
    await loadSettings();
  };

  const runNow = async () => {
    if (!scopeOk) {
      toast({
        title: message("feedback.selectAtLeastOneOfDatabaseOrVault"),
        variant: "error",
      });
      return;
    }
    setRunning(true);
    try {
      const res = await api.post("/settings/backup/run", {});
      toast({
        title: message("feedback.backupCreated", {
          value0: String(res.data.file),
        }),
        variant: "success",
      });
      await loadFiles();
      await loadSettings();
    } catch (e: any) {
      toast({
        title: message("feedback.backupFailed"),
        description: getErrorMessage(e),
        variant: "error",
      });
    }
    setRunning(false);
  };

  const deleteFile = async (file: BackupFile) => {
    const ok = await confirm({
      title: message("feedback.delete9b216", { value0: String(file.name) }),
      description: message(
        "feedback.thisPermanentlyRemovesTheBackupFileFromDisk",
      ),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.delete(
        `/settings/backup/files/${encodeURIComponent(file.name)}`,
      );
      await loadFiles();
    } catch {
      toast({ title: message("feedback.deleteFailed"), variant: "error" });
    }
  };

  const downloadFile = async (file: BackupFile) => {
    try {
      const response = await api.get(
        `/settings/backup/files/${encodeURIComponent(file.name)}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: message("feedback.downloadFailed"), variant: "error" });
    }
  };

  const downloadOneShot = async () => {
    setDownloadingOneShot(true);
    try {
      const response = await api.get("/settings/backup", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const filename =
        response.headers["content-disposition"]
          ?.split("filename=")[1]
          ?.replace(/"/g, "") ||
        `asclepius_backup_${new Date().toISOString().slice(0, 10)}.sqlite`;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: message("feedback.backupFailed"), variant: "error" });
    }
    setDownloadingOneShot(false);
  };

  const retentionLabel =
    form.retention_mode === "count"
      ? tx("settings:features.extra.keepBackupCount")
      : tx("settings:features.extra.backupAgeLimit");

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <h3 className="font-medium">
          {tx("settings:features.backupTab.scheduledBackups")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          <FeatureTrans
            ns="settings"
            i18nKey="features.backupTab.filesAreWrittenToPart0Part0PickWhat"
            components={{ part0: <code /> }}
            values={{ value0: state.directory }}
          />
        </p>
      </div>

      <SettingsForm
        title={tx("settings:features.backupTab.backupJob")}
        saving={saving}
        saved={saved}
        onSave={saveJob}
      >
        <ToggleField
          label={tx("settings:features.backupTab.enabled")}
          value={form.enabled}
          onChange={(v) => setForm({ ...form, enabled: v })}
          description={tx(
            "settings:features.backupTab.whenOnTheSchedulerRunsThisJobIn",
          )}
        />

        <div className="space-y-2">
          <span className="text-sm font-medium">
            {tx("settings:features.backupTab.whatToBackUp")}
          </span>
          <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
            <label className="flex items-center gap-2 text-sm coarse:min-h-11">
              <input
                type="checkbox"
                checked={form.include_database}
                onChange={(e) =>
                  setForm({ ...form, include_database: e.target.checked })
                }
                className="h-4 w-4 rounded coarse:h-5 coarse:w-5"
              />
              <span>
                {tx("settings:features.backupTab.databaseSqliteSnapshot")}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm coarse:min-h-11">
              <input
                type="checkbox"
                checked={form.include_vault}
                onChange={(e) =>
                  setForm({ ...form, include_vault: e.target.checked })
                }
                className="h-4 w-4 rounded coarse:h-5 coarse:w-5"
              />
              <span>
                {tx("settings:features.backupTab.vaultDocumentFiles")}
              </span>
            </label>
          </div>
          {!scopeOk && (
            <p className="text-xs text-destructive">
              {tx("settings:features.backupTab.selectAtLeastOne")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {tx(
              "settings:features.backupTab.selectingBothProducesASingleCombinedArchive",
            )}
          </p>
        </div>

        <SelectField
          label={tx("settings:features.backupTab.schedule")}
          value={form.schedule}
          onChange={(v) => setForm({ ...form, schedule: v as Schedule })}
          options={SCHEDULE_OPTIONS.map((o) => ({
            ...o,
            label: tx(o.labelKey),
          }))}
        />

        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <span className="text-sm font-medium">
            {tx("settings:features.backupTab.retentionStrategy")}
          </span>
          <p className="text-xs text-muted-foreground">
            {tx("settings:features.backupTab.pickOneStrategyTheOtherIsIgnored")}
          </p>
          <div className="flex flex-col gap-2 pt-1">
            {RETENTION_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-sm coarse:min-h-11"
              >
                <input
                  type="radio"
                  name="retention_mode"
                  value={opt.value}
                  checked={form.retention_mode === opt.value}
                  onChange={() =>
                    setForm({
                      ...form,
                      retention_mode: opt.value as RetentionMode,
                    })
                  }
                  className="h-4 w-4 coarse:h-5 coarse:w-5"
                />
                <span>{tx(opt.labelKey)}</span>
              </label>
            ))}
          </div>
          <div className="pt-2">
            <NumberField
              label={retentionLabel}
              value={form.retention_value}
              onChange={(v) =>
                setForm({
                  ...form,
                  retention_value: Math.max(1, Math.floor(v)),
                })
              }
              min={1}
              max={3650}
              step={1}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
          <span>
            <FeatureTrans
              ns="settings"
              i18nKey="features.backupTab.lastRunPart0Part0"
              components={{ part0: <span className="font-mono" /> }}
              values={{
                value0: state.last_backup_at
                  ? formatDateTime(state.last_backup_at)
                  : tx("share:features.extra.never"),
              }}
            />
          </span>
          <button
            type="button"
            onClick={runNow}
            disabled={running || !scopeOk}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50 coarse:min-h-11"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {running
              ? tx("settings:features.backupTab.running")
              : tx("settings:features.backupTab.runNow")}
          </button>
        </div>
      </SettingsForm>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">
            {tx("settings:features.backupTab.backupFiles")}{" "}
            {files.length > 0 && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {files.length}
              </span>
            )}
          </h3>
          <button
            onClick={loadFiles}
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-accent coarse:min-h-11"
          >
            <RefreshCw className="h-3 w-3" />{" "}
            {tx("settings:features.backupTab.refresh")}{" "}
          </button>
        </div>

        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tx("settings:features.backupTab.noBackupFilesYetEnableTheJobOr")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 font-medium">
                    {tx("settings:features.backupTab.name")}
                  </th>
                  <th className="py-2 pr-2 font-medium">
                    {tx("common:columns.type")}
                  </th>
                  <th className="py-2 pr-2 font-medium">
                    {tx("settings:features.backupTab.size")}
                  </th>
                  <th className="py-2 pr-2 font-medium">
                    {tx("settings:features.backupTab.created")}
                  </th>
                  <th className="py-2 pr-2 font-medium text-right">
                    {tx("settings:features.backupTab.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr
                    key={f.name}
                    className="border-b last:border-0 hover:bg-accent/20"
                  >
                    <td className="py-2 pr-2 font-mono text-xs break-all">
                      {f.name}
                    </td>
                    <td className="py-2 pr-2 uppercase text-xs">{f.type}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {formatFileSize(f.size)}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap font-mono text-xs">
                      {f.created_at.replace("T", " ")}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => downloadFile(f)}
                          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent coarse:min-h-11"
                          title={tx("settings:features.backupTab.download")}
                        >
                          <Download className="h-3 w-3" />{" "}
                          {tx("settings:features.backupTab.download")}{" "}
                        </button>
                        <button
                          onClick={() => deleteFile(f)}
                          aria-label={tx(
                            "settings:features.backupTab.deleteBackupFile",
                          )}
                          className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-destructive coarse:min-h-11 coarse:min-w-11"
                          title={tx("common:actions.delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="font-medium">
          {tx("settings:features.backupTab.oneShotDatabaseDownload")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {tx(
            "settings:features.backupTab.downloadAConsistentSqliteSnapshotRightNowWithout",
          )}
        </p>
        <button
          onClick={downloadOneShot}
          disabled={downloadingOneShot}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50 coarse:min-h-11"
        >
          <Download className="h-4 w-4" />
          {downloadingOneShot
            ? tx("settings:features.backupTab.downloading")
            : tx("settings:features.backupTab.downloadDatabaseBackup")}
        </button>
      </div>
    </div>
  );
}
