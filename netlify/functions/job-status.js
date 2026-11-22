import { getStore } from "@netlify/blobs";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });

export default async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
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
};
