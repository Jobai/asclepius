// Vitest global setup: extends `expect` with @testing-library/jest-dom
// matchers (toBeInTheDocument, toHaveAttribute, ...) and auto-cleans the
// rendered DOM between tests. Wired in via the `test.setupFiles` entry in
// vite.config.ts.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { setI18n } from "react-i18next";
import { i18n } from "@/i18n";
import { cleanup } from "@testing-library/react";

beforeEach(async () => {
  setI18n(i18n);
  await i18n.changeLanguage("en");
});

afterEach(() => {
  cleanup();
});
