/**
 * Automated Unit Test Suite for Decap CMS Netlify OAuth Gatekeeper (Production)
 * Tests CSRF state protection, cookie lifecycle, canonical production allowlist, Deploy Preview exclusion,
 * window.opener source validation, and secret protection.
 */

const assert = require("assert");
const auth = require("../netlify/functions/auth");
const callback = require("../netlify/functions/callback");

async function runOAuthTests() {
  let passed = 0;
  let failed = 0;

  async function asyncTest(description, fn) {
    try {
      await fn();
      console.log(`  ✓ ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${description}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  console.log("=== Executing OAuth Gatekeeper Security & Origin Validation Tests (Production) ===\n");

  // Setup mock environment variables (never real secrets)
  process.env.GITHUB_CLIENT_ID = "mock_client_id_123";
  process.env.GITHUB_CLIENT_SECRET = "mock_client_secret_xyz";

  // Test 1: /auth fails safely if GITHUB_CLIENT_ID is not configured
  await asyncTest("auth.js fails safely if GITHUB_CLIENT_ID is unset", async () => {
    const savedClientId = process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_ID;
    const res = await auth.handler({ headers: { host: "anpa-rabadeira.netlify.app" } });
    process.env.GITHUB_CLIENT_ID = savedClientId;
    assert.strictEqual(res.statusCode, 500);
    assert(res.body.includes("GITHUB_CLIENT_ID non configurado"));
  });

  // Test 2: /auth sets cryptographically random 32-byte state cookie and redirects to GitHub
  await asyncTest("auth.js generates 32-byte cryptographic state, sets cookie and redirects", async () => {
    const res = await auth.handler({
      headers: { host: "anpa-rabadeira.netlify.app", "x-forwarded-proto": "https" },
    });
    assert.strictEqual(res.statusCode, 302);
    const location = res.headers.Location;
    assert(location.startsWith("https://github.com/login/oauth/authorize?"));
    assert(location.includes("client_id=mock_client_id_123"));
    assert(location.includes("redirect_uri=" + encodeURIComponent("https://anpa-rabadeira.netlify.app/callback")));
    assert(location.includes("scope=" + encodeURIComponent("public_repo,read:user")));

    // Verify Set-Cookie header contains 64-char hex state, HttpOnly, SameSite=Lax, Secure
    const cookie = res.headers["Set-Cookie"];
    assert(cookie, "Set-Cookie header must be present");
    const match = cookie.match(/decap_oauth_state=([a-f0-9]{64})/);
    assert(match, "Cookie must contain 32-byte hex state (64 hex characters)");
    assert(cookie.includes("HttpOnly"), "Cookie must have HttpOnly flag");
    assert(cookie.includes("SameSite=Lax"), "Cookie must have SameSite=Lax flag");
    assert(cookie.includes("Secure"), "Cookie must have Secure flag when proto is https");
  });

  // Test 3: /callback rejects request if state parameter is missing
  await asyncTest("callback.js returns 403 when state is missing from query", async () => {
    const res = await callback.handler({
      headers: { cookie: "decap_oauth_state=abcdef123456" },
      queryStringParameters: { code: "some_code" },
    });
    assert.strictEqual(res.statusCode, 403);
    assert(res.body.includes("CSRF"));
    assert(res.headers["Set-Cookie"].includes("Expires=Thu, 01 Jan 1970 00:00:00 GMT"));
  });

  // Test 4: /callback rejects request if state cookie is missing
  await asyncTest("callback.js returns 403 when state cookie is missing", async () => {
    const res = await callback.handler({
      headers: {},
      queryStringParameters: { code: "some_code", state: "abcdef123456" },
    });
    assert.strictEqual(res.statusCode, 403);
    assert(res.body.includes("CSRF"));
  });

  // Test 5: /callback rejects request if state parameter does not match state cookie (CSRF attack)
  await asyncTest("callback.js returns 403 when state does not match cookie", async () => {
    const res = await callback.handler({
      headers: { cookie: "decap_oauth_state=correct_state_123" },
      queryStringParameters: { code: "some_code", state: "tampered_attacker_state_xyz" },
    });
    assert.strictEqual(res.statusCode, 403);
    assert(res.body.includes("CSRF"));
    assert(res.headers["Set-Cookie"].includes("Expires=Thu, 01 Jan 1970 00:00:00 GMT"));
  });

  // Test 6: /callback rejects request if authorization code is missing
  await asyncTest("callback.js returns 400 when authorization code is missing", async () => {
    const res = await callback.handler({
      headers: { cookie: "decap_oauth_state=matching_state_456" },
      queryStringParameters: { state: "matching_state_456" },
    });
    assert.strictEqual(res.statusCode, 400);
    assert(res.body.includes("Non se recibiu o código de autorización"));
  });

  // Test 7: callback.js embeds exact canonical production allowlist and enforces e.source === window.opener
  await asyncTest("callback.js HTML embeds canonical production allowlist and enforces e.source === window.opener", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      json: async () => ({ access_token: "mock_token_sample", token_type: "bearer" }),
    });

    const res = await callback.handler({
      headers: {
        host: "anpa-rabadeira.netlify.app",
        "x-forwarded-proto": "https",
        cookie: "decap_oauth_state=valid_state",
      },
      queryStringParameters: { code: "valid_code", state: "valid_state" },
    });

    global.fetch = originalFetch;

    assert.strictEqual(res.statusCode, 200);

    // Verify exact canonical allowlist in response
    assert(res.body.includes('"https://anpa-rabadeira.netlify.app"'), "Missing canonical production in allowlist");
    assert(!res.body.includes("deploy-preview"), "Deploy previews must strictly be excluded from production allowlist");
    assert(!res.body.includes("anpa-rabadeira-cms-test"), "Sandbox domain must not be in production allowlist");

    // Verify origin and source checks
    assert(res.body.includes("allowedOrigins.indexOf(e.origin) === -1"), "Missing exact allowlist origin check");
    assert(res.body.includes("e.source !== window.opener"), "Missing e.source === window.opener check");

    // Verify targeted postMessage (no wildcard for credentials)
    assert(res.body.includes("window.opener.postMessage("), "Missing opener.postMessage call");
    assert(res.body.includes(",\n          e.origin\n        )"), "Credentials must be sent only to e.origin, never wildcard");

    // Verify secret is not exposed in HTML
    assert(!res.body.includes("mock_client_secret_xyz"), "Client secret must never be exposed");

    // Directly verify the extracted browser allowlist array from rendered HTML
    const matchArray = res.body.match(/var allowedOrigins = (\[[\s\S]*?\]);/);
    assert(matchArray, "allowedOrigins array must be extractable from response HTML");
    const extractedOrigins = JSON.parse(matchArray[1]);
    assert.deepStrictEqual(extractedOrigins, [
      "https://anpa-rabadeira.netlify.app"
    ], "Extracted browser allowlist must contain strictly the 1 canonical production origin");
  });

  // Test 8: Simulate receiveMessage client-side logic across all test cases
  await asyncTest("Client-side receiveMessage accepts only canonical production and rejects Deploy Previews & attackers", () => {
    const allowedOrigins = [
      "https://anpa-rabadeira.netlify.app"
    ];

    const mockOpener = {
      messagesSent: [],
      postMessage: function(msg, targetOrigin) {
        this.messagesSent.push({ msg, targetOrigin });
      }
    };

    const mockDifferentWindow = {
      messagesSent: [],
      postMessage: function(msg, targetOrigin) {
        this.messagesSent.push({ msg, targetOrigin });
      }
    };

    function simulateReceiveMessage(event, windowOpener) {
      if (!event || allowedOrigins.indexOf(event.origin) === -1 || event.source !== windowOpener) {
        return false; // Rejected
      }
      windowOpener.postMessage("authorization:github:success:mock_payload", event.origin);
      return true; // Accepted
    }

    // --- POSITIVE TEST CASE (Accepted) ---
    assert.strictEqual(
      simulateReceiveMessage({ origin: "https://anpa-rabadeira.netlify.app", source: mockOpener }, mockOpener),
      true,
      "Canonical production origin must be accepted"
    );
    assert.strictEqual(mockOpener.messagesSent[0].targetOrigin, "https://anpa-rabadeira.netlify.app");

    // --- NEGATIVE TEST CASES (Must be Rejected) ---
    // 1. Deploy Previews -> REJECTED in production
    for (const prNum of [1, 7, 17, 23, 42]) {
      mockOpener.messagesSent = [];
      const previewOrigin = `https://deploy-preview-${prNum}--anpa-rabadeira.netlify.app`;
      assert.strictEqual(
        simulateReceiveMessage({ origin: previewOrigin, source: mockOpener }, mockOpener),
        false,
        `Deploy preview #${prNum} origin must be rejected in production`
      );
      assert.strictEqual(mockOpener.messagesSent.length, 0);
    }

    // 2. Sandbox domain -> REJECTED in production
    assert.strictEqual(
      simulateReceiveMessage({ origin: "https://anpa-rabadeira-cms-test.netlify.app", source: mockOpener }, mockOpener),
      false,
      "Sandbox origin must be rejected in production"
    );

    // 3. Subdomain takeover / prefix spoofing -> REJECTED
    assert.strictEqual(
      simulateReceiveMessage({ origin: "https://anpa-rabadeira.netlify.app.evil.com", source: mockOpener }, mockOpener),
      false,
      "Suffix attack on canonical origin must be rejected"
    );
    assert.strictEqual(
      simulateReceiveMessage({ origin: "https://evil-anpa-rabadeira.netlify.app", source: mockOpener }, mockOpener),
      false,
      "Prefix attack must be rejected"
    );

    // 4. HTTP protocol (insecure origin) -> REJECTED
    assert.strictEqual(
      simulateReceiveMessage({ origin: "http://anpa-rabadeira.netlify.app", source: mockOpener }, mockOpener),
      false,
      "Insecure HTTP origin must be rejected"
    );

    // 5. Origin with different port -> REJECTED
    assert.strictEqual(
      simulateReceiveMessage({ origin: "https://anpa-rabadeira.netlify.app:8080", source: mockOpener }, mockOpener),
      false,
      "Origin with explicit non-default port must be rejected"
    );

    // 6. Origin with path component -> REJECTED
    assert.strictEqual(
      simulateReceiveMessage({ origin: "https://anpa-rabadeira.netlify.app/admin", source: mockOpener }, mockOpener),
      false,
      "Origin with path must be rejected"
    );

    // 7. Legitimate origin but fake/different window as source -> REJECTED
    assert.strictEqual(
      simulateReceiveMessage({ origin: "https://anpa-rabadeira.netlify.app", source: mockDifferentWindow }, mockOpener),
      false,
      "Message from non-opener window must be rejected"
    );
  });

  console.log(`\nOAuth Test Summary: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runOAuthTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
