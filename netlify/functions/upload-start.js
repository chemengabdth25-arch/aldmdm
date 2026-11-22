const KEY = process.env.GEMINI_API_KEY;
const MAX_BYTES = 50 * 1024 * 1024; // 50 ميغابايت

const json = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "طريقة غير مسموحة" });
  if (!KEY) return json(500, { error: "GEMINI_API_KEY غير مضبوط" });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "بيانات غير صالحة" }); }

  const { displayName = "lecture.pdf", mimeType, size } = body;

  if (mimeType !== "application/pdf") {
    return json(400, { error: "الملف يجب أن يكون PDF" });
  }
  if (!size || size > MAX_BYTES) {
    return json(400, { error: "الحد الأقصى لحجم الملف 50 ميغابايت" });
  }

  const r = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": KEY,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });

  const uploadUrl = r.headers.get("x-goog-upload-url");
  if (!r.ok || !uploadUrl) {
    const t = await r.text();
    return json(502, { error: `تعذر بدء الرفع (${r.status}): ${t.slice(0, 200)}` });
  }

  return json(200, { uploadUrl });
}
