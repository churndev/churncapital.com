import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

test("the static asset directory is only HTML, CSS, and JS", () => {
  const files = walk("public").sort();
  assert.deepEqual(files, ["public/app.js", "public/index.html", "public/plan.js", "public/styles.css"]);
  const homepage = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(homepage.includes("desk."), false);
  assert.equal(homepage.includes("top10."), false);
  assert.match(homepage, /https:\/\/assets\.churncapital\.com\/icons\/favicon\.svg/);
  assert.match(homepage, /https:\/\/assets\.churncapital\.com\/home\/manifest\.json/);
});
