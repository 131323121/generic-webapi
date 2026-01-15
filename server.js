// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000; // Render は 10000 で動作することが多い

// ===== public を静的配信 =====
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===== 設定 =====
const PROVIDER = 'openai';
const MODEL = 'gpt-4o-mini';
const OPENAI_API_ENDPOINT = 'https://openai-api-proxy-746164391621.us-west1.run.app';

// ===== prompt.md 読み込み =====
let promptTemplate;
try {
  promptTemplate = fs.readFileSync('prompt.md', 'utf8');
} catch (err) {
  console.error('Error reading prompt.md:', err);
  process.exit(1);
}

// ===== /api/ エンドポイント =====
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
    }

    res.json({ title, questions: result });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== OpenAI 呼び出し =====
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

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'OpenAI API error');
  }

  const data = await response.json();
  const responseText = data.choices[0].message.content;

  try {
    const parsed = JSON.parse(responseText);
    if (Array.isArray(parsed)) return parsed;
    return parsed.questions || parsed.quiz || [];
  } catch (parseErr) {
    throw new Error('Failed to parse LLM response');
  }
}

// ===== ルートアクセスで index.html =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== サーバー起動 =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Config: ${PROVIDER} - ${MODEL}`);
});
