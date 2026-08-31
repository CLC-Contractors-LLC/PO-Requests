const { jobtreadQuery } = require("./_jobtread");
const { airtableCreate } = require("./_airtable");
const { notifyByName } = require("./_notify");

const APPROVERS = ["Danielle", "Chris", "Dedi"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      jobId,
      jobName,
      costItemId,
      lineItemName,
      amount,
      vendor,
      vendorId,
      fulfillment, // "Pickup" or "Delivery"
      neededBy,
      requestedBy,
      attachmentUrl,
      notes,
    } = body;

    if (!jobId || !costItemId || !amount || !vendor || !requestedBy) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }
    if (!vendorId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Please select a vendor from the search list, not just typed text" }),
      };
    }

    // Run the live budget check server-side (never trust the client's math)
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

    if (!inBudget && !(notes && notes.trim())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "This request is over budget - a reason is required in Notes" }),
      };
    }

    const record = await airtableCreate("PO Requests", {
      "Job Name": jobName,
      "Job ID": jobId,
      "Budget Line Item": lineItemName,
      "Cost Item ID": costItemId,
      Amount: parseFloat(amount),
      Vendor: vendor,
      "Vendor ID": vendorId || "",
      Fulfillment: fulfillment,
      "Needed By": neededBy,
      "Requested By": requestedBy,
      Attachment: attachmentUrl ? [{ url: attachmentUrl }] : undefined,
      Notes: notes || "",
      Status: "Pending Review",
      "Budget Status": inBudget ? "In Budget" : "Over Budget",
      "Budget Remaining At Request": remaining,
    });

    await notifyByName(
      APPROVERS,
      "New PO request",
      `${requestedBy} requested $${amount} for ${vendor} on ${jobName}${
        inBudget ? "" : " — OVER BUDGET"
      }`,
      "/"
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, id: record.id, inBudget, remaining }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
