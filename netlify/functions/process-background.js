import { getStore } from "@netlify/blobs";

const KEY = process.env.GEMINI_API_KEY;
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

const SYSTEM_INSTRUCTION = `أنت مساعد أكاديمي متخصص لمساعدة الطلاب الجامعيين.
- دقيق في المعنى ولا تضيف معلومات غير موجودة في النص الأصلي.
- تحافظ على المصطلحات العلمية وتكتبها بالإنجليزية بين قوسين عند الكتابة بالعربية.
- تعيد المخرجات مباشرة بدون مقدمات مثل "إليك النتيجة".
- تستخدم تنسيقاً منظماً (عناوين وفقرات أو نقاط) حين يناسب المحتوى.`;

const TASKS = {
  translate: (target) =>
    `ترجم المحتوى التالي بالكامل إلى ${target} ترجمة أكاديمية دقيقة وطبيعية دون اختصار. أعد الترجمة فقط.`,
  summarize: (target) =>
    `لخّص المحتوى التالي بلغة ${target} في نقاط واضحة ومرتبة شاملة لكل المفاهيم الأساسية والمصطلحات العلمية. أعد التلخيص فقط.`,
  report: (target) =>
    `اكتب تقريراً أكاديمياً متكاملاً ومنظماً باللغة ${target} حول الموضوع أو المحتوى التالي، بعناوين فرعية وفقرات متماسكة ومقدمة وخاتمة. أعد التقرير فقط.`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForFileActive(fileName) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${KEY}`);
    if (r.ok) {
      const data = await r.json();
      if (data.state === "ACTIVE") return true;
      if (data.state === "FAILED") throw new Error("فشلت معالجة ملف PDF في خوادم جوجل");
    }
    await sleep(1500);
  }
  throw new Error("استغرقت تهيئة الملف وقتاً أطول من اللازم");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "" }; }

  const { jobId, fileUri, fileName, mimeType = "application/pdf", text, mode = "summarize", lang = "ar" } = body;
  if (!jobId) return { statusCode: 400, body: "" };

  const store = getStore("aldmdm-jobs");

  try {
    if (!KEY) throw new Error("مفتاح GEMINI_API_KEY غير مضبوط في إعدادات Netlify");

    await store.setJSON(jobId, { status: "processing", step: "جاري تجهيز المحتوى..." });

    if (fileName) {
      await waitForFileActive(fileName);
    }

    const target = lang === "en" ? "الإنجليزية الأكاديمية" : "العربية الفصحى";
    const taskPrompt = (TASKS[mode] || TASKS.summarize)(target);

    const parts = [];
    if (fileUri) {
      parts.push({ file_data: { mime_type: mimeType, file_uri: fileUri } });
      parts.push({ text: taskPrompt });
    } else if (text) {
      parts.push({ text: `${taskPrompt}\n\n---\n${text}` });
    } else {
      throw new Error("لا يوجد ملف أو نص للمعالجة");
    }

    await store.setJSON(jobId, { status: "processing", step: "جاري التحليل وكتابة المخرجات..." });

    let lastError = "";
    for (const model of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: [{ role: "user", parts }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192
            }
          })
        });

        const data = await r.json();
        if (r.ok) {
          const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
          if (out) {
            await store.setJSON(jobId, { status: "done", result: out, model });
            return { statusCode: 200, body: "" };
          }
        } else {
          lastError = data?.error?.message || `HTTP ${r.status}`;
        }
      } catch (e) {
        lastError = e.message;
      }
    }

    throw new Error(`تعذر الإتمام: ${lastError}`);
  } catch (err) {
    await store.setJSON(jobId, { status: "error", error: err.message || "حدث خطأ أثناء المعالجة" });
    return { statusCode: 200, body: "" };
  }
}
