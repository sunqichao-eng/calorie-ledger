import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // 换成了我的专属 Key
const ROOT = resolve(".");
const OUTPUTS = join(ROOT, "outputs");
const APP_DIR = join(OUTPUTS, "calorie-ledger-app");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

// 配合 Gemini 的 Schema 格式要求
const geminiSchema = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          amount_g: { type: "NUMBER" },
          calories_per_100g: { type: "NUMBER" },
          protein_per_100g: { type: "NUMBER" },
          fat_per_100g: { type: "NUMBER" },
          carbs_per_100g: { type: "NUMBER" },
          calories: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          fat: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          confidence: { type: "NUMBER" }
        },
        required: ["name", "amount_g", "calories_per_100g", "protein_per_100g", "fat_per_100g", "carbs_per_100g", "calories", "protein", "fat", "carbs", "confidence"]
      }
    },
    total_calories: { type: "NUMBER" },
    confidence: { type: "NUMBER" },
    notes: { type: "STRING" }
  },
  required: ["items", "total_calories", "confidence", "notes"]
};

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function analyzeMeal(imageDataUrl) {
  if (!GEMINI_API_KEY) {
    throw new Error("缺少 GEMINI_API_KEY。请在 Render 环境变量中配置。");
  }

  // 提取 Base64 图片数据和格式，满足 Gemini 的图片读取要求
  const matches = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("图片格式错误，请重新上传。");
  }
  const mimeType = matches[1];
  const base64Data = matches[2];

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "你是一个专业的营养师。请识别图片中的食物，并估算其重量(g)、每100克的卡路里以及蛋白质、脂肪和碳水化合物含量。返回严谨的JSON数据。如果拿不准，请使用常见的基础分量进行估算。" }]
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: "识别图片中的食物，估算重量和三大营养素。仅返回符合 JSON schema 的数据。" },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiSchema
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini API Error: ${response.status}`);
  }

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI 没有返回有效数据。");
  
  return JSON.parse(text);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = resolve(APP_DIR, requested);
  if (!filePath.startsWith(APP_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/analyze-meal") {
      const body = await readJson(req);
      if (!body.imageDataUrl || !body.imageDataUrl.startsWith("data:image/")) {
        sendJson(res, 400, { error: "图片数据无效。" });
        return;
      }
      const result = await analyzeMeal(body.imageDataUrl);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    res.writeHead(405);
    res.end("Method not allowed");
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}).listen(PORT, () => {
  console.log(`Calorie Ledger running at http://localhost:${PORT}`);
  console.log(`Vision model: Gemini 1.5 Flash`);
});
