// Called cross-origin from clcdispatch.netlify.app whenever a runner marks
// a PO-originated pickup "En Route" or "Delivered / Completed" in My Runs.
// Updates the matching PO Requests record and notifies the original
// requester - this is the "two-way" half of the PO <-> Dispatch sync.
const { airtableUpdate, airtableList } = require("./_airtable");
const { notifyByName } = require("./_notify");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://clcdispatch.netlify.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Maps Dispatch's Status values to the PO Requests Status values we want to show.
const STATUS_MAP = {
  "En Route": "En Route",
  "Delivered / Completed": "Delivered",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const { sourcePoId, dispatchStatus } = body;

    if (!sourcePoId || !dispatchStatus) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "sourcePoId and dispatchStatus are required" }),
      };
    }

    const mappedStatus = STATUS_MAP[dispatchStatus];
    if (!mappedStatus) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Unrecognized dispatchStatus: ${dispatchStatus}` }),
      };
    }

    const existing = await airtableList(
      "PO Requests",
      `?filterByFormula=RECORD_ID()="${sourcePoId}"`
    );
    const record = existing.records && existing.records[0];
    if (!record) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "PO Request not found" }) };
    }

    await airtableUpdate("PO Requests", sourcePoId, {
      Status: mappedStatus,
      "Status Updated At": new Date().toISOString(),
    });

    const requestedBy = record.fields["Requested By"];
    if (requestedBy) {
      const title = mappedStatus === "Delivered" ? "Material delivered" : "Material on the way";
      const body =
        mappedStatus === "Delivered"
          ? `Your PO #${record.fields["PO Number"] || ""} has arrived on site.`
          : `Your PO #${record.fields["PO Number"] || ""} is on its way to the jobsite.`;
      await notifyByName([requestedBy], title, body, "/");
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
