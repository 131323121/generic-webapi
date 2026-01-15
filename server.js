const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));

// ===== 設定 =====
const PROVIDER = 'openai'; // 'openai' or 'gemini'
const MODEL = 'gpt-4o-mini';

const OPENAI_API_ENDPOINT =
  'https://openai-api-proxy-746164391621.us-west1.run.app';
const GEMINI_API_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/';

// ===== prompt 読み込み =====
let promptTemplate;
try {
  promptTemplate = fs.readFileSync('prompt.md', 'utf8');
} catch (err) {
  console.error('Error reading prompt.md:', err);
  process.exit(1);
}

// ===== API =====
app.post('/api/', async (req, res) => {
  try {
    const { prompt, title = 'SPI対策クイズ', ...variables } = req.body;

    let finalPrompt = prompt || promptTemplate;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      finalPrompt = finalPrompt.replace(regex, value);
    }

    let result;
    if (PROVIDER === 'openai') {
      result = await callOpenAI(finalPrompt);
    } else {
      result = await callGemini(finalPrompt);
    }

    res.json({ title, questions: result });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== OpenAI =====
async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const response = await fetch(OPENAI_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: prompt }],
      max_completion_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await response.json();
  const text = data.choices[0].message.content;
  const parsed = JSON.parse(text);

  return parsed.questions || parsed.quiz || parsed;
}

// ===== Gemini =====
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const response = await fetch(
    `${GEMINI_API_BASE_URL}${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          response_mime_type: 'application/json',
        },
      }),
    }
  );

  const data = await response.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

// ===== 起動 =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Config: ${PROVIDER} - ${MODEL}`);
});
