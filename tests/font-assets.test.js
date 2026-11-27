/**
 * Test Suite: Font Assets & Self-Hosted Typography Integrity
 * Verifies that all required self-hosted fonts (Inter and Outfit) exist,
 * licenses are present, Eleventy passthrough copy is configured,
 * no external Google Fonts requests are introduced, and built assets are complete.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const FONTS_DIR = path.join(ROOT, "src", "fonts");
const CSS_PATH = path.join(ROOT, "src", "css", "style.css");
const ELEVENTY_CONFIG_PATH = path.join(ROOT, ".eleventy.js");
const SITE_FONTS_DIR = path.join(ROOT, "_site", "fonts");

console.log("Running Font Assets & Self-Hosted Typography Tests...\n");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. Required source font files exist with valid sizes
runTest("Required font source files exist in src/fonts", () => {
  const expectedFiles = [
    "inter-latin.woff2",
    "inter-latin-ext.woff2",
    "outfit-latin.woff2",
    "outfit-latin-ext.woff2",
    "INTER-OFL.txt",
    "OUTFIT-OFL.txt",
  ];

  for (const file of expectedFiles) {
    const fullPath = path.join(FONTS_DIR, file);
    assert(fs.existsSync(fullPath), `Font asset missing: ${file}`);
    const stat = fs.statSync(fullPath);
    assert(stat.size > 0, `Font asset is empty: ${file}`);
  }
});

// 2. CSS @font-face URLs match existing files in src/fonts
runTest("All @font-face declarations in style.css point to existing font files", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  const urlMatches = Array.from(css.matchAll(/url\(['"]?\/fonts\/([^'")]+)['"]?\)/g));
  assert(urlMatches.length >= 4, `Expected at least 4 font url references, found ${urlMatches.length}`);

  for (const match of urlMatches) {
    const filename = match[1];
    const fullPath = path.join(FONTS_DIR, filename);
    assert(fs.existsSync(fullPath), `CSS references non-existent font file: /fonts/${filename}`);
  }
});

// 3. Eleventy configuration includes passthrough copy for src/fonts
runTest("Eleventy configuration (.eleventy.js) copies src/fonts to output", () => {
  const config = fs.readFileSync(ELEVENTY_CONFIG_PATH, "utf8");
  const hasPassthrough = config.includes('addPassthroughCopy("src/fonts")') ||
    config.includes("addPassthroughCopy('src/fonts')") ||
    config.includes('"src/fonts": "fonts"');
  assert(hasPassthrough, "Missing addPassthroughCopy for src/fonts in .eleventy.js");
});

// 4. Strict privacy & GDPR: Zero external Google Fonts references
runTest("Zero external Google Fonts references in CSS, layouts or templates", () => {
  function scanForExternalFonts(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "_site") {
          scanForExternalFonts(full);
        }
      } else if (/\.(css|html|njk|md|js)$/i.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        assert(!text.includes("fonts.googleapis.com"), `External Google Fonts link found in: ${full}`);
        assert(!text.includes("fonts.gstatic.com"), `External Google Fonts CDN link found in: ${full}`);
      }
    }
  }
  scanForExternalFonts(path.join(ROOT, "src"));
});

// 5. Build output verification (if _site exists)
runTest("Built assets include all referenced font files in _site/fonts", () => {
  if (fs.existsSync(SITE_FONTS_DIR)) {
    const expectedBuilt = [
      "inter-latin.woff2",
      "inter-latin-ext.woff2",
      "outfit-latin.woff2",
      "outfit-latin-ext.woff2",
    ];
    for (const file of expectedBuilt) {
      const full = path.join(SITE_FONTS_DIR, file);
      assert(fs.existsSync(full), `Built font missing in _site/fonts: ${file}`);
      const stat = fs.statSync(full);
      assert(stat.size > 0, `Built font file is empty: ${file}`);
    }
  }
});

console.log(`\nFont Assets Tests: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
