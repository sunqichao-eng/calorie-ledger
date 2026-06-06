import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const PORT = Number(process.env.PORT || 3000);
// 这里的变量名字换成了 DEEPSEEK_API_KEY
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
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

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          amount_g: { type: "number" },
          calories_per_100g: { type: "number" },
          protein_per_100g: { type: "number" },
          fat_per_100g: { type: "number" },
          carbs_per_100g: { type: "number" },
          calories: { type: "number" },
          protein: { type: "number" },
          fat: { type: "number" },
          carbs: { type: "number" },
          confidence: { type: "number" }
        },
        required: ["name", "amount_g", "calories_per_100g", "protein_per_100g", "fat_per_100g", "carbs_per_100g", "calories", "protein", "fat", "carbs", "confidence"]
      }
    },
    total_calories: { type: "number" },
    confidence: { type: "number" },
    notes: { type: "string" }
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

function extractOutputText(response) {
  if (response.choices?.[0]?.message?.content) return response.choices[0].message.content;
  return "";
}

async function analyzeMeal(imageDataUrl) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("缺少 DEEPSEEK_API_KEY。请在 Render 环境变量中配置。");
  }

  // 呼叫 DeepSeek 官方的视觉模型接口（完美兼容 OpenAI 格式）
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: "deepseek-reasoner", // 或者是官方指定的最新视觉/多模态模型名字
      messages: [
        {
          role: "system",
          content: "你是一个专业的营养师。请识别图片中的食物，并估算其重量(g)、每100克的卡路里以及蛋白质、脂肪和碳水化合物含量。返回严谨的JSON数据。"
        },
        {
          role: "user",
          content: [
            { type: "text", text: "识别图片中的食物，估算重量和三大营养素。仅返回符合 JSON schema 的数据，不要包含任何额外的Markdown格式。" },
            { type: "image_url", image_url: { url: imageDataUrl } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || `DeepSeek API 错误: ${response.status}`);
  }

  const text = extractOutputText(payload);
  if (!text) throw new Error("模型没有返回有效数据。");
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
  console.log(`Vision model: DeepSeek`);
});
