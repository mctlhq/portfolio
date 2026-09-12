// Source-level checks for the footer fix (issue #55, Q2', Part 2):
// src/components/Footer.astro must render the release label and version
// with no colon between them, build the release tag URL from the build-time
// package.json version rather than a literal semver, keep data-release as
// the last attribute on the version anchor (scripts/check-dist.mjs's
// `/data-release>([^<]*)</` assertion depends on that), and point the
// GitHub anchor at this repository rather than the organisation.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const source = readFileSync(path.join(ROOT, 'src/components/Footer.astro'), 'utf8');

test('no colon between the release label and the version', () => {
  assert.doesNotMatch(source, />\s*:/, 'a ">:"-shaped colon was found between markup and text');
  assert.doesNotMatch(source, /\}\s*:/, 'a "}:"-shaped colon was found between an expression and text');
});

test('the release tag URL is built from pkg.version, with no literal semver in the file', () => {
  assert.match(source, /import pkg from ['"]\.\.\/\.\.\/package\.json['"]/);
  assert.match(source, /releaseTagUrl\s*=\s*`https:\/\/github\.com\/mctlhq\/portfolio\/releases\/tag\/\$\{pkg\.version\}`/);
  assert.doesNotMatch(source, /\d+\.\d+\.\d+/, 'found a literal semver-shaped string in Footer.astro');
});

test('the GitHub anchor points at this repository, not the organisation', () => {
  assert.match(source, /<a href="https:\/\/github\.com\/mctlhq\/portfolio">/);
  assert.doesNotMatch(source, /href="https:\/\/github\.com\/mctlhq">/);
});

test('data-release is the final attribute on the version anchor', () => {
  const anchorMatch = source.match(/<a href=\{releaseTagUrl\}[^>]*>/);
  assert.ok(anchorMatch, 'no <a href={releaseTagUrl} ...> element found');
  const tag = anchorMatch![0];
  assert.match(tag, /data-release>$/, `expected data-release to be the last attribute, got: ${tag}`);
});

test('the version anchor renders {pkg.version} as its text content', () => {
  assert.match(source, /<a href=\{releaseTagUrl\} data-release>\{pkg\.version\}<\/a>/);
});
