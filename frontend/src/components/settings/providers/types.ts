import {
  Cloud,
  HardDrive,
  KeyRound,
  Server,
  type LucideIcon,
} from "lucide-react";

export const CREDENTIAL_TYPES = [
  {
    value: "ollama",
    label: "Ollama",
    descriptionKey: "settings:features.extra.providers.descriptions.ollama",
    icon: HardDrive,
    needs_url: true,
    needs_key: false,
  },
  {
    value: "vllm",
    label: "vLLM",
    descriptionKey: "settings:features.extra.providers.descriptions.vllm",
    icon: Server,
    needs_url: true,
    needs_key: true,
  },
  {
    value: "claude",
    label: "Anthropic (Claude)",
    descriptionKey: "settings:features.extra.providers.descriptions.claude",
    icon: Cloud,
    needs_url: false,
    needs_key: true,
  },
  {
    value: "openai",
    label: "OpenAI",
    descriptionKey: "settings:features.extra.providers.descriptions.openai",
    icon: Cloud,
    needs_url: false,
    needs_key: true,
  },
  {
    value: "google_vision",
    label: "Google Vision",
    descriptionKey:
      "settings:features.extra.providers.descriptions.googleVision",
    icon: Cloud,
    needs_url: false,
    needs_key: true,
  },
  {
    value: "tesseract_remote",
    labelKey: "settings:features.extra.remoteTesseract",
    descriptionKey: "settings:features.extra.providers.descriptions.tesseract",
    icon: Server,
    needs_url: true,
    needs_key: false,
  },
] as const;

export function iconForType(t: string): LucideIcon {
  return CREDENTIAL_TYPES.find((x) => x.value === t)?.icon ?? KeyRound;
}

/** Which model kinds (LLM / Vision / OCR) can attach to a credential of the given type. */
export function allowedKindsFor(credType: string): ModelKind[] {
  if (credType === "google_vision" || credType === "tesseract_remote")
    return ["ocr"];
  return ["llm", "vision", "ocr"];
}

export type ModelKind = "llm" | "vision" | "ocr";

export interface AttachedModel {
  kind: ModelKind;
  /** The underlying LLM/Vision/OCR-provider entry id so we can edit/remove. */
  entry_id: string;
  name: string;
  model: string;
  enabled: boolean;
  priority: number;
  timeout: number;
}
