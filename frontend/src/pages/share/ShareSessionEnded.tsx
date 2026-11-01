import type { MessageKey } from "@/i18n/messages";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { Clock } from "lucide-react";

import type { ShareEndReason } from "@/api/shareClient";
import ShareLogo from "@/components/share/ShareLogo";
import Button from "@/components/ui/Button";

const TITLES: Record<ShareEndReason, MessageKey> = {
  logged_out: "share:features.extra.sessionEnded.loggedOut",
  idle: "share:features.extra.sessionEnded.idle",
  expired: "share:features.extra.sessionEnded.expired",
  unauthorized: "share:features.extra.sessionEnded.unauthorized",
  replaced: "share:features.extra.sessionEnded.replaced",
};

/**
 * Terminal screen for the doctor share surface, shown in place of a
 * session page once the share session has ended.
 *
 * Deliberately inert: it makes no request and has no automatic retry.
 * A forgotten tab sitting here sends nothing, so it cannot push the
 * doctor's IP toward the public proxy's fail2ban threshold. With
 * ``reason`` null it reports a load failure that was not an auth error
 * (network, 5xx) and offers a manual retry.
 */
export default function ShareSessionEnded({
  reason,
  onRetry,
}: {
  reason: ShareEndReason | null;
  onRetry?: () => void;
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
  const title = reason
    ? tx(TITLES[reason])
    : tx("share:features.extra.loadFailed");
  return (
    <div className="min-h-dvh flex items-center justify-center bg-muted/30 px-4">
      <div
        role="status"
        className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm space-y-6"
      >
        <div className="flex justify-center">
          <ShareLogo size="md" />
        </div>
        <div className="flex items-center gap-2 text-primary">
          <Clock className="h-6 w-6" />
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        {reason ? (
          <p className="text-sm text-muted-foreground">
            {tx(
              "share:features.shareSessionEnded.toViewTheDocumentsAgainOpenTheShare",
            )}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {tx(
                "share:features.shareSessionEnded.theServerCouldNotBeReachedCheckYour",
              )}
            </p>
            {onRetry && (
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={onRetry}
              >
                {tx("share:features.shareSessionEnded.tryAgain")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
