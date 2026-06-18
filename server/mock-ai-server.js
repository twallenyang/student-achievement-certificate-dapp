const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3001;
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const ALLOWED_SUGGESTIONS = ["Approve", "Reject", "Needs Review"];
const ALLOWED_CERTIFICATE_LEVELS = ["Gold", "Silver", "Bronze", "None"];
// OpenAI 回傳格式錯誤或 enum 值不合法時，使用這組保底結果。
const INVALID_AI_RESPONSE_FALLBACK = {
  aiSuggestion: "Needs Review",
  score: 70,
  reason: "AI 回傳格式不完整，因此需要教師進一步人工審核。",
  certificateLevel: "Bronze",
  metadataDescription: "This certificate application requires additional teacher review."
};
// 固定 prompt 放在後端，避免學生從瀏覽器修改評分規則。
const SYSTEM_PROMPT = `You are an academic achievement review assistant for a blockchain programming final project.

Your task is to evaluate a student's achievement certificate application.

You must evaluate the application based on the following criteria:

1. Relevance to blockchain programming course objectives
2. Smart contract design completeness
3. Frontend integration quality
4. MetaMask and ethers.js integration
5. Testing and deployment evidence
6. Technical clarity
7. Verifiability of the submitted achievement
8. Practical value of the achievement
9. Whether the evidence URL is useful for teacher verification

Important rules:

- You are only an assistant.
- You do not make the final decision.
- The teacher has the final authority to approve or reject the application.
- Do not overestimate unclear or unverifiable submissions.
- Treat the evidence URL as supporting material only; do not assume it proves the work unless it appears relevant.
- If the achievement description is vague, incomplete, or unrelated to blockchain, return "Needs Review" or "Reject".
- The reason must explain the concrete basis for the score, including relevant strengths, missing details, evidence quality, and why the final suggestion was chosen.
- Return only valid JSON.
- Do not include Markdown.
- Do not include explanations outside JSON.

Scoring rules:

90-100 = Gold
80-89 = Silver
70-79 = Bronze
Below 70 = None

aiSuggestion rules:

- Use "Approve" if the submission is clear, relevant, and technically sufficient.
- Use "Needs Review" if the submission has some value but lacks details or evidence.
- Use "Reject" if the submission is unrelated, too vague, or clearly insufficient.

Output JSON format:

{
  "aiSuggestion": "Approve | Reject | Needs Review",
  "score": 0,
  "reason": "detailed explanation in Traditional Chinese",
  "certificateLevel": "Gold | Silver | Bronze | None",
  "metadataDescription": "short NFT metadata description in English"
}`;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-assisted-certificate-review",
    defaultMode: "mock",
    openaiAvailable: Boolean(openaiApiKey),
    model: openaiApiKey ? openaiModel : null
  });
});

app.post("/api/ai-review", (req, res) => {
  // 前端只送申請資料；API key 與固定 prompt 規則都留在後端。
  const validation = validateReviewRequest(req.body);
  if (validation.error) return res.status(400).json(validation.error);

  try {
    const review = reviewAchievementWithMock(validation.payload);

    res.json({
      mode: "mock",
      ...review
    });
  } catch (error) {
    console.error("Mock AI review failed:", error.message);
    res.status(500).json({
      aiSuggestion: "Needs Review",
      score: 0,
      reason: "Mock AI 審核失敗，請檢查後端 server。",
      certificateLevel: "None",
      metadataDescription: ""
    });
  }
});

app.post("/api/openai-review", async (req, res) => {
  const validation = validateReviewRequest(req.body);
  if (validation.error) return res.status(400).json(validation.error);

  if (!openaiApiKey) {
    return res.status(400).json({
      aiSuggestion: "Needs Review",
      score: 0,
      reason: "OPENAI_API_KEY is not configured. Add it to .env, then restart npm run server.",
      certificateLevel: "None",
      metadataDescription: ""
    });
  }

  try {
    const review = await reviewAchievementWithOpenAI(validation.payload);

    res.json({
      mode: "openai",
      model: openaiModel,
      ...review
    });
  } catch (error) {
    console.error("AI review failed:", error.message);
    res.status(502).json({
      aiSuggestion: "Needs Review",
      score: 0,
      reason: "OpenAI 審核失敗，請檢查後端 API key、模型名稱與網路連線。",
      certificateLevel: "None",
      metadataDescription: ""
    });
  }
});

function validateReviewRequest(body) {
  const { studentName, certificateTitle, achievementDescription, evidenceUrl } = body;
  const missing = [];

  if (!studentName) missing.push("studentName");
  if (!certificateTitle) missing.push("certificateTitle");
  if (!achievementDescription) missing.push("achievementDescription");
  if (!evidenceUrl) missing.push("evidenceUrl");

  if (missing.length > 0) {
    return {
      error: {
        aiSuggestion: "Needs Review",
        score: 0,
        reason: `Missing fields: ${missing.join(", ")}`,
        certificateLevel: "None",
        metadataDescription: ""
      }
    };
  }

  if (!isHttpUrl(evidenceUrl)) {
    return {
      error: {
        aiSuggestion: "Needs Review",
        score: 0,
        reason: "Evidence URL must start with http:// or https://.",
        certificateLevel: "None",
        metadataDescription: ""
      }
    };
  }

  return {
    payload: {
      studentName,
      certificateTitle,
      achievementDescription,
      evidenceUrl
    }
  };
}

app.post("/review-certificate", (req, res) => {
  const { studentName, certificateTitle, evidenceText } = req.body;

  const review = reviewAchievementWithMock({
    studentName,
    certificateTitle,
    achievementDescription: evidenceText
  });

  res.json({
    approved: review.aiSuggestion === "Approve",
    score: review.score,
    reason: review.reason,
    metadataDraft: {
      name: certificateTitle,
      description: review.metadataDescription,
      image: "ipfs://replace-with-certificate-image"
    }
  });
});

async function reviewAchievementWithOpenAI({ studentName, certificateTitle, achievementDescription, evidenceUrl }) {
  // 呼叫 Responses API：固定 system prompt + 學生動態資料 + 嚴格 JSON schema。
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: openaiModel,
      instructions: [
        SYSTEM_PROMPT
      ].join("\n\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt({
                studentName,
                certificateTitle,
                achievementDescription,
                evidenceUrl
              })
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "certificate_review",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              aiSuggestion: {
                type: "string",
                enum: ["Approve", "Reject", "Needs Review"]
              },
              score: {
                type: "integer",
                minimum: 0,
                maximum: 100
              },
              reason: {
                type: "string"
              },
              certificateLevel: {
                type: "string",
                enum: ["Gold", "Silver", "Bronze", "None"]
              },
              metadataDescription: {
                type: "string"
              }
            },
            required: [
              "aiSuggestion",
              "score",
              "reason",
              "certificateLevel",
              "metadataDescription"
            ]
          }
        }
      }
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || `OpenAI API returned HTTP ${response.status}`;
    throw new Error(message);
  }

  const outputText = getResponseOutputText(data);
  if (!outputText) {
    throw new Error("OpenAI API returned no output text.");
  }

  try {
    return normalizeReview(JSON.parse(outputText));
  } catch (error) {
    console.error("Invalid OpenAI review response:", error.message);
    return { ...INVALID_AI_RESPONSE_FALLBACK };
  }
}

function buildUserPrompt({ studentName, certificateTitle, achievementDescription, evidenceUrl }) {
  return `Student Name:
${studentName}

Certificate Title:
${certificateTitle}

Achievement Description:
${achievementDescription}

Evidence URL:
${evidenceUrl}

Please evaluate this application according to the fixed rules.
Return only valid JSON.`;
}

function getResponseOutputText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return "";
}

function normalizeReview(review) {
  const score = Number(review.score);

  // 即使已經使用 JSON schema，仍在後端再次驗證，避免不合法資料被寫入鏈上。
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("OpenAI API returned an invalid score.");
  }

  if (!ALLOWED_SUGGESTIONS.includes(review.aiSuggestion)) {
    throw new Error("OpenAI API returned an invalid AI suggestion.");
  }

  if (!ALLOWED_CERTIFICATE_LEVELS.includes(review.certificateLevel)) {
    throw new Error("OpenAI API returned an invalid certificate level.");
  }

  if (!review.reason || !review.metadataDescription) {
    throw new Error("OpenAI API returned an incomplete review.");
  }

  return {
    aiSuggestion: review.aiSuggestion,
    score,
    reason: String(review.reason),
    certificateLevel: review.certificateLevel,
    metadataDescription: String(review.metadataDescription)
  };
}

function reviewAchievementWithMock({ studentName, certificateTitle, achievementDescription, evidenceUrl }) {
  const text = String(achievementDescription || "").toLowerCase();
  const strongSignals = [
    "blockchain",
    "solidity",
    "smart contract",
    "nft",
    "ethers",
    "metamask",
    "project",
    "certificate",
    "test",
    "deploy"
  ];

  const signalScore = strongSignals.reduce(
    (total, signal) => total + (text.includes(signal) ? 7 : 0),
    0
  );
  const lengthScore = Math.min(Math.floor(String(achievementDescription || "").length / 12), 25);
  const evidenceScore = isHttpUrl(evidenceUrl) ? 10 : 0;
  const score = Math.min(100, 35 + signalScore + lengthScore + evidenceScore);
  const certificateLevel = getCertificateLevel(score);
  const aiSuggestion = getSuggestion(score);

  return {
    aiSuggestion,
    score,
    reason: getReason(aiSuggestion, score, certificateLevel),
    certificateLevel,
    metadataDescription:
      `${studentName} earned "${certificateTitle}" by submitting an achievement that was reviewed by an off-chain AI assistant and then left for final teacher approval.`
  };
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function getSuggestion(score) {
  if (score >= 80) return "Approve";
  if (score >= 60) return "Needs Review";
  return "Reject";
}

function getCertificateLevel(score) {
  if (score >= 90) return "Gold";
  if (score >= 80) return "Silver";
  if (score >= 70) return "Bronze";
  return "None";
}

function getReason(aiSuggestion, score, certificateLevel) {
  if (aiSuggestion === "Approve") {
    return `此申請內容明確且符合區塊鏈課程目標，AI 參考分數為 ${score}/100，建議等級為 ${certificateLevel}。`;
  }

  if (aiSuggestion === "Needs Review") {
    return `此申請具備部分相關成果，但細節或佐證仍不足，AI 參考分數為 ${score}/100，建議教師進一步審核。`;
  }

  return `此申請與區塊鏈課程目標關聯不足或內容過於模糊，AI 參考分數為 ${score}/100，不建議直接核准。`;
}

app.listen(port, "127.0.0.1", () => {
  console.log(`AI review server running at http://localhost:${port}`);
});
