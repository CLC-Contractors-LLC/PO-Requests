const { airtableList, airtableCreate, airtableUpdate } = require("./_airtable");

// Allow the Dispatch app to register a push subscription here too - both
// apps write into the same shared "Push Subscriptions" table either way.
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
    const { name, subscription } = JSON.parse(event.body);
    if (!name || !subscription) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "name and subscription are required" }),
      };
    }

    const existing = await airtableList(
      "Push Subscriptions",
      `?filterByFormula=LOWER({Name})="${name.toLowerCase().trim()}"`
    );

    const fields = { Name: name, Subscription: JSON.stringify(subscription) };

    if (existing.records && existing.records.length > 0) {
      await airtableUpdate("Push Subscriptions", existing.records[0].id, fields);
    } else {
      await airtableCreate("Push Subscriptions", fields);
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
