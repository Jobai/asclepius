import { test } from "node:test";
import assert from "node:assert/strict";
import { loadResources, validateResources } from "./validate-locales.mjs";

test("bundled catalogues have matching keys, variables and plural forms", () => {
  assert.deepEqual(validateResources(loadResources()), []);
});

test("reports missing keys, empty values, wrong types and mismatched placeholders", () => {
  const errors = validateResources({
    en: { common: { missing: "Text", blank: "Text", variable: "Hello {{name}}", invalid: "Text" } },
    de: { common: { blank: " ", variable: "Hallo {{person}}", invalid: [] } },
  });
  assert.ok(errors.some((e) => e.includes("de.common.missing: missing")));
  assert.ok(errors.some((e) => e.includes("de.common.blank: empty")));
  assert.ok(errors.some((e) => e.includes("de.common.variable: placeholders differ")));
  assert.ok(errors.some((e) => e.includes("de.common.invalid: expected")));
});

test("detects missing plural variants even when both catalogues omit them", () => {
  const errors = validateResources({ en: { selected_one: "{{count}} item" }, de: { selected_one: "{{count}} Element" } });
  assert.ok(errors.includes("en.selected_other: missing plural form"));
  assert.ok(errors.includes("de.selected_other: missing plural form"));
});

test("interpolation variables can move and use formatting", () => {
  assert.deepEqual(validateResources({ en: { x: "{{name}}: {{count, number}}" }, de: { x: "{{count, number}}: {{name}}" } }), []);
});
