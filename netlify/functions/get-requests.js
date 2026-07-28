const { airtableList } = require("./_airtable");

exports.handler = async () => {
  try {
    let allRecords = [];
    let offset = undefined;
    let safety = 0;

    // Airtable caps each page at 100 records - page through with `offset`
    // until it stops returning one, so nothing past the first 100 gets
    // silently dropped as the table grows.
    while (safety < 20) {
      safety++;
      const params = new URLSearchParams({
        "sort[0][field]": "Created",
        "sort[0][direction]": "asc",
        pageSize: "100",
      });
      if (offset) params.set("offset", offset);

      const data = await airtableList("PO Requests", `?${params.toString()}`);
      allRecords = allRecords.concat(data.records || []);

      if (!data.offset) break;
      offset = data.offset;
    }

    const records = allRecords.map((r) => ({
      id: r.id,
      ...r.fields,
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
