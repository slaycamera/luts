#!/usr/bin/env node
/**
 * Validates every .cube file in luts/:
 *   - required LUT_3D_SIZE header (32, 33 or 65)
 *   - exactly size³ data rows
 *   - every row holds 3 floats inside the declared domain
 *
 * Exits non-zero when a problem is found, so CI can gate pull requests.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LUT_DIR = join(ROOT, "luts");

const SUPPORTED_SIZES = new Set([32, 33, 65]);

function parseCube(text) {
  const meta = { size: null, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
  const errors = [];
  const data = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const key = parts[0];

    if (key === "TITLE") {
      meta.title = line.slice("TITLE".length).trim().replace(/^"|"$/g, "");
    } else if (key === "LUT_3D_SIZE") {
      const size = Number(parts[1]);
      if (!SUPPORTED_SIZES.has(size)) {
        errors.push(`unsupported LUT_3D_SIZE "${parts[1]}" (expected 32, 33 or 65)`);
      }
      meta.size = size;
    } else if (key === "DOMAIN_MIN") {
      meta.domainMin = parts.slice(1).map(Number);
    } else if (key === "DOMAIN_MAX") {
      meta.domainMax = parts.slice(1).map(Number);
    } else if (key === "LUT_1D_SIZE") {
      errors.push("1D LUTs are not supported in this repo");
    } else {
      const [r, g, b] = parts.map(Number);
      if (![r, g, b].every((v) => Number.isFinite(v))) {
        errors.push(`non-numeric data row: "${line}"`);
        continue;
      }
      data.push([r, g, b]);
    }
  }

  if (meta.size === null) {
    errors.push("missing LUT_3D_SIZE header");
    return { meta, errors, data };
  }

  const expected = meta.size ** 3;
  if (data.length !== expected) {
    errors.push(`expected ${expected} data rows (${meta.size}³), found ${data.length}`);
  }

  const inDomain = (v, i) =>
    v >= meta.domainMin[i] - 1e-6 && v <= meta.domainMax[i] + 1e-6;
  const bad = data.find((row) => !row.every((v, i) => inDomain(v, i)));
  if (bad) errors.push(`data row outside domain: "${bad.join(" ")}"`);

  return { meta, errors, data };
}

const entries = (await readdir(LUT_DIR)).filter((f) => f.endsWith(".cube")).sort();

if (entries.length === 0) {
  console.error("no .cube files found in luts/");
  process.exit(1);
}

let failed = 0;
console.log(`validating ${entries.length} LUTs in luts/\n`);

for (const file of entries) {
  const { meta, errors } = parseCube(await readFile(join(LUT_DIR, file), "utf8"));
  if (errors.length > 0) {
    failed++;
    console.log(`FAIL  ${file}`);
    for (const error of errors) console.log(`      – ${error}`);
  } else {
    console.log(`ok    ${file}  ·  ${meta.size}³  ·  "${meta.title ?? "untitled"}"`);
  }
}

console.log();
if (failed > 0) {
  console.error(`${failed} of ${entries.length} LUTs failed validation`);
  process.exit(1);
}
console.log("all LUTs valid");
