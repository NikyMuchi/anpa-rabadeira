/**
 * Automated Regression Test Suite for Production CMS Guard & Preview Security
 * Functionally tests the browser security guard in admin/index.html across:
 * - Canonical production (permitted)
 * - Netlify Deploy Previews (strictly blocked)
 * - Localhost / 127.0.0.1 (strictly blocked against real production repo)
 * - Untrusted origins (strictly blocked)
 * - Token sanitization from localStorage
 * - Execution order (guard in <head> before Decap script)
 * - Help Centre link availability in header
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

function runGuardSecurityTests() {
  console.log("=== Executing Production CMS Guard & Preview Security Tests ===\n");
  let passed = 0;
  let failed = 0;

  function test(description, fn) {
    try {
      fn();
      console.log(`  ✓ ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${description}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  const adminHtmlPath = path.join(__dirname, "..", "admin", "index.html");
  assert(fs.existsSync(adminHtmlPath), "admin/index.html must exist");
  const html = fs.readFileSync(adminHtmlPath, "utf8");

  // 1. Structural Execution Order Verification
  test("Guard script is placed in <head> before decap-cms script", () => {
    const headEndIdx = html.indexOf("</head>");
    const guardMatch = html.match(/<script>[\s\S]*?Strictly restrict production-writing Decap CMS[\s\S]*?<\/script>/);
    assert(guardMatch, "Guard script must exist in admin/index.html");
    const guardIdx = guardMatch.index;
    const decapScriptIdx = html.indexOf("decap-cms.js");

    assert(guardIdx < headEndIdx, "Guard script must be in <head> before body content");
    assert(guardIdx < decapScriptIdx, "Guard script must execute BEFORE decap-cms.js is loaded");
  });

  // Extract the executable guard code
  const guardScriptCode = html.match(/<script>\s*(\/\* Safeguard:[\s\S]*?)\s*<\/script>/)[1];

  function createMockEnvironment(hostname, initialTokens = {}) {
    const mockStorage = { ...initialTokens };
    const eventListeners = {};
    const mockRoot = { innerHTML: "" };

    const mockWindow = {
      location: { hostname },
      CMS_MANUAL_INIT: undefined,
      addEventListener: function (event, handler) {
        eventListeners[event] = handler;
      },
    };

    const mockDocument = {
      getElementById: function (id) {
        if (id === "nc-root") return mockRoot;
        return null;
      },
    };

    const mockLocalStorage = {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => { mockStorage[key] = String(val); },
      removeItem: (key) => { delete mockStorage[key]; },
    };

    // Execute the guard in mock context
    const fn = new Function("window", "document", "localStorage", guardScriptCode);
    fn(mockWindow, mockDocument, mockLocalStorage);

    return {
      window: mockWindow,
      document: mockDocument,
      localStorage: mockLocalStorage,
      mockRoot,
      triggerDomContentLoaded: () => {
        if (eventListeners["DOMContentLoaded"]) {
          eventListeners["DOMContentLoaded"]();
        }
      },
    };
  }

  // 2. Canonical Production Permitted
  test("Canonical production (anpa-rabadeira.netlify.app) permits CMS initialisation", () => {
    const env = createMockEnvironment("anpa-rabadeira.netlify.app", {
      "decap-cms-user": "mock_valid_token_xyz",
    });

    assert.strictEqual(env.window.CMS_MANUAL_INIT, undefined, "CMS_MANUAL_INIT must not be forced to true in production");
    assert.strictEqual(env.localStorage.getItem("decap-cms-user"), "mock_valid_token_xyz", "Valid production tokens must not be removed");
    env.triggerDomContentLoaded();
    assert.strictEqual(env.mockRoot.innerHTML, "", "#nc-root must remain clean for Decap CMS mounting");
  });

  // 3. Netlify Deploy Previews Strictly Blocked
  test("Netlify Deploy Previews strictly inhibit CMS, purge stored tokens, and display warning", () => {
    const previewHosts = [
      "deploy-preview-1--anpa-rabadeira.netlify.app",
      "deploy-preview-42--anpa-rabadeira.netlify.app",
      "deploy-preview-999--anpa-rabadeira.netlify.app",
    ];

    for (const host of previewHosts) {
      const env = createMockEnvironment(host, {
        "decap-cms-user": "stale_production_token",
        "netlify-cms-user": "stale_legacy_token",
      });

      assert.strictEqual(env.window.CMS_MANUAL_INIT, true, "CMS_MANUAL_INIT must be set to true to block Decap auto-init");
      assert.strictEqual(env.localStorage.getItem("decap-cms-user"), null, "decap-cms-user must be purged from preview");
      assert.strictEqual(env.localStorage.getItem("netlify-cms-user"), null, "netlify-cms-user must be purged from preview");

      env.triggerDomContentLoaded();
      assert(env.mockRoot.innerHTML.includes("Acceso CMS restrinxido en vistas previas"), "Blocking message must be rendered into #nc-root");
      assert(env.mockRoot.innerHTML.includes("https://anpa-rabadeira.netlify.app/admin/"), "Safe link to production must be provided");
    }
  });

  // 4. Localhost Strictly Blocked against Production Writes
  test("Localhost / 127.0.0.1 strictly blocks direct writes to production repository", () => {
    for (const host of ["localhost", "127.0.0.1"]) {
      const env = createMockEnvironment(host, {
        "decap-cms-user": "production_token_copied_locally",
      });

      assert.strictEqual(env.window.CMS_MANUAL_INIT, true, "CMS_MANUAL_INIT must be set to true on localhost");
      assert.strictEqual(env.localStorage.getItem("decap-cms-user"), null, "Production tokens must be purged on localhost");

      env.triggerDomContentLoaded();
      assert(env.mockRoot.innerHTML.includes("Acceso CMS local bloqueado"), "Local blocking message must explain isolation");
      assert(env.mockRoot.innerHTML.includes("local_backend"), "Must inform developer that local proxy is required");
    }
  });

  // 5. Untrusted Domain / Suffix Spoofing Strictly Blocked
  test("Suffix spoofing (e.g. anpa-rabadeira.netlify.app.evil.com) is blocked", () => {
    const env = createMockEnvironment("anpa-rabadeira.netlify.app.evil.com", {
      "decap-cms-user": "leaked_token",
    });

    assert.strictEqual(env.window.CMS_MANUAL_INIT, true);
    assert.strictEqual(env.localStorage.getItem("decap-cms-user"), null);
    env.triggerDomContentLoaded();
    assert(env.mockRoot.innerHTML.includes("Acceso CMS restrinxido en vistas previas"));
  });

  // 6. Help Centre Link remains Accessible in Admin Header
  test("Help Centre link in admin header remains rendered and accessible in all environments", () => {
    assert(html.includes('<a href="/admin/manual/" class="admin-header__link"'), "Manual link must be present in header");
    assert(html.includes('target="_blank"'), "Manual link must open in new tab");
    assert(html.includes('Panel de Administración — ANPA Ensino Rabadeira'), "Institutional brand must be visible");
  });

  console.log(`\nGuard Security Test Summary: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runGuardSecurityTests();
