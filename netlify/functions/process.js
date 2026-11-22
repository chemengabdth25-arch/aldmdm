// الدمدم - دالة الخادم (أعلى جودة مع حماية تلقائية من الضغط)

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODELS = [
  { name: "gemini-4-argon", timeoutMs: 5500 },
  { name: "gemini-3.8-flash", timeoutMs: 2500 },
  { name: "gemini-3.5-flash-lite", timeoutMs: 1500 }
];

const SYSTEM_INSTRUCTION = `أنت مساعد أكاديمي متخصص لمساعدة الطلاب الجامعيين.
- دقيق في المعنى ولا تضيف معلومات غير موجودة في النص الأصلي.
- تحافظ على المصطلحات العلمية وتكتبها بالإنجليزية بين قوسين عند الكتابة بالعربية.
- تعيد المخرجات مباشرة بدون مقدمات مثل "إليك النتيجة".
- تستخدم تنسيقاً منظماً (عناوين وفقرات أو نقاط) حين يناسب المحتوى.`;

const TASKS = {
  translate: (target) =>
    `ترجم النص التالي إلى ${target} ترجمة أكاديمية دقيقة وطبيعية. أعد الترجمة فقط.`,
  summarize: (target) =>
    `لخّص النص التالي بلغة ${target} في نقاط واضحة ومرتبة، مع الحفاظ على المفاهيم الأساسية والمصطلحات. أعد التلخيص فقط.`,
  report: (target) =>
    `حوّل النص التالي إلى محتوى منظم بلغة ${target} مناسب لتقرير أكاديمي، بعناوين فرعية وفقرات متماسكة. أعد المحتوى فقط.`,
};

function buildPrompt(mode, lang, text) {
  const target = lang === "en" ? "الإنجليزية الأكاديمية" : "العربية الفصحى";
  const task = (TASKS[mode] || TASKS.summarize)(target);
  return `${task}\n\n---\n${text}`;
}

async function callGemini({ apiKey, model, prompt, timeoutMs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    });

    const data = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") {
    return json(405, { error: "طريقة الطلب غير مسموحة" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "مفتاح GEMINI_API_KEY غير مضبوط في إعدادات Netlify" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "بيانات الطلب غير صالحة" });
  }

  const { text, mode = "summarize", lang = "ar" } = body;
  if (!text || typeof text !== "string" || text.length > 6500) {
    return json(400, { error: "النص فارغ أو أطول من الحد المسموح للجزء الواحد" });
  }

  const prompt = buildPrompt(mode, lang, text);

  for (const model of MODELS) {
    try {
      const { status, ok, data } = await callGemini({
        apiKey,
        model: model.name,
        prompt,
        timeoutMs: model.timeoutMs
      });

      if (ok) {
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const out = parts.map((p) => p.text || "").join("").trim();

        if (out) {
          return json(200, { result: out, model: model.name });
        }
      }

      if ([429, 503].includes(status)) {
        await sleep(500);
        continue;
      }
    } catch {
      continue;
    }
  }

  return json(503, { error: "يوجد ضغط مؤقت على السيرفر، جاري إعادة المحاولة..." });
}
