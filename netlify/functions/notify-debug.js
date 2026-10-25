const { airtableList } = require("./_airtable");

exports.handler = async () => {
  try {
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    const data = await airtableList("Push Subscriptions", "?pageSize=100");
    const records = (data.records || []).map((r) => {
      let subLooksValid = false;
      try {
        const parsed = JSON.parse(r.fields.Subscription || "");
        subLooksValid = !!(parsed && parsed.endpoint);
      } catch (e) {
        subLooksValid = false;
      }
      return {
        name: r.fields.Name,
        hasSubscription: !!r.fields.Subscription,
        subscriptionLooksValid: subLooksValid,
      };
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vapidPublicKeyPresent: !!vapidPublic,
        vapidPrivateKeyPresent: !!vapidPrivate,
        vapidPublicKeyPrefix: vapidPublic ? vapidPublic.slice(0, 6) + "..." : "MISSING",
        totalSubscriptions: records.length,
        subscriptions: records,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
