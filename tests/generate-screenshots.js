/**
 * Visual Verification Screenshot Generator
 * Uses system Chrome to render _site pages in desktop and mobile viewports.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

async function captureScreenshots() {
  console.log('=== Capturing Visual Verification Screenshots using System Chrome ===\n');

  const rootDir = path.resolve(__dirname, '..');
  const siteDir = path.join(rootDir, '_site');
  const outDir = path.join(rootDir, 'tests', 'screenshots');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const pages = [
    { name: 'homepage', file: 'index.html' },
    { name: 'madrugadores', file: 'madrugadores/index.html' },
    { name: 'comedor', file: 'comedor/index.html' },
    { name: 'inscripcion', file: 'inscripcion/index.html' },
    { name: 'extraescolares', file: 'extraescolares/index.html' },
  ];

  // 1. Desktop context (1280x800)
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const desktopPage = await desktopCtx.newPage();

  for (const p of pages) {
    const filePath = 'file:///' + path.join(siteDir, p.file).replace(/\\/g, '/');
    await desktopPage.goto(filePath, { waitUntil: 'load' });
    const outPath = path.join(outDir, `${p.name}-desktop.png`);
    await desktopPage.screenshot({ path: outPath, fullPage: false });
    console.log(`  ✓ Saved desktop screenshot: ${p.name}-desktop.png`);
  }

  // 2. Mobile context (375x667)
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
  });
  const mobilePage = await mobileCtx.newPage();

  for (const p of pages) {
    const filePath = 'file:///' + path.join(siteDir, p.file).replace(/\\/g, '/');
    await mobilePage.goto(filePath, { waitUntil: 'load' });
    const outPath = path.join(outDir, `${p.name}-mobile.png`);
    await mobilePage.screenshot({ path: outPath, fullPage: false });
    console.log(`  ✓ Saved mobile screenshot: ${p.name}-mobile.png`);
  }

  await browser.close();
  console.log('\nAll screenshots captured successfully in tests/screenshots/\n');
}

captureScreenshots().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
