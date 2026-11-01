import { Trans as FeatureTrans } from "react-i18next";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import {
  Brain,
  Eye,
  ScanText,
  ChevronUp,
  ChevronDown,
  Save,
  Check,
  Sparkles,
  Power,
  AlertTriangle,
  Languages,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import type {
  Credential,
  LlmProvider,
  OcrProvider,
  VisionLlmProvider,
  GeneralLlmSettings,
} from "@/types";
import {
  useCredentials,
  useLlmProviders,
  useVisionProviders,
  useOcrProviders,
} from "@/hooks/data";

// ─── Generic priority section ─────────────────────────────────────

type AnyEntry = {
  id: string;
  name?: string;
  model?: string;
  enabled: boolean;
  priority: number;
  credential_id?: string;
  type?: string;
};

interface SectionProps<T extends AnyEntry> {
  title: string;
  icon: any;
  items: T[];
  credentials: Credential[];
  describe: (item: T) => string; // secondary line (e.g. model name)
  onReorder: (next: T[]) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  emptyMessage: string;
}

function PrioritySection<T extends AnyEntry>({
  title,
  icon: Icon,
  items,
  credentials,
  describe,
  onReorder,
  onToggle,
  emptyMessage,
}: SectionProps<T>) {
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
  const move = async (idx: number, dir: "up" | "down") => {
    const copy = [...items];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= copy.length) return;
    [copy[idx], copy[swap]] = [copy[swap], copy[idx]];
    const rePriority = copy.map((p, i) => ({ ...p, priority: i + 1 }));
    await onReorder(rePriority);
  };

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {tx("settings:features.priorityTab.enabled", {
            value0: items.filter((i) => i.enabled).length,
            value1: items.length,
          })}
        </span>
      </div>
      <div className="p-2 space-y-1">
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground italic px-2 py-3 text-center">
            {emptyMessage}
          </div>
        )}
        {items.map((p, idx) => {
          const cred = credentials.find((c) => c.id === p.credential_id);
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${p.enabled ? "" : "opacity-60"}`}
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => move(idx, "up")}
                  disabled={idx === 0}
                  aria-label={tx("common:ui.moveUp")}
                  title={tx("common:ui.moveUp")}
                  className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 coarse:min-h-11 coarse:min-w-11"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => move(idx, "down")}
                  disabled={idx === items.length - 1}
                  aria-label={tx("common:ui.moveDown")}
                  title={tx("common:ui.moveDown")}
                  className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 coarse:min-h-11 coarse:min-w-11"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex-shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate font-medium">
                    {p.name ||
                      p.model ||
                      tx("settings:features.priorityTab.untitled")}
                  </span>
                  {cred && (
                    <span className="text-xs text-muted-foreground truncate">
                      {tx("settings:features.priorityTab.via", {
                        value0: cred.name,
                      })}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {describe(p)}
                </div>
              </div>
              <button
                onClick={() => onToggle(p.id)}
                title={
                  p.enabled
                    ? tx("settings:features.priorityTab.enabledClickToDisable")
                    : tx("settings:features.priorityTab.disabledClickToEnable")
                }
                className={`flex items-center justify-center rounded-md p-1.5 transition-colors coarse:min-h-11 coarse:min-w-11 ${p.enabled ? "text-success hover:bg-success-soft" : "text-muted-foreground hover:bg-accent"}`}
              >
                <Power className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── General LLM card ─────────────────────────────────────────────

const GENERAL_ALLOWED_CRED_TYPES = ["ollama", "vllm", "claude", "openai"];

function GeneralLlmCard({
  credentials,
  llm,
}: {
  credentials: Credential[];
  llm: LlmProvider[];
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
  const { toast } = useToast();
  const [settings, setSettings] = useState<GeneralLlmSettings>({
    credential_id: "",
    type: "ollama",
    model: "",
    timeout: 120,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get("/settings/general-llm")
      .then((res) => {
        if (res.data) setSettings((s) => ({ ...s, ...res.data }));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/general-llm", settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      toast({
        title: message("feedback.failedToSaveGeneralLlm"),
        description: getErrorMessage(e, message("errors:unexpected")),
        variant: "error",
      });
    }
    setSaving(false);
  };

  const filteredCreds = credentials.filter((c) =>
    GENERAL_ALLOWED_CRED_TYPES.includes(c.type),
  );
  const chosen = credentials.find((c) => c.id === settings.credential_id);
  const isConfigured = !!settings.credential_id && !!settings.model;

  // Models available on the chosen credential (LLM kind only — General
  // runs chat / auto-merge / auto-rename which are text, not vision).
  const modelsForChosen = settings.credential_id
    ? llm.filter((p) => p.credential_id === settings.credential_id)
    : [];

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {tx("settings:features.priorityTab.generalLlm")}
        </span>
        <span className="text-xs text-muted-foreground">
          {tx(
            "settings:features.priorityTab.usedForChatAutoMergeAutoRenameLink",
          )}
        </span>
      </div>

      {!isConfigured && (
        <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft p-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            {tx(
              "settings:features.priorityTab.notConfiguredThoseFeaturesWillReturn503Until",
            )}
          </span>
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] items-end">
        <label className="space-y-1 block">
          <span className="text-xs font-medium">
            {tx("settings:features.priorityTab.provider")}
          </span>
          <select
            value={settings.credential_id}
            onChange={(e) => {
              const chosen = credentials.find((c) => c.id === e.target.value);
              setSettings((s) => ({
                ...s,
                credential_id: e.target.value,
                type: chosen?.type || s.type,
              }));
            }}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">
              {tx("settings:features.priorityTab.pickAProvider")}
            </option>
            {filteredCreds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 block">
          <span className="text-xs font-medium">
            {tx("settings:features.priorityTab.model")}
          </span>
          <select
            value={settings.model}
            onChange={(e) =>
              setSettings((s) => ({ ...s, model: e.target.value }))
            }
            disabled={!settings.credential_id || modelsForChosen.length === 0}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="">
              {!settings.credential_id
                ? tx("settings:features.priorityTab.pickAProviderFirst")
                : modelsForChosen.length === 0
                  ? tx(
                      "settings:features.priorityTab.noLlmModelsOnThisProvider",
                    )
                  : tx("settings:features.priorityTab.pickAModel")}
            </option>
            {modelsForChosen.map((p) => (
              <option key={p.id} value={p.model}>
                {p.name && p.name !== p.model
                  ? `${p.name} (${p.model})`
                  : p.model}
              </option>
            ))}
          </select>
          {settings.credential_id && modelsForChosen.length === 0 && (
            <span className="block text-[11px] text-warning">
              <FeatureTrans
                ns="settings"
                i18nKey="features.priorityTab.addAnLlmModelToThisProviderUnder"
                components={{
                  part0: (
                    <Link
                      to="/settings/analysis/providers"
                      className="underline"
                    />
                  ),
                }}
                values={{}}
              />
            </span>
          )}
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50 whitespace-nowrap coarse:min-h-11"
        >
          {saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saved
            ? tx("common:messages.saved")
            : saving
              ? tx("settings:features.priorityTab.saving")
              : tx("common:actions.save")}
        </button>
      </div>

      {chosen && (
        <div className="text-xs text-muted-foreground">
          <FeatureTrans
            ns="settings"
            i18nKey="features.priorityTab.inheritsPart0Part0ConcurrentRequestsPart1Part1Retries"
            components={{
              part0: <strong />,
              part1: <strong />,
              part2: (
                <Link to="/settings/analysis/providers" className="underline" />
              ),
            }}
            values={{
              value0: chosen.max_concurrent,
              value1: chosen.max_retries,
              value2: chosen.name,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Translation defaults card ────────────────────────────────────

function TranslationDefaultsCard({
  llm,
  ocr,
}: {
  llm: LlmProvider[];
  ocr: OcrProvider[];
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
  const { toast } = useToast();
  const [ocrId, setOcrId] = useState("");
  const [llmId, setLlmId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get("/settings/translation-defaults")
      .then((res) => {
        if (res.data) {
          setOcrId(res.data.ocr_provider_id || "");
          setLlmId(res.data.llm_provider_id || "");
        }
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/translation-defaults", {
        ocr_provider_id: ocrId,
        llm_provider_id: llmId,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      toast({
        title: message("feedback.failedToSaveTranslationDefaults"),
        description: getErrorMessage(e, message("errors:unexpected")),
        variant: "error",
      });
    }
    setSaving(false);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {tx("settings:features.priorityTab.translationDefaults")}
        </span>
        <span className="text-xs text-muted-foreground">
          {tx(
            "settings:features.priorityTab.usedWhenAdminsOrDoctorsTranslateADocument",
          )}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] items-end">
        <label className="space-y-1 block">
          <span className="text-xs font-medium">
            {tx("settings:features.priorityTab.ocrProvider")}
          </span>
          <select
            value={ocrId}
            onChange={(e) => setOcrId(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">
              {tx("settings:features.priorityTab.firstEnabled")}
            </option>
            {ocr.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 block">
          <span className="text-xs font-medium">
            {tx("settings:features.priorityTab.llmProvider")}
          </span>
          <select
            value={llmId}
            onChange={(e) => setLlmId(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">
              {tx("settings:features.priorityTab.firstEnabled")}
            </option>
            {llm.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50 whitespace-nowrap coarse:min-h-11"
        >
          {saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saved
            ? tx("common:messages.saved")
            : saving
              ? tx("settings:features.priorityTab.saving")
              : tx("common:actions.save")}
        </button>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none text-foreground/80 hover:text-foreground">
          {tx("settings:features.priorityTab.howTheseDefaultsAreUsed")}
        </summary>
        <div className="mt-2 space-y-1">
          <p>
            <FeatureTrans
              ns="settings"
              i18nKey="features.priorityTab.theseProvidersAreUsedForEveryTranslateAction"
              components={{ part0: <em /> }}
              values={{}}
            />
          </p>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li>
              {tx(
                "settings:features.priorityTab.aOneOffPickFromTheAdminTranslate",
              )}
            </li>
            <li>
              {tx(
                "settings:features.priorityTab.thePerSharePreferenceSavedWhenCreatingA",
              )}
            </li>
            <li>
              <FeatureTrans
                ns="settings"
                i18nKey="features.priorityTab.part0TheseSettingsPart0UsedWheneverNeitherOf"
                components={{ part0: <strong /> }}
                values={{}}
              />
            </li>
            <li>
              {tx(
                "settings:features.priorityTab.theFirstEnabledEntryInThePriorityList",
              )}
            </li>
          </ol>
          <p>
            {tx("settings:features.priorityTab.setTheseToPinASpecificOcrLlm")}
          </p>
        </div>
      </details>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────

export default function PriorityTab() {
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
  const {
    data: credData,
    error: credErr,
    refetch: refetchCred,
  } = useCredentials();
  const { data: llmData, refetch: refetchLlm } = useLlmProviders();
  const { data: visionData, refetch: refetchVision } = useVisionProviders();
  const { data: ocrData, refetch: refetchOcr } = useOcrProviders();
  const credentials: Credential[] = Array.isArray(credData) ? credData : [];
  const llm = useMemo(() => asSorted(llmData), [llmData]) as LlmProvider[];
  const vision = useMemo(
    () => asSorted(visionData),
    [visionData],
  ) as VisionLlmProvider[];
  const ocr = useMemo(() => asSorted(ocrData), [ocrData]) as OcrProvider[];

  useEffect(() => {
    if (credErr)
      toast({
        title: message("feedback.failedToLoadRouting"),
        variant: "error",
      });
  }, [credErr, toast]);

  const reloadAll = async () => {
    await Promise.all([
      refetchCred(),
      refetchLlm(),
      refetchVision(),
      refetchOcr(),
    ]);
  };

  const persistLlm = async (next: LlmProvider[]) => {
    await api.put("/settings/llm-providers", next);
    await reloadAll();
  };
  const persistVision = async (next: VisionLlmProvider[]) => {
    await api.put("/settings/vision-providers", next);
    await reloadAll();
  };
  const persistOcr = async (next: OcrProvider[]) => {
    await api.put("/settings/ocr-providers", next);
    await reloadAll();
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <FeatureTrans
          ns="settings"
          i18nKey="features.priorityTab.part0PriorityPart0ControlsWhichModelIsTried"
          components={{
            part0: <strong />,
            part1: (
              <Link to="/settings/analysis/providers" className="underline" />
            ),
          }}
          values={{}}
        />
      </div>

      <GeneralLlmCard credentials={credentials} llm={llm} />

      <TranslationDefaultsCard llm={llm} ocr={ocr} />

      <PrioritySection
        title={tx(
          "settings:features.priorityTab.llmPriorityDocumentExtractionClassification",
        )}
        icon={Brain}
        items={llm}
        credentials={credentials}
        describe={(p) => p.model || ""}
        onReorder={persistLlm}
        onToggle={async (id) =>
          persistLlm(
            llm.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
          )
        }
        emptyMessage={tx(
          "settings:features.priorityTab.noLlmModelsAddOneUnderProviders",
        )}
      />

      <PrioritySection
        title={tx(
          "settings:features.priorityTab.visionLlmPrioritySinglePassPageExtraction",
        )}
        icon={Eye}
        items={vision}
        credentials={credentials}
        describe={(p) => p.model || ""}
        onReorder={persistVision}
        onToggle={async (id) =>
          persistVision(
            vision.map((p) =>
              p.id === id ? { ...p, enabled: !p.enabled } : p,
            ),
          )
        }
        emptyMessage={tx(
          "settings:features.priorityTab.noVisionLlmModelsConfigured",
        )}
      />

      <PrioritySection
        title={tx("settings:features.priorityTab.ocrPriority")}
        icon={ScanText}
        items={ocr}
        credentials={credentials}
        describe={(p) =>
          p.type === "llm_vision" ? `llm_vision · ${p.llm_model || ""}` : p.type
        }
        onReorder={persistOcr}
        onToggle={async (id) =>
          persistOcr(
            ocr.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
          )
        }
        emptyMessage={tx(
          "settings:features.priorityTab.noOcrEnginesConfigured",
        )}
      />
    </div>
  );
}

function asSorted<T extends AnyEntry>(data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return ([...data] as T[]).sort(
    (a, b) => (a.priority || 0) - (b.priority || 0),
  );
}
