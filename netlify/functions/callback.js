/**
 * Netlify Function: /callback
 * Completes GitHub OAuth exchange and transmits the token to Decap CMS via postMessage.
 * Cost: €0 (Zero third-party services, runs on Netlify serverless free tier).
 */

exports.handler = async function (event, context) {
  const code = event.queryStringParameters && event.queryStringParameters.code;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!code) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<h1>Erro de autenticación</h1><p>Non se recibiu o código de autorización de GitHub.</p>",
    };
  }

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<h1>Erro de configuración</h1><p>Credenciais GITHUB_CLIENT_ID ou GITHUB_CLIENT_SECRET non configuradas.</p>",
    };
  }

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });

    const data = await response.json();

    if (data.error || !data.access_token) {
      const errorMsg = data.error_description || data.error || "Fallo ao obter token de acceso";
      return {
        statusCode: 401,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<h1>Erro de autorización</h1><p>${errorMsg}</p>`,
      };
    }

    const token = data.access_token;
    const postMessagePayload = JSON.stringify({
      token: token,
      provider: "github",
    });

    const html = `<!DOCTYPE html>
<html lang="gl">
<head>
  <meta charset="utf-8">
  <title>Autenticando...</title>
</head>
<body>
  <p>Autenticación completada. Pechando ventá...</p>
  <script>
    (function () {
      function receiveMessage(e) {
        window.opener.postMessage(
          'authorization:github:success:${postMessagePayload.replace(/'/g, "\\'")}',
          e.origin
        );
        window.removeEventListener("message", receiveMessage, false);
        window.close();
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:github", "*");
    })();
  </script>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
      body: html,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<h1>Erro interno</h1><p>${err.message}</p>`,
    };
  }
};
