import { useCallback, useLayoutEffect, type ReactNode } from "react";
import api from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUiLanguage } from "@/contexts/UiLanguageContext";
import type { SaveLanguage } from "@/i18n/accountSession";

/** Core routes only. /auth/me already supplies the preference; no extra fetch. */
export default function AccountLanguageBridge({
  children,
}: {
  children: ReactNode;
}) {
  const { user, recordUiLanguage } = useAuth();
  const { bindAccount, accountId } = useUiLanguage();
  const id = user?.id ?? null;
  const saveLanguage = useCallback<SaveLanguage>(
    async (ui_language, signal) => {
      await api.patch("/auth/me/preferences", { ui_language }, { signal });
      if (id !== null && !signal.aborted) recordUiLanguage(id, ui_language);
    },
    [id, recordUiLanguage],
  );
  useLayoutEffect(() => {
    bindAccount(id, user?.ui_language, saveLanguage);
  }, [bindAccount, id, user?.ui_language, saveLanguage]);
  useLayoutEffect(() => () => bindAccount(null), [bindAccount]);

  // Resolve the account preference before showing its shell, including OIDC login.
  return accountId === id ? children : null;
}
