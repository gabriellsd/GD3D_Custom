import { jsonResponse } from './auth-token.mjs';

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function withApiHandler(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      console.error('[api]', err);
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Erro interno do servidor.'
          : err?.message || 'Erro interno do servidor.';
      return jsonResponse({ error: message }, 500);
    }
  };
}
