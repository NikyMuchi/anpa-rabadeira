/**
 * Netlify Function: /auth
 * Initiates the GitHub OAuth flow for Decap CMS.
 * Cost: €0 (Runs within Netlify Functions 125,000 free requests/month).
 */

exports.handler = async function (event, context) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const host = event.headers.host || "anpa-rabadeira.netlify.app";
  const protocol = event.headers["x-forwarded-proto"] || "https";
  const redirectUri = `${protocol}://${host}/callback`;

  if (!clientId) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<h1>Erro de configuración</h1><p>GITHUB_CLIENT_ID non está configurado nas variables de entorno.</p>",
    };
  }

  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user`;

  return {
    statusCode: 302,
    headers: {
      Location: githubAuthUrl,
      "Cache-Control": "no-cache",
    },
    body: "",
  };
};
