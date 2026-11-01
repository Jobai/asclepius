import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function AppearanceTab() {
  const { t } = useTranslation("settings");
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">{t("appearance")}</h2>
      <LanguageSwitcher />
      <p className="max-w-xl text-sm text-muted-foreground">
        {t("interfaceLanguageHelp")}
      </p>
    </section>
  );
}
