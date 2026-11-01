import { enumLabel } from "@/lib/labels";
import { Trans as FeatureTrans } from "react-i18next";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useEffect, useState } from "react";
import {
  Copy,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  Plus,
} from "lucide-react";

import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/contexts/ToastContext";
import { useLlmProviders, useOcrProviders, useSettings } from "@/hooks/data";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Input from "@/components/ui/Input";
import ProviderSelect from "@/components/ui/ProviderSelect";
import type { ShareCreateRequest, ShareCreateResponse } from "@/types";

// Same shape as backend `_EMAIL_RE`; client-side guard so the user
// gets a hint before the round trip.
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

type OtpDelivery = "manual" | "email";

interface ShareSummary {
  id: number;
  patient_id: number;
  recipient_label: string;
  recipient_contact: string;
  contact_kind: string;
  otp_delivery?: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  document_count: number;
  created_by_username: string;
}

// Server response for POST /shares — aliased from the generated schema so
// a backend field rename surfaces here at compile time.
type CreateResult = ShareCreateResponse;

interface ActiveOtp {
  code: string;
  expires_at: string;
  attempts: number;
}

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
  documentIds: number[];
  patientName?: string | null;
  /** Free-form text describing what's being shared. */
  selectionLabel?: string;
}

/**
 * Reusable share-creation modal. Single-doc and multi-doc callers both
 * route through this — the only difference is how many ids land in
 * ``documentIds``. Backend validates same-patient + admin/owner role.
 *
 * Lists existing shares for the same patient under the create form so
 * the admin can revoke or reveal an active OTP without context-switching.
 */
export default function ShareDialog({
  open,
  onClose,
  patientId,
  documentIds,
  patientName,
  selectionLabel,
}: ShareDialogProps) {
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
  const [recipientLabel, setRecipientLabel] = useState("");
  const [recipientContact, setRecipientContact] = useState("");
  const [otpDelivery, setOtpDelivery] = useState<OtpDelivery>("manual");
  const [days, setDays] = useState(7);
  const [ocrProviderId, setOcrProviderId] = useState("");
  const [llmProviderId, setLlmProviderId] = useState("");
  const { data: llmData } = useLlmProviders();
  const { data: ocrData } = useOcrProviders();
  const { data: settingsData } = useSettings();
  const smtpEnabled = !!settingsData?.smtp?.enabled;
  const llmOptions = (Array.isArray(llmData) ? llmData : []).filter(
    (p: any) => p.enabled,
  );
  const ocrOptions = (Array.isArray(ocrData) ? ocrData : []).filter(
    (p: any) => p.enabled,
  );
  const [submitting, setSubmitting] = useState(false);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [activeOtps, setActiveOtps] = useState<
    Record<number, ActiveOtp | null>
  >({});
  const [revealOtp, setRevealOtp] = useState<Record<number, boolean>>({});
  const [loadingOtp, setLoadingOtp] = useState<Record<number, boolean>>({});

  const refresh = async () => {
    if (!patientId) return;
    try {
      const res = await api.get<ShareSummary[]>("/shares", {
        params: { patient_id: patientId },
      });
      setShares(res.data);
    } catch {
      // ignore; existing-shares list is informational
    }
  };

  useEffect(() => {
    if (open && patientId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId]);

  // Reset transient state when the dialog reopens for a different selection.
  useEffect(() => {
    if (!open) {
      setCreateResult(null);
      setRecipientLabel("");
      setRecipientContact("");
      setOtpDelivery("manual");
      setTokenCopied(false);
      setOcrProviderId("");
      setLlmProviderId("");
    }
  }, [open]);

  const onCreate = async () => {
    if (!patientId || documentIds.length === 0) return;
    // Client-side guard so the user gets a clear error before the round
    // trip. The backend re-validates with the same regex.
    if (otpDelivery === "email" && !EMAIL_RE.test(recipientContact.trim())) {
      toast({
        title: message("feedback.emailOtpDeliveryNeedsAValidEmailInContact"),
        variant: "error",
      });
      return;
    }
    setSubmitting(true);
    try {
      const payload: ShareCreateRequest = {
        patient_id: patientId,
        document_ids: documentIds,
        recipient_label: recipientLabel.trim() || "Outside doctor",
        recipient_contact: recipientContact.trim() || "manual",
        expires_in_days: days,
        otp_delivery: otpDelivery,
        // Empty string from the <select>'s "Default" option becomes
        // null on the wire; the backend then falls through to the
        // first-enabled provider at translate time.
        default_ocr_provider_id: ocrProviderId || null,
        default_llm_provider_id: llmProviderId || null,
      };
      const res = await api.post<CreateResult>("/shares", payload);
      setCreateResult(res.data);
      refresh();
    } catch (err: any) {
      toast({
        title: message("feedback.couldNotCreateShare"),
        description: getErrorMessage(err),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onRevoke = async (id: number) => {
    try {
      await api.delete(`/shares/${id}`);
      toast({ title: message("feedback.shareRevoked"), variant: "success" });
      refresh();
    } catch (err: any) {
      toast({
        title: message("feedback.revokeFailed"),
        description: getErrorMessage(err),
        variant: "error",
      });
    }
  };

  // Add the current selection to an existing share for this patient.
  // This is how you build a share across several filter/search views:
  // select a subset, add it here, change the filter, open this dialog
  // again and add the next subset to the same share — the selection
  // never has to survive a filter change.
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const onAddToShare = async (shareId: number) => {
    if (documentIds.length === 0 || addingTo !== null) return;
    setAddingTo(shareId);
    try {
      const res = await api.post(`/shares/${shareId}/documents`, {
        document_ids: documentIds,
      });
      const added = res.data?.added ?? 0;
      const already = res.data?.already_present ?? 0;
      toast({
        title:
          added > 0
            ? message("feedback.documentsAdded", { count: Number(added) })
            : message("feedback.thoseDocumentsAreAlreadyInThisShare"),
        description:
          added > 0 && already > 0
            ? message("feedback.wereAlreadyShared", { value0: String(already) })
            : undefined,
        variant: "success",
      });
      refresh();
    } catch (err: any) {
      toast({
        title: message("feedback.couldNotAddDocuments"),
        description: getErrorMessage(err),
        variant: "error",
      });
    } finally {
      setAddingTo(null);
    }
  };

  const onRevealOtp = async (shareId: number) => {
    setLoadingOtp((s) => ({ ...s, [shareId]: true }));
    setRevealOtp((s) => ({ ...s, [shareId]: true }));
    try {
      // Lightweight endpoint — see SharesPage.onShowOtp comment.
      const res = await api.get(`/shares/${shareId}/active-otp`);
      setActiveOtps((s) => ({ ...s, [shareId]: res.data?.active_otp || null }));
    } catch (err: any) {
      toast({
        title: message("feedback.couldNotLoadOtp"),
        description: getErrorMessage(err),
        variant: "error",
      });
      setRevealOtp((s) => ({ ...s, [shareId]: false }));
    } finally {
      setLoadingOtp((s) => ({ ...s, [shareId]: false }));
    }
  };

  const onCopyUrl = async () => {
    if (!createResult?.share_url) return;
    try {
      await navigator.clipboard.writeText(createResult.share_url);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 1500);
    } catch {
      // best-effort; older browsers may block
    }
  };

  if (!open) return null;

  const docCountLabel =
    documentIds.length === 1
      ? selectionLabel ||
        tx("share:features.extra.documentId", { id: documentIds[0] })
      : `${documentIds.length} documents`;

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      dismissible={false}
      title={tx("share:features.shareDialog.shareWithDoctor")}
      // Near-full-height bottom sheet on phones (the form + existing-shares
      // list is tall); auto-sized centered dialog from sm up.
      contentClassName="h-[calc(100dvh-3rem)] sm:h-auto sm:max-w-2xl"
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <div className="text-muted-foreground">
            {tx("share:features.shareDialog.sharing")}
          </div>
          <div className="font-medium">{docCountLabel}</div>
          {patientName && (
            <div className="text-muted-foreground mt-0.5">
              {tx("share:features.shareDialog.patient", {
                value0: patientName,
              })}
            </div>
          )}
        </div>

        {!createResult && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                {tx(
                  "share:features.shareDialog.recipientNameShownOnWatermarkAuditLog",
                )}
              </label>
              <Input
                type="text"
                value={recipientLabel}
                onChange={(e) => setRecipientLabel(e.target.value)}
                placeholder={tx("share:features.shareDialog.eGDrMariaRossi")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                {tx("share:features.shareDialog.otpDelivery")}
              </label>
              <div className="flex flex-col gap-1.5 rounded-md border bg-background p-2.5">
                {/* The whole label is the touch target; coarse:min-h-11
                      grows each option to the 44px minimum on phones. */}
                <label className="flex cursor-pointer items-start gap-2 text-xs coarse:min-h-11">
                  <input
                    type="radio"
                    name="otp_delivery"
                    value="manual"
                    checked={otpDelivery === "manual"}
                    onChange={() => setOtpDelivery("manual")}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="font-medium">
                      {tx("share:features.shareDialog.iLlConveyTheCodeMyself")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {tx(
                        "share:features.shareDialog.theOtpAppearsInThisDashboardSoYou",
                      )}
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-2 text-xs coarse:min-h-11 ${!smtpEnabled ? "opacity-60" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="otp_delivery"
                    value="email"
                    checked={otpDelivery === "email"}
                    onChange={() => setOtpDelivery("email")}
                    disabled={!smtpEnabled}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="font-medium">
                      {tx(
                        "share:features.shareDialog.emailTheCodeToTheRecipient",
                      )}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {smtpEnabled
                        ? tx(
                            "share:features.shareDialog.theOtpIsSentAutomaticallyYouStillSend",
                          )
                        : tx(
                            "share:features.shareDialog.configureSmtpInSettingsEmailFirst",
                          )}
                    </span>
                  </span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                {otpDelivery === "email"
                  ? tx(
                      "share:features.shareDialog.recipientEmailOtpsWillBeSentHere",
                    )
                  : tx(
                      "share:features.shareDialog.contactFreeTextForYourRecordsOnly",
                    )}
              </label>
              <Input
                type={otpDelivery === "email" ? "email" : "text"}
                value={recipientContact}
                onChange={(e) => setRecipientContact(e.target.value)}
                placeholder={
                  otpDelivery === "email"
                    ? "doctor@example.com"
                    : tx(
                        "share:features.shareDialog.phoneEmailOrOtherIdentifier",
                      )
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                {tx("share:features.shareDialog.expiresAfterDays")}
              </label>
              <Input
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10) || 7)}
                className="w-32"
              />
            </div>
            {/* Provider defaults — when the doctor clicks Translate
                  the backend uses these unless the request overrides
                  them. The doctor surface intentionally has no provider
                  picker, so the admin's choice here is final from the
                  doctor's point of view. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">
                  {tx("share:features.shareDialog.ocrProviderForTranslation")}
                </label>
                <ProviderSelect
                  kind="ocr"
                  value={ocrProviderId}
                  onChange={setOcrProviderId}
                  options={ocrOptions}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  {tx("share:features.shareDialog.llmProviderForTranslation")}
                </label>
                <ProviderSelect
                  kind="llm"
                  value={llmProviderId}
                  onChange={setLlmProviderId}
                  options={llmOptions}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                onClick={onCreate}
                loading={submitting}
                disabled={!patientId || documentIds.length === 0}
                className="w-full sm:w-auto"
              >
                {tx("share:features.shareDialog.createShareLink")}
              </Button>
            </div>
          </div>
        )}

        {createResult && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-medium text-primary">
              {tx(
                "share:features.shareDialog.shareCreatedCopyTheLinkBelowItIs",
              )}
            </p>
            <div className="flex items-center gap-1.5">
              <Input
                readOnly
                value={createResult.share_url}
                className="min-w-0 flex-1 font-mono"
              />
              <IconButton
                variant="secondary"
                label={
                  tokenCopied
                    ? tx("share:features.shareDialog.copied")
                    : tx("share:features.shareDialog.copyLink")
                }
                onClick={onCopyUrl}
                // h-10 matches the Input primitive's height on fine
                // pointers; both grow to 44px on coarse.
                className="h-10 w-10 bg-background"
              >
                {tokenCopied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </IconButton>
            </div>
            <p className="text-xs text-muted-foreground">
              {otpDelivery === "email" ? (
                <>
                  {tx(
                    "share:features.shareDialog.sendThisLinkToTheDoctorWhenThey",
                  )}{" "}
                  <span className="font-mono">
                    {recipientContact ||
                      tx("share:features.shareDialog.noRecipient")}
                  </span>
                  {tx(
                    "share:features.shareDialog.theDoctorWillNeedAFreshCodeEach",
                  )}{" "}
                </>
              ) : (
                <>
                  {tx(
                    "share:features.shareDialog.sendThisLinkToTheDoctorWhenThey2",
                  )}
                </>
              )}
            </p>
          </div>
        )}

        {patientId && (
          <div className="border-t pt-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              {tx("share:features.shareDialog.existingSharesForThisPatient")}
            </h3>
            {shares.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {tx("share:features.shareDialog.noSharesYet")}
              </p>
            ) : (
              <ul className="space-y-2">
                {shares.map((s) => {
                  const isRevoked = !!s.revoked_at;
                  const isExpired =
                    !isRevoked && s.expires_at < new Date().toISOString();
                  const status = isRevoked
                    ? "revoked"
                    : isExpired
                      ? "expired"
                      : "active";
                  return (
                    <li
                      key={s.id}
                      className="rounded-md border bg-card px-3 py-2 text-xs flex items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{s.recipient_label}</div>
                        <div className="text-muted-foreground">
                          {tx("share:features.shareDialog.docExpires", {
                            value2: s.expires_at,
                            value3: enumLabel("shareStatus", status),
                            count: s.document_count,
                          })}
                        </div>
                        {!isRevoked &&
                          !isExpired &&
                          s.otp_delivery === "email" && (
                            <div className="mt-1.5 text-xs text-muted-foreground italic">
                              <FeatureTrans
                                ns="share"
                                i18nKey="features.shareDialog.codeEmailedToPart0Part0TheAdminCan"
                                components={{
                                  part0: <span className="font-mono" />,
                                }}
                                values={{ value0: s.recipient_contact }}
                              />
                            </div>
                          )}
                        {!isRevoked &&
                          !isExpired &&
                          s.otp_delivery !== "email" && (
                            <div className="mt-1.5">
                              {revealOtp[s.id] ? (
                                <div className="font-mono text-base tracking-widest text-primary">
                                  {loadingOtp[s.id] ? (
                                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground italic font-sans tracking-normal">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      {tx(
                                        "share:features.shareDialog.loadingCode",
                                      )}{" "}
                                    </span>
                                  ) : (
                                    activeOtps[s.id]?.code || (
                                      <span className="text-xs text-muted-foreground italic font-sans tracking-normal">
                                        {tx(
                                          "share:features.shareDialog.noActiveCodeAskTheDoctorToRequest",
                                        )}
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onRevealOtp(s.id)}
                                >
                                  <Eye className="h-3 w-3" aria-hidden />{" "}
                                  {tx(
                                    "share:features.shareDialog.showActiveCode",
                                  )}{" "}
                                </Button>
                              )}
                              {revealOtp[s.id] && !loadingOtp[s.id] && (
                                <div className="inline-flex items-center gap-1 ml-2">
                                  {activeOtps[s.id]?.code && (
                                    <CopyOtpInlineButton
                                      code={activeOtps[s.id]!.code}
                                    />
                                  )}
                                  <IconButton
                                    label={tx(
                                      "share:features.shareDialog.refetchCode",
                                    )}
                                    size="sm"
                                    onClick={() => onRevealOtp(s.id)}
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                  </IconButton>
                                  <IconButton
                                    label={tx(
                                      "share:features.shareDialog.hideCode",
                                    )}
                                    size="sm"
                                    onClick={() =>
                                      setRevealOtp((r) => ({
                                        ...r,
                                        [s.id]: false,
                                      }))
                                    }
                                  >
                                    <EyeOff className="h-3 w-3" />
                                  </IconButton>
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!isRevoked && !isExpired && documentIds.length > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onAddToShare(s.id)}
                            disabled={addingTo !== null}
                            className="border-primary/40 text-primary hover:bg-primary/5 active:bg-primary/5"
                            title={tx(
                              "share:features.shareDialog.addTheToThisShare",
                              { value0: docCountLabel },
                            )}
                          >
                            {addingTo === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            {tx("share:features.shareDialog.addThese")}{" "}
                          </Button>
                        )}
                        {!isRevoked && (
                          <IconButton
                            label={tx("share:features.shareDialog.revokeShare")}
                            variant="danger"
                            size="sm"
                            onClick={() => onRevoke(s.id)}
                            className="border border-destructive/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function CopyOtpInlineButton({ code }: { code: string }) {
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
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // older browsers may block navigator.clipboard outside HTTPS
    }
  };
  return (
    <IconButton
      label={
        copied
          ? tx("share:features.shareDialog.copied")
          : tx("share:features.shareDialog.copyCode")
      }
      size="sm"
      onClick={onCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </IconButton>
  );
}
