import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/i18n";
import {
  guestLanguageKeys,
  readGuestPreference,
  resolveLanguage,
  resolvePreference,
} from "@/i18n/preferences";
import {
  AccountLanguageSession,
  type AccountLanguageState,
  type SaveLanguage,
} from "@/i18n/accountSession";
import type { UiLanguage, UiLanguagePreference } from "@/i18n/types";

interface UiLanguageContextValue {
  preference: UiLanguagePreference;
  language: UiLanguage;
  saving: boolean;
  failed: boolean;
  accountId: number | null;
  selectLanguage: (preference: UiLanguagePreference) => void;
  bindAccount: (
    id: number | null,
    preference?: unknown,
    save?: SaveLanguage,
  ) => void;
}

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);
const browserLanguages = () =>
  navigator.languages?.length
    ? [...navigator.languages]
    : [navigator.language || "en"];

/** Shared by both surfaces. All network access is injected by the core bridge. */
export function UiLanguageProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const surface = /^\/share(?:\/|$)/.test(pathname) ? "share" : "core";
  const [guests, setGuests] = useState(() => ({
    core: readGuestPreference("core", () => window.localStorage),
    share: readGuestPreference("share", () => window.localStorage),
  }));
  const guestRef = useRef(guests);
  guestRef.current = guests;
  const [languages, setLanguages] = useState(browserLanguages);
  const [account, setAccount] = useState<AccountLanguageState | null>(null);
  const session = useRef<AccountLanguageSession | null>(null);
  const [storageFailed, setStorageFailed] = useState({
    core: false,
    share: false,
  });

  const bindAccount = useCallback(
    (id: number | null, preference?: unknown, save?: SaveLanguage) => {
      if (id === null || !save) {
        session.current?.dispose();
        session.current = null;
        setAccount(null);
        return;
      }
      const initial = resolvePreference(preference, guestRef.current.core);
      if (session.current?.snapshot.id === id) {
        session.current.refresh(initial);
        return;
      }
      session.current?.dispose();
      session.current = new AccountLanguageSession(
        id,
        initial,
        save,
        setAccount,
      );
      setAccount(session.current.snapshot);
    },
    [],
  );

  useEffect(() => {
    const changed = () => setLanguages(browserLanguages());
    window.addEventListener("languagechange", changed);
    return () => window.removeEventListener("languagechange", changed);
  }, []);
  useEffect(
    () => () => {
      session.current?.dispose();
    },
    [],
  );

  const currentAccount = surface === "core" ? account : null;
  const preference = currentAccount?.preference ?? guests[surface];
  const language = resolveLanguage(preference, languages);

  useLayoutEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language]);

  const selectLanguage = (next: UiLanguagePreference) => {
    if (surface === "core" && session.current) {
      session.current.select(next);
      return;
    }
    setGuests((previous) => ({ ...previous, [surface]: next }));
    try {
      window.localStorage.setItem(guestLanguageKeys[surface], next);
      setStorageFailed((previous) => ({ ...previous, [surface]: false }));
    } catch {
      setStorageFailed((previous) => ({ ...previous, [surface]: true }));
    }
  };

  return (
    <I18nextProvider i18n={i18n}>
      <UiLanguageContext.Provider
        value={{
          preference,
          language,
          selectLanguage,
          bindAccount,
          accountId: currentAccount?.id ?? null,
          saving: currentAccount?.saving ?? false,
          failed: currentAccount?.failed ?? storageFailed[surface],
        }}
      >
        {children}
      </UiLanguageContext.Provider>
    </I18nextProvider>
  );
}

export function useUiLanguage() {
  const context = useContext(UiLanguageContext);
  if (!context) throw new Error("useUiLanguage requires UiLanguageProvider");
  return context;
}
