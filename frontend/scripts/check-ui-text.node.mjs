import { test } from "node:test";
import assert from "node:assert/strict";
import { findUntranslatedUiText } from "./check-ui-text.mjs";

test("flags newly introduced literal presentation text", () => {
  const findings = findUntranslatedUiText(`
    const options = [{ value: "unchanged_api_value", label: "New option" }];
    function Example() { return <button title="New tooltip" aria-label="New action">New button</button>; }
  `);
  assert.deepEqual(
    findings.map((f) => f.text),
    ["New option", "New tooltip", "New action", "New button"],
  );
});
test("permits keys, source data, technical examples, styles, and documented names", () => {
  assert.deepEqual(
    findUntranslatedUiText(`
    const options = [{ value: "unchanged_api_value", labelKey: "common:actions.save" }];
    function Example() { return <div className="flex gap-2"><img alt="Asclepius" />
      <input placeholder="https://example.com/endpoint" /><p>{document.original_filename}</p>
      <button>{t("actions.save")}</button><span>English</span><span>LLM</span></div>; }
  `),
    [],
  );
});
test("prevents translated option values and remount keys", () => {
  const findings = findUntranslatedUiText(`
    function Example() { return <option key={enumLabel("language", lang)} value={enumLabel("language", lang)}>{enumLabel("language", lang)}</option>; }
  `);
  assert.equal(findings.length, 2);
  assert.match(findings[0].text, /Keep key independent/);
  assert.match(findings[1].text, /Keep value independent/);
});
