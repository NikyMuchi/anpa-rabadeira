/**
 * Netlify Function: /auth
 * Initiates the GitHub OAuth flow for Decap CMS with CSRF state protection.
 * Minimum required scopes: public_repo,read:user
 */

const crypto = require("crypto");

exports.handler = async function (event) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const host = event.headers.host || "anpa-rabadeira.netlify.app";
  const protocol = event.headers["x-forwarded-proto"] || "https";
  const redirectUri = `${protocol}://${host}/callback`;

  if (!clientId) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<h1>Erro de configuración</h1><p>GITHUB_CLIENT_ID non configurado nas variables de entorno.</p>",
    };
  }

  // Generate cryptographically secure random state for CSRF protection
  const state = crypto.randomBytes(32).toString("hex");

  // Minimum required GitHub scope for public repository CMS operations
  const scope = process.env.GITHUB_SCOPE || "public_repo,read:user";
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${encodeURIComponent(scope)}&state=${state}`;

  const isSecure = protocol === "https";
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${isSecure ? "; Secure" : ""}; Max-Age=600`;

  return {
    statusCode: 302,
    headers: {
      Location: githubAuthUrl,
      "Set-Cookie": `decap_oauth_state=${state}; ${cookieFlags}`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
    body: "",
  };
};
