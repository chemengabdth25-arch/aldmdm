const MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash"
];

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { prompt } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "مفتاح API غير مضبوط في إعدادات السيرفر" })
      };
    }

    let lastError = "تعذر الاتصال بخوادم الذكاء الاصطناعي حالياً";

    for (const model of MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          }
        );

        const data = await response.json();

        if (!response.ok || data.error) {
          const msg = data?.error?.message || `HTTP ${response.status}`;
          const isOverloaded =
            response.status === 503 ||
            response.status === 429 ||
            response.status === 404 ||
            msg.toLowerCase().includes("high demand") ||
            msg.toLowerCase().includes("overloaded") ||
            msg.toLowerCase().includes("not found");

          if (isOverloaded) {
            lastError = msg;
            continue; // الانتقال فوراً للنموذج البديل التالي
          }

          return {
            statusCode: 400,
            body: JSON.stringify({ error: msg })
          };
        }

        const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output) {
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ output })
          };
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    return {
      statusCode: 503,
      body: JSON.stringify({
        error: `جميع النماذج مزدحمة حالياً، يرجى المحاولة بعد قليل. (${lastError})`
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
