import { defineConfig } from "vitest/config";

// The SDK harness loads its optional cron-parser peer even for plugins with no
// schedules. This plugin does not use schedules, so give its backend tests the
// tiny API the harness validates against without adding an unrelated package.
const cronParserHarnessStub = {
  name: "cron-parser-harness-stub",
  resolveId(id: string) {
    return id === "cron-parser" ? "\0cron-parser-harness-stub" : undefined;
  },
  load(id: string) {
    return id === "\0cron-parser-harness-stub"
      ? "export const CronExpressionParser = { parse() {} };"
      : undefined;
  },
};

export default defineConfig({
  plugins: [cronParserHarnessStub],
  resolve: {
    alias: { "cron-parser": "\0cron-parser-harness-stub" },
  },
  test: {
    server: { deps: { inline: ["@get-bb/plugin-sdk"] } },
    silent: "passed-only",
    name: "bb-plugin-thread-inbox",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
  },
});
