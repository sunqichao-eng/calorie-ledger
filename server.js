import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
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
          calories: { type: "number" },
          confidence: { type: "number" }
        },
        required: ["name", "amount_g", "calories_per_100g", "calories", "confidence"]
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
  if (typeof response.output_text === "string") return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

async function analyzeMeal(imageDataUrl) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Set it before starting the server.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You estimate foods from meal photos. Return cautious nutrition estimates only. If unsure, use broad common serving estimates and lower confidence."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Identify the food items in this meal photo. Estimate each item's weight in grams, calories per 100g, and total calories. Use Chinese food names when appropriate. Return only data that matches the JSON schema."
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high"
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meal_calorie_estimate",
          schema,
          strict: true
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI API error: ${response.status}`);
  }

  const text = extractOutputText(payload);
  if (!text) throw new Error("The model returned no structured text.");
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
        sendJson(res, 400, { error: "imageDataUrl is required." });
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
  console.log(`Vision model: ${OPENAI_MODEL}`);
});
