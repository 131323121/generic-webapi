const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));

// --- 追加：トップページで quiz1.html を表示する設定 ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'quiz1.html'));
});
// ----------------------------------------------

// 設定をコードで定義
const PROVIDER = 'openai';  // 'openai' or 'gemini'
const MODEL = 'gpt-4o-mini';  // OpenAI: 'gpt-4o-mini'

let promptTemplate;
try {
    promptTemplate = fs.readFileSync('prompt.md', 'utf8');
} catch (error) {
    console.error('Error reading prompt.md:', error);
    process.exit(1);
}

const OPENAI_API_ENDPOINT = "https://openai-api-proxy-746164391621.us-west1.run.app";
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

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
        } else if (PROVIDER === 'gemini') {
            result = await callGemini(finalPrompt);
        } else {
            return res.status(400).json({ error: 'Invalid provider configuration' });
        }

        res.json({ 
            title: title,
            questions: result 
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

async function callOpenAI(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const response = await fetch(OPENAI_API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: prompt }
            ],
            max_completion_tokens: 2000,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    
    try {
        const parsedData = JSON.parse(responseText);
        if (Array.isArray(parsedData)) return parsedData;
        if (parsedData.questions) return parsedData.questions;
        return parsedData.quiz || parsedData.results || [];
    } catch (parseError) {
        throw new Error('Failed to parse LLM response');
    }
}

async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    const response = await fetch(`${GEMINI_API_BASE_URL}${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                maxOutputTokens: 2000,
                response_mime_type: "application/json"
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    
    try {
        const parsedData = JSON.parse(responseText);
        if (Array.isArray(parsedData)) return parsedData;
        if (parsedData.questions) return parsedData.questions;
        return parsedData.quiz || [];
    } catch (parseError) {
        throw new Error('Failed to parse LLM response');
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Config: ${PROVIDER} - ${MODEL}`);
});