const { toolDefinitions, toolHandlers } = require("./tools.js");

const MODEL = "gemini-3.8-flash";
const MAX_STEPS = 6; // 도구 호출 왕복 최대 횟수

const SYSTEM = `너는 제주 여행 추천 도우미다.
- 사용자의 요청을 보고 먼저 get_weather 로 날씨를, find_spots 로 장소 목록을 직접 조회한다. 필요하면 지역이나 실내/야외를 바꿔 여러 번 조회한다.
- 비·강한 바람이 예상되면 실내 장소를, 맑으면 야외 장소를 우선 고려해 추천한다.
- 추천하는 장소는 반드시 find_spots 결과에 있는 것만 쓴다. 목록 밖 장소는 없다. 지어내지 않는다.
- 운영시간·요금은 모른다고 말하고 방문 전 공식 안내 확인을 권한다.
- 한국어로 짧고 친근하게, 추천 이유(날씨 근거 포함)를 한 줄씩 붙인다.`;

// tools.js 의 Claude 형식(input_schema)을 Gemini 형식(parameters)으로 바꾼다
const functionDeclarations = toolDefinitions.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.input_schema,
}));

async function callGemini(contents) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        tools: [{ functionDeclarations }],
        contents,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Gemini API ${res.status}`);
  return data;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST 만 가능합니다." });
  if (!process.env.GEMINI_API_KEY)
    return res.status(500).json({ error: "서버에 GEMINI_API_KEY 가 설정되지 않았습니다." });

  // 화면에서 온 대화 기록 (문자열 role/content 만 허용). Gemini 는 assistant 를 model 이라고 부른다.
  const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const contents = history
    .slice(-10)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 1000) }],
    }));
  if (!contents.length || contents[contents.length - 1].role !== "user")
    return res.status(400).json({ error: "마지막 메시지는 사용자 입력이어야 합니다." });

  const toolLog = []; // 화면에 보여줄 "어떤 도구를 썼는지"
  const spots = [];   // 지도에 찍을 find_spots 결과

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await callGemini(contents);
      const content = data.candidates?.[0]?.content;
      const parts = content?.parts || [];
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        const reply = parts.map((p) => p.text || "").join("").trim();
        return res.status(200).json({ reply: reply || "답변을 만들지 못했어요.", toolLog, spots });
      }

      // Gemini 가 요청한 도구를 실행하고 결과를 돌려준다
      contents.push(content);
      const responseParts = [];
      for (const { functionCall } of calls) {
        const handler = toolHandlers[functionCall.name];
        const output = handler
          ? await handler(functionCall.args || {})
          : { error: `알 수 없는 도구: ${functionCall.name}` };
        toolLog.push({ name: functionCall.name, input: functionCall.args || {} });
        if (functionCall.name === "find_spots" && output.spots) spots.push(...output.spots);
        responseParts.push({
          functionResponse: { name: functionCall.name, response: output },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }
    return res.status(200).json({ reply: "도구를 너무 많이 호출해서 중단했어요. 질문을 조금 좁혀 주세요.", toolLog, spots });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
