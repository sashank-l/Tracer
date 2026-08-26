import { getDb } from '../db/client'

export interface LLMConfig {
  apiKey: string
  provider: 'openai' | 'anthropic' | 'openrouter'
  embeddingModel: string
  chatModel: string
}

/**
 * Get the current LLM configuration.
 * Reads API key from environment variable (or safeStorage in production).
 */
export async function getLLMConfig(): Promise<LLMConfig> {
  const db = getDb()
  const settings = await db.appSettings.findUnique({
    where: { id: 'singleton' },
  })

  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    provider: (settings?.llmProvider as any) || 'openai',
    embeddingModel: 'text-embedding-3-small',
    chatModel: settings?.llmModel || 'gpt-4o-mini',
  }
}

/**
 * Generate vector embedding for text using OpenAI Embeddings API (or OpenRouter compatible).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = await getLLMConfig()
  if (!config.apiKey) {
    // If no API key is set, return a zero vector so local workflows don't crash
    return new Array(1536).fill(0)
  }

  const endpoint =
    config.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/embeddings'
      : 'https://api.openai.com/v1/embeddings'

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        input: text.slice(0, 8000), // budget input length
        model: config.embeddingModel,
      }),
    })

    if (!res.ok) {
      console.warn(`[ai] Embedding request failed: ${res.statusText}`)
      return new Array(1536).fill(0)
    }

    const data = (await res.json()) as {
      data?: [{ embedding: number[] }]
    }
    return data.data?.[0]?.embedding ?? new Array(1536).fill(0)
  } catch (err) {
    console.error('[ai] Failed to generate embedding:', err)
    return new Array(1536).fill(0)
  }
}

/**
 * Call LLM chat completion API with structured system prompt and user message.
 */
export async function chatCompletion(
  systemPrompt: string,
  userMessage: string,
  temperature: number = 0.2,
): Promise<string> {
  const config = await getLLMConfig()
  if (!config.apiKey) {
    return 'LLM API key not configured. Please set your OPENAI_API_KEY in Settings.'
  }

  const endpoint =
    config.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.chatModel,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`LLM call failed (${res.status}): ${errText}`)
    }

    const data = (await res.json()) as {
      choices?: [{ message: { content: string } }]
    }
    return data.choices?.[0]?.message?.content ?? ''
  } catch (err) {
    console.error('[ai] Chat completion error:', err)
    throw err
  }
}
