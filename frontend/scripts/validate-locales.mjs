import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function flatten(value, path, errors, result = {}) {
  if (typeof value === "string") {
    if (!value.trim()) errors.push(`${path}: empty translation`);
    result[path] = value;
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    if (!Object.keys(value).length) errors.push(`${path}: empty resource object`);
    for (const [key, child] of Object.entries(value)) {
      if (/[.:]/.test(key)) errors.push(`${path}.${key}: keys cannot contain dots or colons`);
      flatten(child, `${path}.${key}`, errors, result);
    }
  } else {
    errors.push(`${path}: expected an object or string`);
  }
  return result;
}

function variables(text) {
  return [...new Set([...text.matchAll(/{{-?\s*([^},\s]+)(?:[^}]*?)}}/g)]
    .map((match) => match[1]))].sort().join(",");
}

/** Exported for synthetic failure tests. Both supported locales use one/other. */
export function validateResources(resources) {
  const errors = [];
  const flattened = {};
  for (const locale of ["en", "de"]) {
    flattened[locale] = flatten(resources[locale], locale, errors);
    const entries = flattened[locale];
    for (const [key, value] of Object.entries(entries)) {
      if (!pluralSuffix.test(key)) continue;
      const base = key.replace(pluralSuffix, "");
      for (const category of new Intl.PluralRules(locale).resolvedOptions().pluralCategories) {
        const variant = `${base}_${category}`;
        if (!(variant in entries)) errors.push(`${variant}: missing plural form`);
        else if (variables(value) !== variables(entries[variant])) {
          errors.push(`${variant}: inconsistent plural placeholders`);
        }
      }
    }
  }
  const en = Object.fromEntries(Object.entries(flattened.en).map(([k, v]) => [k.slice(3), v]));
  const de = Object.fromEntries(Object.entries(flattened.de).map(([k, v]) => [k.slice(3), v]));
  for (const key of new Set([...Object.keys(en), ...Object.keys(de)])) {
    if (!(key in en)) errors.push(`en.${key}: missing translation`);
    else if (!(key in de)) errors.push(`de.${key}: missing translation`);
    else if (variables(en[key]) !== variables(de[key])) {
      errors.push(`de.${key}: placeholders differ from English`);
    }
  }
  return errors;
}

export function loadResources(directory = new URL("../src/i18n/locales/", import.meta.url)) {
  return Object.fromEntries(["en", "de"].map((locale) => {
    const path = new URL(`${locale}/`, directory);
    return [locale, Object.fromEntries(readdirSync(path).filter((name) => name.endsWith(".json"))
      .map((name) => {
        try {
          return [name.slice(0, -5), JSON.parse(readFileSync(new URL(name, path), "utf8"))];
        } catch (error) {
          throw new Error(`${locale}/${name}: ${error.message}`);
        }
      }))];
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = validateResources(loadResources());
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("English/German translation resources are valid.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
