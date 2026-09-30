/**
 * Automated Unit Test Suite for Decap CMS Netlify OAuth Gatekeeper
 * Tests CSRF state protection, cookie lifecycle, origin verification, and error safety.
 */

const assert = require("assert");
const auth = require("../netlify/functions/auth");
const callback = require("../netlify/functions/callback");

async function runOAuthTests() {
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

  console.log("=== Executing OAuth Gatekeeper Security & Logic Tests ===\n");

  // Setup mock environment variables
  process.env.GITHUB_CLIENT_ID = "mock_client_id_123";
  process.env.GITHUB_CLIENT_SECRET = "mock_client_secret_xyz";

  // Test 1: auth.js returns 500 if GITHUB_CLIENT_ID is missing
  await asyncTest("auth.js fails safely if GITHUB_CLIENT_ID is unset", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    const res = await auth.handler({ headers: {} });
    assert.strictEqual(res.statusCode, 500);
    assert(res.body.includes("GITHUB_CLIENT_ID"));
    process.env.GITHUB_CLIENT_ID = "mock_client_id_123";
  });

  // Test 2: auth.js sets secure state cookie and redirects to GitHub
  await asyncTest("auth.js generates 32-byte cryptographic state, sets cookie and redirects", async () => {
    const res = await auth.handler({
      headers: { host: "anpa-rabadeira.netlify.app", "x-forwarded-proto": "https" },
    });
    assert.strictEqual(res.statusCode, 302);
    assert(res.headers.Location.startsWith("https://github.com/login/oauth/authorize"));
    assert(res.headers.Location.includes("client_id=mock_client_id_123"));
    assert(res.headers.Location.includes("scope=public_repo%2Cread%3Auser"));
    assert(res.headers.Location.includes("state="));

    const stateMatch = res.headers.Location.match(/state=([a-f0-9]{64})/);
    assert(stateMatch, "State should be a 64-character hex string");

    const cookieHeader = res.headers["Set-Cookie"];
    assert(cookieHeader.includes(`decap_oauth_state=${stateMatch[1]}`));
    assert(cookieHeader.includes("HttpOnly"));
    assert(cookieHeader.includes("SameSite=Lax"));
    assert(cookieHeader.includes("Secure"));
  });

  // Test 3: callback.js rejects missing state query param
  await asyncTest("callback.js returns 403 when state is missing from query", async () => {
    const res = await callback.handler({
      headers: { cookie: "decap_oauth_state=teststate123" },
      queryStringParameters: { code: "mock_code" },
    });
    assert.strictEqual(res.statusCode, 403);
    assert(res.body.includes("CSRF"));
    assert(res.headers["Set-Cookie"].includes("Expires=Thu, 01 Jan 1970"));
  });

  // Test 4: callback.js rejects missing state cookie (expired or not initiated)
  await asyncTest("callback.js returns 403 when state cookie is missing", async () => {
    const res = await callback.handler({
      headers: {},
      queryStringParameters: { code: "mock_code", state: "teststate123" },
    });
    assert.strictEqual(res.statusCode, 403);
    assert(res.body.includes("CSRF"));
  });

  // Test 5: callback.js rejects mismatched state (CSRF attack attempt)
  await asyncTest("callback.js returns 403 when state does not match cookie", async () => {
    const res = await callback.handler({
      headers: { cookie: "decap_oauth_state=legitimate_state_abc" },
      queryStringParameters: { code: "mock_code", state: "attacker_state_xyz" },
    });
    assert.strictEqual(res.statusCode, 403);
    assert(res.body.includes("CSRF"));
  });

  // Test 6: callback.js rejects missing authorization code
  await asyncTest("callback.js returns 400 when authorization code is missing", async () => {
    const res = await callback.handler({
      headers: { cookie: "decap_oauth_state=matching_state" },
      queryStringParameters: { state: "matching_state" },
    });
    assert.strictEqual(res.statusCode, 400);
    assert(res.body.includes("Non se recibiu o código"));
  });

  // Test 7: callback.js HTML template enforces origin allowlist for postMessage
  await asyncTest("callback.js response enforces targetOrigin check in postMessage receiver", async () => {
    // Mock successful GitHub token response
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      json: async () => ({ access_token: "mock_gho_token_999", token_type: "bearer" }),
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
    assert(res.body.includes('targetOrigin = "https://anpa-rabadeira.netlify.app"'));
    assert(res.body.includes("if (e.origin !== targetOrigin && e.origin !== window.location.origin)"));
    assert(!res.body.includes("mock_client_secret_xyz"), "Client secret MUST NOT be leaked in HTML body");
  });

  console.log(`\nOAuth Test Summary: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runOAuthTests();
