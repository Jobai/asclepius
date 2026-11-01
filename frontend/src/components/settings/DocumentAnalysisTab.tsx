import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import ProvidersTab from "./ProvidersTab";
import PriorityTab from "./PriorityTab";
import PromptsTab from "./PromptsTab";
import NormalizationTab from "./NormalizationTab";

const SUB_TABS = [
  {
    key: "providers",
    labelKey: "settings:features.extra.analysisNavigation.providers",
  },
  {
    key: "priority",
    labelKey: "settings:features.extra.analysisNavigation.priority",
  },
  {
    key: "prompts",
    labelKey: "settings:features.extra.analysisNavigation.prompts",
  },
  {
    key: "normalization",
    labelKey: "settings:features.extra.analysisNavigation.normalization",
  },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];
const SUB_KEYS: readonly SubTab[] = SUB_TABS.map((t) => t.key);
const DEFAULT_SUB: SubTab = "providers";

function isSubTab(v: string | undefined): v is SubTab {
  return !!v && (SUB_KEYS as readonly string[]).includes(v);
}

// Legacy slug → current slug so bookmarks / deep links survive the rename.
const LEGACY_SLUG_REWRITES: Record<string, SubTab> = {
  general: "priority",
  credentials: "providers",
  llm: "priority",
  ocr: "priority",
  vision: "priority",
};

export default function DocumentAnalysisTab() {
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
  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname.split("/").filter(Boolean); // ['settings', 'analysis', subtab?, ...]
  const slug = segments[2];
  const rewritten = slug && LEGACY_SLUG_REWRITES[slug];
  const subTab: SubTab = rewritten || (isSubTab(slug) ? slug : DEFAULT_SUB);

  const setSubTab = (key: SubTab) => {
    navigate(`/settings/analysis/${key}`, { replace: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-6 border-b text-sm overflow-x-auto overflow-y-hidden">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`whitespace-nowrap border-b-2 -mb-px px-1 py-2 transition-colors coarse:min-h-11 ${
              subTab === t.key
                ? "border-primary/60 text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tx(t.labelKey)}
          </button>
        ))}
      </div>

      {subTab === "providers" && <ProvidersTab />}
      {subTab === "priority" && <PriorityTab />}
      {subTab === "prompts" && <PromptsTab />}
      {subTab === "normalization" && <NormalizationTab />}
    </div>
  );
}
