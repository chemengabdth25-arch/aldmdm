const MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];

async function fetchWithTimeout(url, options, timeoutMs = 8500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { prompt, systemInstruction } = JSON.parse(event.body || "{}");
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "مفتاح API غير مضبوط في إعدادات Netlify." })
      };
    }

    if (!prompt || prompt.trim() === "") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "النص فارغ، يرجى إدخال محتوى للمعالجة." })
      };
    }

    const requestBody = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    let lastError = "";

    for (const model of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetchWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        }, 8500);

        const data = await response.json();

        if (!response.ok) {
          lastError = data.error?.message || `HTTP ${response.status}`;
          continue;
        }

        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output) {
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ output, modelUsed: model })
          };
        }
      } catch (err) {
        lastError = err.name === "AbortError" ? "انتهت مهلة الاستجابة" : err.message;
      }
    }

    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `توقف مؤقت: يرجى المحاولة بعد قليل. (${lastError})`
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "حدث خطأ داخلي: " + error.message })
    };
  }
}
