// api/full-check.js
//
// Takes a seed prompt + a domain to check for. Generates 3 related prompts,
// then checks all 4 prompts (seed + related) against 5 real AI engines via
// OpenRouter, using each provider's own native web search where available.
// Returns per-query, per-engine citation data.
//
// SETUP:
// 1. Create an account at https://openrouter.ai
// 2. Add credit to your account (pay-as-you-go, no subscription).
// 3. Create an API key at https://openrouter.ai/keys
// 4. In Vercel → Project Settings → Environment Variables, add:
//      OPENROUTER_API_KEY = sk-or-v1-xxxxxxxxxxxxxxxxxxxx
// 5. IMPORTANT: model slugs change over time. Check
//    https://openrouter.ai/models for current slugs before deploying,
//    and update the ENGINES list below if any have changed.
//
// COST: every check makes ~20 real API calls (4 prompts x 5 engines).
// Monitor usage at https://openrouter.ai/activity. This file includes a
// basic in-memory per-IP rate limit as a safety net — see RATE_LIMIT below.
// In-memory limits reset on cold start / across serverless instances, so
// for real production traffic, replace this with a persistent store like
// Vercel KV or Upstash Redis.

const ENGINES = [
  { id: 'chatgpt', label: 'ChatGPT', model: 'openai/gpt-5.2:online' },
  { id: 'claude', label: 'Claude', model: 'anthropic/claude-sonnet-4.5:online' },
  { id: 'gemini', label: 'Gemini', model: 'google/gemini-2.5-flash:online' },
  { id: 'grok', label: 'Grok', model: 'x-ai/grok-4:online' },
  { id: 'perplexity', label: 'Perplexity', model: 'perplexity/sonar' }
];

const RELATED_QUERY_MODEL = 'openai/gpt-4o-mini'; // cheap model, no search needed here

// ---- very basic in-memory rate limiter (resets on cold start) ----
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 5 };
const rateLimitStore = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_LIMIT.windowMs) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  rateLimitStore.set(ip, entry);

  return entry.count > RATE_LIMIT.maxRequests;
}

async function callOpenRouter(model, prompt, apiKey) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error (${model}): ${errText}`);
  }

  return response.json();
}

async function getRelatedQueries(seedPrompt, apiKey) {
  const instruction = `Given the search query "${seedPrompt}", generate exactly 3 closely related search queries that someone researching the same topic might also type into an AI assistant. Return ONLY a JSON array of 3 strings, nothing else. Example format: ["query one", "query two", "query three"]`;

  const data = await callOpenRouter(RELATED_QUERY_MODEL, instruction, apiKey);
  const text = data?.choices?.[0]?.message?.content || '[]';

  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
    return [];
  } catch {
    return [];
  }
}

function extractCitations(data) {
  const message = data?.choices?.[0]?.message;
  const text = message?.content || '';
  const annotations = message?.annotations || [];

  const sources = annotations
    .filter(a => a.type === 'url_citation' && a.url_citation)
    .map(a => ({
      url: a.url_citation.url,
      title: a.url_citation.title || a.url_citation.url
    }));

  // De-dupe by URL
  const seen = new Set();
  const uniqueSources = sources.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  return { text, sources: uniqueSources };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }

  const { prompt, domain } = req.body || {};

  if (!prompt || !domain) {
    return res.status(400).json({ error: 'Missing "prompt" or "domain" in request body' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing OPENROUTER_API_KEY' });
  }

  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

  try {
    // Step 1: generate related queries
    const relatedQueries = await getRelatedQueries(prompt, apiKey);
    const allQueries = [prompt, ...relatedQueries];

    // Step 2: for every query x every engine, call OpenRouter in parallel
    const tasks = [];
    for (const query of allQueries) {
      for (const engine of ENGINES) {
        tasks.push(
          callOpenRouter(engine.model, query, apiKey)
            .then(data => {
              const { text, sources } = extractCitations(data);
              const cited = sources.some(s => s.url.toLowerCase().includes(cleanDomain)) ||
                            text.toLowerCase().includes(cleanDomain);
              return { query, engine: engine.id, engineLabel: engine.label, cited, sources, answerSnippet: text.slice(0, 400) };
            })
            .catch(err => ({
              query, engine: engine.id, engineLabel: engine.label,
              error: err.message, cited: false, sources: [], answerSnippet: ''
            }))
        );
      }
    }

    const results = await Promise.all(tasks);

    // Step 3: group by query
    const grouped = allQueries.map(query => ({
      query,
      isSeed: query === prompt,
      engines: results.filter(r => r.query === query)
    }));

    return res.status(200).json({
      domain: cleanDomain,
      queries: grouped
    });
  } catch (err) {
    console.error('full-check error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
