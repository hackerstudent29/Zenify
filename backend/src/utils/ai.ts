import { generateText, streamText, generateObject } from 'ai';

/**
 * Common utility for Vercel AI SDK wrappers using the Vercel AI Gateway.
 * The AI_GATEWAY_API_KEY is loaded from process.env implicitly by the ai package.
 */

// Default model to use for text and logic generation
export const DEFAULT_MODEL = 'openai/gpt-4o';
// Faster model for simpler tasks like routing or classification
export const FAST_MODEL = 'openai/gpt-4o-mini';

export async function askAI(prompt: string, model: string = DEFAULT_MODEL) {
    const { text } = await generateText({
        model,
        prompt,
    });
    return text;
}

export async function askAIChat(messages: any[], model: string = DEFAULT_MODEL) {
    const { text } = await generateText({
        model,
        messages,
    });
    return text;
}

export async function extractObject<T>(prompt: string, schema: any, model: string = DEFAULT_MODEL): Promise<T> {
    const { object } = await generateObject({
        model,
        schema,
        prompt,
    });
    return object as T;
}

export async function extractObjectChat<T>(messages: any[], schema: any, model: string = DEFAULT_MODEL): Promise<T> {
    const { object } = await generateObject({
        model,
        schema,
        messages,
    });
    return object as T;
}
