import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "render-wrangler.mjs");
const TEMPLATE = join(ROOT, "wrangler.template.toml");
const DUMMY_ID = "00000000-0000-4000-8000-000000000000";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "render-wrangler-"));
  copyFileSync(TEMPLATE, join(dir, "wrangler.template.toml"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function render(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
}

describe("render-wrangler", () => {
  it("render-wrangler: writes database id from env", () => {
    const result = render({ D1_DATABASE_ID: DUMMY_ID });
    expect(result.status).toBe(0);
    const toml = readFileSync(join(dir, "wrangler.toml"), "utf8");
    expect(toml).toContain(`database_id = "${DUMMY_ID}"`);
    expect(toml).not.toContain("<D1_DATABASE_ID>");
    expect(result.stdout + result.stderr).not.toContain(DUMMY_ID);
  });

  it.each([
    { label: "missing", env: {} },
    { label: "not a UUID", env: { D1_DATABASE_ID: "not-a-uuid-value" } },
  ])("render-wrangler: exit 78 when D1_DATABASE_ID is $label", ({ env }) => {
    const result = render(env);
    expect(result.status).toBe(78);
    expect(result.stderr).toContain("D1_DATABASE_ID");
    expect(result.stdout + result.stderr).not.toContain("not-a-uuid-value");
    expect(existsSync(join(dir, "wrangler.toml"))).toBe(false);
  });
});
