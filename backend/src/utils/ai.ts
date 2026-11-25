/**
 * AI utility wrapper — external Vercel AI / LLM calls are disabled.
 */

export const DEFAULT_MODEL = 'openai/gpt-4o';
export const FAST_MODEL = 'openai/gpt-4o-mini';

export async function askAI(_prompt: string, _model: string = DEFAULT_MODEL): Promise<string> {
    throw new Error('AI Gateway is disabled');
}

export async function askAIChat(_messages: any[], _model: string = DEFAULT_MODEL): Promise<string> {
    throw new Error('AI Gateway is disabled');
}

export async function extractObject<T>(_prompt: string, _schema: any, _model: string = DEFAULT_MODEL): Promise<T> {
    throw new Error('AI Gateway is disabled');
}

export async function extractObjectChat<T>(_messages: any[], _schema: any, _model: string = DEFAULT_MODEL): Promise<T> {
    throw new Error('AI Gateway is disabled');
}
