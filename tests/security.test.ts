import test from "node:test";
import assert from "node:assert/strict";
import { highSecurityFindings } from "../scripts/check-sarif.mjs";
import { assertLoopback, localSettings } from "../local/config.mjs";
import { readFile } from "node:fs/promises";
import { loopbackSpec } from "../local/loopback.mjs";

test("SAST gate rejects missing reports and detects high severity results", () => {
  assert.throws(() => highSecurityFindings({}), /Missing/);
  const report = {
    runs: [
      {
        tool: {
          driver: {
            rules: [
              {
                id: "test/injection",
                properties: { "security-severity": "9.1" },
              },
            ],
          },
        },
        results: [{ ruleId: "test/injection" }],
      },
    ],
  };
  assert.deepEqual(highSecurityFindings(report), ["test/injection"]);
  assert.deepEqual(
    highSecurityFindings({ runs: [{ ...report.runs[0], results: [] }] }),
    [],
  );
  assert.throws(
    () => highSecurityFindings({ runs: [{ results: [] }] }),
    /metadata/,
  );
});
test("SAST gate resolves CodeQL query-pack rule metadata even when the result has no level", () => {
  const report = {
    runs: [
      {
        tool: {
          driver: { rules: [] },
          extensions: [
            {
              rules: [
                { id: "test/high", properties: { "security-severity": "8.1" } },
              ],
            },
          ],
        },
        results: [
          {
            ruleId: "test/high",
            rule: { index: 0, toolComponent: { index: 0 } },
          },
        ],
      },
    ],
  };
  assert.deepEqual(highSecurityFindings(report), ["test/high"]);
  report.runs[0].tool.extensions[0].rules[0].properties["security-severity"] =
    "5.0";
  assert.deepEqual(highSecurityFindings(report), []);
});
test("local test account configuration cannot target a cloud or non-loopback endpoint", () => {
  assert.equal(
    assertLoopback("http://127.0.0.1:54321", 54321),
    "http://127.0.0.1:54321",
  );
  for (const url of [
    "https://example.supabase.co",
    "http://192.168.1.10:54321",
    "http://127.0.0.1:54321.evil.test",
    "http://user:password@127.0.0.1:54321",
    "http://127.0.0.1:54322",
  ]) {
    assert.throws(() => assertLoopback(url, 54321));
  }
  assert.throws(() =>
    localSettings({
      LOCAL_API_URL: "http://127.0.0.1:54321",
      LOCAL_TEST_EMAIL: "real@example.com",
    }),
  );
});
test("the local credential adapter is absent from the production OAuth implementation", async () => {
  const production = await readFile(
    new URL("../src/lib/oauth.ts", import.meta.url),
    "utf8",
  );
  assert.ok(/provider:\s*['"]google['"]/.test(production));
  assert.ok(
    !production.includes("signInWithPassword") &&
      !production.includes("__local/test-user"),
  );
});
test("Docker port restriction refuses other projects and preserves the local DB volume", () => {
  const container = {
    Config: { Labels: { "com.supabase.cli.project": "another-project" } },
  };
  assert.throws(() => loopbackSpec(container), /another project/);
  container.Config.Labels["com.supabase.cli.project"] = "playnext-local";
  container.HostConfig = {
    Binds: ["local-db:/var/lib/postgresql/data"],
    PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "54322" }] },
  };
  container.NetworkSettings = {
    Networks: {
      "playnext-local": { IPAddress: "172.30.0.2", Aliases: ["db"] },
    },
  };
  const spec = loopbackSpec(container);
  assert.equal(spec.HostConfig.PortBindings["5432/tcp"][0].HostIp, "127.0.0.1");
  assert.deepEqual(spec.HostConfig.Binds, container.HostConfig.Binds);
  assert.equal(
    container.HostConfig.PortBindings["5432/tcp"][0].HostIp,
    "0.0.0.0",
  );
});

test("production cannot enable local sign-in or leak a server credential into client configuration", async () => {
  const names = [
    "VERCEL",
    "PLAYNEXT_LOCAL_TEST",
    "LOCAL_API_URL",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ];
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.VERCEL = "1";
    process.env.PLAYNEXT_LOCAL_TEST = "true";
    process.env.LOCAL_API_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_synthetic";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_synthetic";
    const { getClientConfig } = await import("../src/server/config.ts");
    const config = getClientConfig();
    assert.equal(config.local, false);
    assert.deepEqual(Object.keys(config).sort(), [
      "local",
      "supabaseKey",
      "supabaseUrl",
    ]);
    assert.ok(!JSON.stringify(config).includes("sb_secret_synthetic"));
    const { POST } = await import("../src/app/api/local/sign-in/route.ts");
    assert.equal(
      (
        await POST(
          new Request("http://127.0.0.1:4173/api/local/sign-in", {
            method: "POST",
          }),
        )
      ).status,
      404,
    );
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_secret_synthetic";
    assert.throws(getClientConfig, /public Supabase key/);
  } finally {
    for (const name of names)
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
  }
});
