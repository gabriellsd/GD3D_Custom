import { jsonResponse } from './auth-token.mjs';

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
