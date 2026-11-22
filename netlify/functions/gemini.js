const MODEL_PIPELINE = [
  { name: "gemini-3.8-flash", timeoutMs: 4500 },
  { name: "gemini-3.5-flash", timeoutMs: 3000 },
  { name: "gemini-3.5-flash-lite", timeoutMs: 2200 }
];

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function handler(event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "طريقة الطلب غير مدعومة." })
    };
  }

  try {
    const { prompt, systemInstruction } = JSON.parse(event.body || "{}");
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "الخدمة قيد التجهيز، يرجى المحاولة بعد قليل." })
      };
    }

    if (!prompt || prompt.trim() === "") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "يرجى إدخال نص أو رفع ملف PDF أولاً." })
      };
    }

    const requestBody = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 16384
      }
    };

    if (systemInstruction && systemInstruction.trim() !== "") {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    for (const model of MODEL_PIPELINE) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${apiKey}`;
        const response = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
          },
          model.timeoutMs
        );

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (output && output.trim() !== "") {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ output, modelUsed: model.name })
          };
        }
      } catch {
        continue;
      }
    }

    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: "يوجد ضغط لحظي على الخدمة، اضغط على زر البدء مجدداً للمتابعة."
      })
    };

  } catch {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "حدث انقطاع مؤقت، يرجى المحاولة مرة أخرى."
      })
    };
  }
}
