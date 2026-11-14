import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function parseJsonc(text) {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
  return JSON.parse(stripped);
}

test("production wrangler is assets-only and does not ship the encoder", () => {
  const text = readFileSync("wrangler.jsonc", "utf8");
  const config = parseJsonc(text);
  assert.equal(config.name, "churncapital-com");
  assert.equal(config.main, undefined);
  assert.equal(config.triggers, undefined);
  assert.equal(config.r2_buckets, undefined);
  assert.equal(config.assets.directory, "./public");
  assert.equal(text.includes("MASTERS_BUCKET"), false);
  assert.equal(text.includes("* * * * *"), false);
});

test("drop-in wrangler is a separate worker and is marked disabled", () => {
  const text = readFileSync("workers/dropin/wrangler.jsonc", "utf8");
  const config = parseJsonc(text);
  assert.equal(config.name, "churncapital-dropin");
  assert.notEqual(config.name, "churncapital-com");
  assert.equal(config.main, "index.js");
  assert.deepEqual(config.triggers.crons, ["* * * * *"]);
  assert.equal(config.r2_buckets.find((bucket) => bucket.binding === "MASTERS_BUCKET").bucket_name, "churncapital-masters");
  assert.equal(config.r2_buckets.find((bucket) => bucket.binding === "PUBLIC_BUCKET").bucket_name, "churncapital-assets");
  assert.match(text, /DISABLED — requires Workers Paid/);
  assert.match(text, /Do not deploy/);
});
