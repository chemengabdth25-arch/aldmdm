import { getStore } from "@netlify/blobs";

const json = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  const jobId = event.queryStringParameters?.jobId;
  if (!jobId) return json(400, { error: "رقم المهمة مفقود" });

  try {
    const store = getStore("aldmdm-jobs");
    const data = await store.get(jobId, { type: "json" });
    if (!data) {
      return json(200, { status: "processing", step: "جاري بدء المعالجة..." });
    }
    return json(200, data);
  } catch (err) {
    return json(200, { status: "error", error: "خطأ في التخزين السحابي: " + err.message });
  }
}
