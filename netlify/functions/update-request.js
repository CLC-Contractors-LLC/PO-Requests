const { jobtreadQuery } = require("./_jobtread");
const { airtableUpdate, airtableList } = require("./_airtable");
const { notifyByName } = require("./_notify");

const APPROVERS = ["Danielle", "Chris", "Dedi"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      recordId,
      actorName,
      jobId,
      jobName,
      costItemId,
      lineItemName,
      amount,
      vendor,
      vendorId,
      fulfillment,
      neededBy,
      attachmentUrl,
      notes,
    } = body;

    if (!recordId || !actorName || !jobId || !costItemId || !amount || !vendor) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
    }
    if (!vendorId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Please select a vendor from the search list, not just typed text" }),
      };
    }

    // Only the original requester can edit their own request, and only while
    // it hasn't already been approved - editing after approval would let
    // someone quietly change a dollar amount after the fact.
    const existing = await airtableList(
      "PO Requests",
      `?filterByFormula=RECORD_ID()="${recordId}"`
    );
    const record = existing.records && existing.records[0];
    if (!record) {
      return { statusCode: 404, body: JSON.stringify({ error: "Request not found" }) };
    }
    const requestedBy = (record.fields["Requested By"] || "").toLowerCase().trim();
    if (requestedBy !== actorName.toLowerCase().trim()) {
      return { statusCode: 403, body: JSON.stringify({ error: "Only the original requester can edit this" }) };
    }
    if (!["Pending Review", "Needs Info"].includes(record.fields.Status)) {
      return { statusCode: 403, body: JSON.stringify({ error: "This request can no longer be edited" }) };
    }

    // Re-run the live budget check server-side against the (possibly changed) line item/amount
    const data = await jobtreadQuery({
      costItem: {
        $: { id: costItemId },
        cost: {},
        committed: {
          _: "documentCostItems",
          $: {
            where: {
              and: [
                [["document", "type"], "vendorOrder"],
                [["document", "status"], "in", ["approved", "pending"]],
              ],
            },
          },
          sum: { $: "cost" },
        },
        timeCost: { _: "timeEntries", sum: { $: "cost" } },
      },
    });

    const budget = data.costItem.cost || 0;
    const committed = (data.costItem.committed && data.costItem.committed.sum) || 0;
    const timeCost = (data.costItem.timeCost && data.costItem.timeCost.sum) || 0;
    const remaining = budget - committed - timeCost;
    const inBudget = parseFloat(amount) <= remaining;

    const fields = {
      "Job Name": jobName,
      "Job ID": jobId,
      "Budget Line Item": lineItemName,
      "Cost Item ID": costItemId,
      Amount: parseFloat(amount),
      Vendor: vendor,
      "Vendor ID": vendorId || "",
      Fulfillment: fulfillment,
      "Needed By": neededBy,
      Notes: notes || "",
      Status: "Pending Review",
      "Budget Status": inBudget ? "In Budget" : "Over Budget",
      "Budget Remaining At Request": remaining,
      "Status Updated At": new Date().toISOString(),
    };
    if (attachmentUrl) {
      fields.Attachment = [{ url: attachmentUrl }];
    }

    await airtableUpdate("PO Requests", recordId, fields);

    await notifyByName(
      APPROVERS,
      "PO request updated",
      `${actorName} updated a PO request for ${vendor} on ${jobName}${inBudget ? "" : " — OVER BUDGET"}`,
      "/"
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, inBudget, remaining }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
