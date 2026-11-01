import type { MessageKey } from "@/i18n/messages";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useEffect, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/contexts/ToastContext";
import {
  SettingsForm,
  TextField,
  NumberField,
  SelectField,
  ToggleField,
  useSettingsSave,
} from "./SettingsFormHelpers";
import { useSettings } from "@/hooks/data";

// Two TLS modes we map to two booleans on the wire. "none" only makes
// sense for localhost SMTP testing — the backend refuses to send
// plaintext to non-local hosts so picking "none" against a real server
// surfaces a clear error at test-send time.
type TlsMode = "starttls" | "tls" | "none";

const TLS_OPTIONS: { value: TlsMode; labelKey: MessageKey }[] = [
  {
    value: "starttls",
    labelKey: "settings:features.extra.smtp.tlsModes.starttls",
  },
  { value: "tls", labelKey: "settings:features.extra.smtp.tlsModes.tls" },
  { value: "none", labelKey: "settings:features.extra.smtp.tlsModes.none" },
];

const PLACEHOLDERS = [
  "{code}",
  "{recipient_label}",
  "{expires_minutes}",
  "{share_label}",
  "{from_name}",
];

export default function SmtpTab() {
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
  const { toast } = useToast();
  const { saving, saved, save } = useSettingsSave();
  const { data: settingsData, refetch } = useSettings();

  const [f, setF] = useState<any>(null);
  const [s, setS] = useState<any>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!settingsData) return;
    setS(settingsData);
    const smtp = settingsData.smtp || {};
    const share = settingsData.share || {};
    const tlsMode: TlsMode = smtp.use_tls
      ? "tls"
      : smtp.use_starttls
        ? "starttls"
        : "none";
    setF({
      smtp_enabled: !!smtp.enabled,
      smtp_host: smtp.host || "",
      smtp_port: smtp.port ?? 587,
      smtp_username: smtp.username || "",
      smtp_password: "",
      tls_mode: tlsMode,
      smtp_from_address: smtp.from_address || "",
      smtp_from_name: smtp.from_name || "Asclepius",
      smtp_timeout_seconds: smtp.timeout_seconds ?? 15,
      share_email_otp_subject:
        share.email_otp_subject || "Your access code for medical records",
      share_email_otp_body: share.email_otp_body || "",
      share_lockout_after_failed: share.share_lockout_after_failed ?? 3,
      share_email_otp_daily_cap: share.email_otp_daily_cap ?? 20,
      share_email_otp_resend_cooldown_seconds:
        share.email_otp_resend_cooldown_seconds ?? 30,
    });
  }, [settingsData]);

  if (!f || !s)
    return (
      <div className="text-muted-foreground">{tx("common:ui.loading")}</div>
    );

  const smtpInitial = s.smtp || {};
  const shareInitial = s.share || {};
  const tlsModeInitial: TlsMode = smtpInitial.use_tls
    ? "tls"
    : smtpInitial.use_starttls
      ? "starttls"
      : "none";

  // Only send what changed — same rationale as OidcTab. Empty password
  // is treated as "do not touch" (useSettingsSave drops empty strings).
  const onSave = async () => {
    const tlsModeChanged = f.tls_mode !== tlsModeInitial;
    await save({
      smtp_enabled:
        f.smtp_enabled !== smtpInitial.enabled ? f.smtp_enabled : undefined,
      smtp_host:
        f.smtp_host !== (smtpInitial.host || "") ? f.smtp_host : undefined,
      smtp_port:
        f.smtp_port !== (smtpInitial.port ?? 587) ? f.smtp_port : undefined,
      smtp_username:
        f.smtp_username !== (smtpInitial.username || "")
          ? f.smtp_username
          : undefined,
      smtp_password: f.smtp_password || undefined,
      smtp_use_tls: tlsModeChanged ? f.tls_mode === "tls" : undefined,
      smtp_use_starttls: tlsModeChanged ? f.tls_mode === "starttls" : undefined,
      smtp_from_address:
        f.smtp_from_address !== (smtpInitial.from_address || "")
          ? f.smtp_from_address
          : undefined,
      smtp_from_name:
        f.smtp_from_name !== (smtpInitial.from_name || "Asclepius")
          ? f.smtp_from_name
          : undefined,
      smtp_timeout_seconds:
        f.smtp_timeout_seconds !== (smtpInitial.timeout_seconds ?? 15)
          ? f.smtp_timeout_seconds
          : undefined,
      share_email_otp_subject:
        f.share_email_otp_subject !== (shareInitial.email_otp_subject || "")
          ? f.share_email_otp_subject
          : undefined,
      share_email_otp_body:
        f.share_email_otp_body !== (shareInitial.email_otp_body || "")
          ? f.share_email_otp_body
          : undefined,
      share_lockout_after_failed:
        f.share_lockout_after_failed !==
        (shareInitial.share_lockout_after_failed ?? 3)
          ? f.share_lockout_after_failed
          : undefined,
      share_email_otp_daily_cap:
        f.share_email_otp_daily_cap !== (shareInitial.email_otp_daily_cap ?? 20)
          ? f.share_email_otp_daily_cap
          : undefined,
      share_email_otp_resend_cooldown_seconds:
        f.share_email_otp_resend_cooldown_seconds !==
        (shareInitial.email_otp_resend_cooldown_seconds ?? 30)
          ? f.share_email_otp_resend_cooldown_seconds
          : undefined,
    });
    await refetch();
  };

  const onTest = async () => {
    if (!testTo.trim()) {
      toast({
        title: message("feedback.enterARecipientAddressFirst"),
        variant: "error",
      });
      return;
    }
    setTesting(true);
    try {
      await api.post("/settings/smtp/test", { to: testTo.trim() });
      toast({
        title: message("feedback.testEmailSentTo", { value0: String(testTo) }),
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: message("feedback.testSendFailed"),
        description: getErrorMessage(err),
        variant: "error",
      });
    } finally {
      setTesting(false);
    }
  };

  // Substitute the placeholders against example values so the admin can
  // see roughly what the doctor will get. Mirrors the backend's literal
  // {placeholder} substitution — keep the two in sync if the supported
  // set ever grows.
  const previewBody = (f.share_email_otp_body || "")
    .replace("{code}", "123456")
    .replace("{recipient_label}", "Dr. Maria Rossi")
    .replace("{expires_minutes}", "10")
    .replace("{share_label}", "")
    .replace("{from_name}", f.smtp_from_name || "Asclepius");

  return (
    <div className="space-y-6">
      <SettingsForm
        title={tx("settings:features.smtpTab.smtpTransport")}
        saving={saving}
        saved={saved}
        onSave={onSave}
      >
        <ToggleField
          label={tx("settings:features.smtpTab.enableSmtp")}
          value={f.smtp_enabled}
          onChange={(v) => setF({ ...f, smtp_enabled: v })}
          description={tx(
            "settings:features.smtpTab.whenOffTheEmailOtpShareDeliveryIs",
          )}
        />
        <TextField
          label={tx("settings:features.smtpTab.host")}
          value={f.smtp_host}
          onChange={(v) => setF({ ...f, smtp_host: v })}
          placeholder={tx("settings:features.smtpTab.smtpExampleCom")}
        />
        <NumberField
          label={tx("settings:features.smtpTab.port")}
          value={f.smtp_port}
          onChange={(v) =>
            setF({ ...f, smtp_port: Math.max(1, Math.floor(v)) })
          }
          min={1}
          max={65535}
          description={tx(
            "settings:features.smtpTab.587ForStarttls465ForImplicitTls",
          )}
        />
        <SelectField
          label={tx("settings:features.smtpTab.tlsMode")}
          value={f.tls_mode}
          onChange={(v) => setF({ ...f, tls_mode: v as TlsMode })}
          options={TLS_OPTIONS.map((o) => ({ ...o, label: tx(o.labelKey) }))}
        />
        <TextField
          label={tx("errors:fields.username")}
          value={f.smtp_username}
          onChange={(v) => setF({ ...f, smtp_username: v })}
        />
        <TextField
          label={tx("errors:fields.password")}
          value={f.smtp_password}
          onChange={(v) => setF({ ...f, smtp_password: v })}
          type="password"
          placeholder={
            smtpInitial.has_password
              ? tx("settings:features.oidcTab.configured")
              : tx("settings:features.oidcTab.notSet")
          }
          description={tx(
            "settings:features.smtpTab.leaveBlankToKeepTheCurrentPassword",
          )}
        />
        <TextField
          label={tx("settings:features.smtpTab.fromAddress")}
          value={f.smtp_from_address}
          onChange={(v) => setF({ ...f, smtp_from_address: v })}
          placeholder="noreply@example.com"
        />
        <TextField
          label={tx("settings:features.smtpTab.fromName")}
          value={f.smtp_from_name}
          onChange={(v) => setF({ ...f, smtp_from_name: v })}
          placeholder="Asclepius"
        />
        <NumberField
          label={tx("settings:features.smtpTab.sendTimeoutSeconds")}
          value={f.smtp_timeout_seconds}
          onChange={(v) =>
            setF({ ...f, smtp_timeout_seconds: Math.max(1, Math.floor(v)) })
          }
          min={1}
          max={120}
        />
      </SettingsForm>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium">
          {tx("settings:features.smtpTab.sendTestEmail")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {tx(
            "settings:features.smtpTab.sendsAFixedDiagnosticMessageViaTheCurrent",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-base sm:text-sm coarse:min-h-11"
          />
          <button
            onClick={onTest}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-60 coarse:min-h-11"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {testing
              ? tx("settings:features.smtpTab.sending")
              : tx("settings:features.smtpTab.sendTest")}
          </button>
        </div>
      </div>

      <SettingsForm
        title={tx("settings:features.smtpTab.emailOtpTemplate")}
        saving={saving}
        saved={saved}
        onSave={onSave}
      >
        <TextField
          label={tx("settings:features.smtpTab.subject")}
          value={f.share_email_otp_subject}
          onChange={(v) => setF({ ...f, share_email_otp_subject: v })}
        />
        <label className="space-y-1">
          <span className="text-sm font-medium">
            {tx("settings:features.smtpTab.body")}
          </span>
          <textarea
            value={f.share_email_otp_body}
            onChange={(e) =>
              setF({ ...f, share_email_otp_body: e.target.value })
            }
            rows={10}
            className="w-full rounded-md border bg-background px-3 py-2 text-base sm:text-sm font-mono"
          />
        </label>
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          <span className="text-muted-foreground mr-2">
            {tx("settings:features.smtpTab.placeholders")}
          </span>
          {PLACEHOLDERS.map((p) => (
            <code
              key={p}
              className="inline-block rounded bg-background px-1.5 py-0.5 mr-1 border"
            >
              {p}
            </code>
          ))}
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-xs text-muted-foreground mb-1">
            {tx("settings:features.smtpTab.previewExampleValues")}
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono">
            {previewBody || tx("settings:features.smtpTab.empty")}
          </pre>
        </div>
        <NumberField
          label={tx(
            "settings:features.smtpTab.revokeShareAfterNConsecutiveFailedOtpAttempts",
          )}
          value={f.share_lockout_after_failed}
          onChange={(v) =>
            setF({
              ...f,
              share_lockout_after_failed: Math.max(1, Math.floor(v)),
            })
          }
          min={1}
          max={20}
          description={tx(
            "settings:features.smtpTab.appliesToBothManualAndEmailOtpShares",
          )}
        />
        <NumberField
          label={tx("settings:features.smtpTab.emailOtpDailyCapPerShare")}
          value={f.share_email_otp_daily_cap}
          onChange={(v) =>
            setF({
              ...f,
              share_email_otp_daily_cap: Math.max(1, Math.floor(v)),
            })
          }
          min={1}
          max={500}
          description={tx(
            "settings:features.smtpTab.hardCeilingOnAutomatedEmailsPerSharePer",
          )}
        />
        <NumberField
          label={tx("settings:features.smtpTab.emailOtpResendCooldownSeconds")}
          value={f.share_email_otp_resend_cooldown_seconds}
          onChange={(v) =>
            setF({
              ...f,
              share_email_otp_resend_cooldown_seconds: Math.max(
                0,
                Math.floor(v),
              ),
            })
          }
          min={0}
          max={600}
          description={tx(
            "settings:features.smtpTab.minimumGapBetweenTwoRequestOtpCallsOn",
          )}
        />
      </SettingsForm>
    </div>
  );
}
