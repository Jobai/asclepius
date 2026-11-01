/** Candidate inventory, not an automatic translator: review context before migration. */
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const candidates = [];
const attributes = new Set(["title", "label", "placeholder", "aria-label", "alt", "description", "confirmText", "cancelText"]);
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["i18n", "api", "test"].includes(entry.name)) scan(path);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      let kind;
      if (ts.isJsxText(node)) kind = "jsx-text";
      else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const parent = node.parent;
        if (ts.isJsxAttribute(parent) && attributes.has(parent.name.getText(source))) kind = "attribute";
        else if (ts.isPropertyAssignment(parent) && attributes.has(parent.name.getText(source).replace(/["']/g, ""))) kind = "message-property";
        else if (ts.isJsxExpression(parent)) kind = "jsx-expression";
        else if (ts.isReturnStatement(parent) || ts.isConditionalExpression(parent)) kind = "helper-or-conditional";
        else if (ts.isCallExpression(parent) && /(?:setError|toast|confirm|Error)$/.test(parent.expression.getText(source))) kind = "message-call";
      } else if (ts.isTemplateExpression(node)) kind = "template-review";
      if (kind) {
        const text = (ts.isJsxText(node) ? node.getText(source) : node.text ?? node.getText(source)).replace(/\s+/g, " ").trim();
        if (/[A-Za-z]/.test(text)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          candidates.push({ file: relative(root, path).replaceAll("\\", "/"), line: line + 1, kind, text });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
scan(root);
console.log(JSON.stringify(candidates, null, 2));
