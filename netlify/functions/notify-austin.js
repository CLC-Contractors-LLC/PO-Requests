// Called cross-origin from clcdispatch.netlify.app to notify Austin about
// dispatch activity - new requests coming in, and any request moving to
// En Route or Delivered/Completed. Deliberately generic (just title/body)
// since Dispatch knows the request details and just needs a push sent.
const { notifyByName } = require("./_notify");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://clcdispatch.netlify.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: "Method not allowed" };
  }

  try {
    const { title, body, url } = JSON.parse(event.body);
    if (!title || !body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "title and body are required" }),
      };
    }

    await notifyByName(["Austin"], title, body, url || "/");

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
