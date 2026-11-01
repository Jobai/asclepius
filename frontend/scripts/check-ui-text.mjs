import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

// This deliberately checks literal presentation boundaries, not medical content,
// enum/API values, CSS, prompts, or diagnostic logs. Dynamic flows have React tests.
const attributes = new Set([
  "title",
  "label",
  "placeholder",
  "aria-label",
  "aria-description",
  "alt",
  "description",
  "confirmText",
  "cancelText",
  "confirmLabel",
  "actionLabel",
  "actionTitle",
  "defaultLabel",
  "emptyLabel",
  "emptyMessage",
  "selectionLabel",
  "translateDisabledReason",
  "shareDisabledReason",
  "hint",
  "caption",
]);
export const intentionalLiterals = {
  Asclepius: "Product name",
  English: "Native language name in the UI-language selector",
  Deutsch: "Native language name in the UI-language selector",
  Ollama: "Provider name",
  vLLM: "Provider name",
  "Anthropic (Claude)": "Provider name",
  OpenAI: "Provider name",
  "Google Vision": "Provider name",
  LLM: "Technical acronym",
  OCR: "Technical acronym",
};
function intentional(text) {
  return (
    Object.hasOwn(intentionalLiterals, text) ||
    /^https?:\/\/\S+$/.test(text) || // Literal example endpoints, never translated.
    /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(text)
  ); // Example email addresses.
}

export function findUntranslatedUiText(sourceText, file = "Example.tsx") {
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const findings = [];
  const visit = (node) => {
    let text;
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    ) {
      const name = node.name.getText(source);
      const tag = node.parent.parent.tagName?.getText(source);
      if (
        (["key", "id", "name"].includes(name) ||
          (name === "value" &&
            [
              "option",
              "input",
              "select",
              "textarea",
              "Input",
              "Select",
            ].includes(tag))) &&
        /\b(?:tx|t|ui|enumLabel)\s*\(/.test(node.initializer.getText(source))
      ) {
        findings.push({
          file,
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
          text: `Keep ${name} independent of UI language; translate only its displayed label`,
        });
      }
    }
    if (ts.isJsxText(node)) text = node.text;
    else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      const parent = node.parent;
      if (
        ts.isJsxAttribute(parent) &&
        attributes.has(parent.name.getText(source))
      )
        text = node.text;
      if (
        ts.isPropertyAssignment(parent) &&
        parent.initializer === node &&
        attributes.has(parent.name.getText(source).replace(/["']/g, ""))
      )
        text = node.text;
    }
    if (text) {
      text = text.replace(/\s+/g, " ").trim();
      if (/[A-Za-z]{2}/.test(text) && !intentional(text)) {
        findings.push({
          file,
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
          text,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

export function checkUiText(root) {
  const findings = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!["api", "i18n", "test"].includes(entry.name)) walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        findings.push(
          ...findUntranslatedUiText(
            readFileSync(path, "utf8"),
            relative(root, path),
          ),
        );
      }
    }
  }
  walk(root);
  return findings;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const findings = checkUiText(
    fileURLToPath(new URL("../src", import.meta.url)),
  );
  if (findings.length) {
    for (const finding of findings)
      console.error(
        `${finding.file}:${finding.line}: untranslated UI text: ${finding.text}`,
      );
    process.exitCode = 1;
  } else
    console.log(
      "UI text coverage check passed (documented literal exceptions only).",
    );
}
