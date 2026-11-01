import { useTranslation as useFeatureTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import type { ActiveOtp } from "./types";
import CopyCodeButton from "./CopyCodeButton";

export default function OtpCell({
  visible,
  loading,
  otp,
  onShow,
  onHide,
  onRefresh,
}: {
  visible: boolean;
  loading: boolean;
  otp: ActiveOtp | null;
  onShow: () => void;
  onHide: () => void;
  onRefresh: () => void;
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
  if (!visible) {
    return (
      <button
        onClick={onShow}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-accent coarse:min-h-11 coarse:px-3"
      >
        <Eye className="h-3 w-3" /> {tx("common:actions.show")}{" "}
      </button>
    );
  }
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />{" "}
        {tx("common:ui.loading")}{" "}
      </span>
    );
  }
  return (
    // ``items-center`` aligns the refresh / hide / copy buttons with the
    // 6-digit code on the same horizontal axis. For the no-code branch
    // the buttons sit centred against the wrapped help text, which is
    // a smaller asymmetry than the previous top-aligned look.
    <div className="flex items-center gap-1">
      {otp?.code ? (
        <>
          <span className="font-mono text-base tracking-widest text-primary">
            {otp.code}
          </span>
          <CopyCodeButton code={otp.code} />
        </>
      ) : (
        // Fixed width + whitespace-normal forces the help text to wrap
        // inside the column instead of pushing every other column out.
        <p className="text-[11px] italic text-muted-foreground leading-tight w-[170px] whitespace-normal">
          {tx("share:features.otpCell.noCodeYetDoctorNeedsToClickRequest")}
        </p>
      )}
      <button
        onClick={onRefresh}
        className="rounded p-0.5 hover:bg-accent flex-shrink-0 coarse:p-2.5"
        title={tx("share:features.otpCell.refetch")}
        aria-label={tx("share:features.shareDialog.refetchCode")}
      >
        <RefreshCw className="h-3 w-3" />
      </button>
      <button
        onClick={onHide}
        className="rounded p-0.5 hover:bg-accent flex-shrink-0 coarse:p-2.5"
        title={tx("common:actions.hide")}
        aria-label={tx("share:features.shareDialog.hideCode")}
      >
        <EyeOff className="h-3 w-3" />
      </button>
    </div>
  );
}
