export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { image, mediaType, name } = req.body || {};

  if (!image || !name) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const safeMediaType = (typeof mediaType === 'string' && mediaType.startsWith('image/'))
    ? mediaType
    : 'image/jpeg';

  const prompt = `첨부한 이미지는 학원 "개별지도 시간표" 공지 표입니다. 표의 왼쪽에는 학생 이름, 과목(●색상점 + 과목명 + 숫자콤마 형태)이 있고, 오른쪽에는 월~일 요일별 칸에 시간대를 뜻하는 알파벳 코드(A~H 등)가 적혀 있습니다(빈 칸도 많습니다).
"${name}" 라는 학생 이름을 표에서 찾아 그 학생의 모든 과목 행을 추출해줘. 이름이 정확히 일치하지 않아도 가장 비슷한 한 명을 찾아줘(예: 띄어쓰기, 오타 허용). 표의 상단에 있는 주차/기간 텍스트(예: "9월 4주차 · 9/28(월) ~ 10/4(일)")와 각 요일 아래 있는 날짜(월 9/28 처럼)도 함께 읽어줘.
반드시 아래 JSON 형식으로만 답해줘.
{
  "found": true 또는 false,
  "studentNameOnSheet": "표에서 실제로 찾은 이름",
  "period": "예: 9월 4주차 · 9/28(월) ~ 10/4(일)",
  "days": ["월 9/28","화 9/29","수 9/30","목 10/1","금 10/2","토 10/3","일 10/4"],
  "subjects": [ { "name": "과목명(예: 언매 3콤마)", "codes": ["E","","","","F","E",""] } ],
  "notFoundReason": "found가 false일 때만, 왜 못찾았는지 한 문장"
}
codes 배열은 반드시 days와 같은 순서(월~일)로 7칸이어야 하고, 코드가 없는 칸은 빈 문자열("")로 채워줘.`;

  const GEMINI_MODEL = 'gemini-flash-lite-latest';

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': process.env.MY_SCHEDULE
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inline_data: { mime_type: safeMediaType, data: image } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('GEMINI ERROR:', geminiRes.status, JSON.stringify(data));
      const status = geminiRes.status === 400 ? 401 : geminiRes.status;
      return res.status(status).json(data);
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';

    // 클라이언트가 기대하는 형태({ content: [{ text }] })로 맞춰서 응답
    return res.status(200).json({ content: [{ text }] });
  } catch (err) {
    return res.status(502).json({ error: 'upstream_error' });
  }
}
