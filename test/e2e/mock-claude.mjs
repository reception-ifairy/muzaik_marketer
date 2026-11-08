// Minimal Anthropic API mock for the studio: model list + one structured answer (a material draft) for messages.parse.
// It returns a deliberately imperfect draft (too many bars, Ingredients without an image, a legacy name, a foreign link,
// the model's own end card) so the code checks (finalizeDraft / cleanCopy) have something to fix.
import http from 'http';
const PORT = Number(process.argv[2] || 4599);
const draft = {
  concept: 'Nocna jazda przez neonowe miasto — od ciszy przed świtem do eksplozji świateł na refrenie.',
  hook: 'Zbliżenie na świecącą linię drogi, która zapala się w rytm stopy.',
  styleAnchor: '1980s retro-futuristic night, neon cyan and magenta, light fog, VHS grain.',
  shots: [
    { bars: 2, role: 'hook', visual: 'flow', prompt: 'Extreme close-up of a glowing neon road line igniting', mode: 'text', reference: null, sceneId: null, cardText: null, note: 'Hak: światło zapala się na stopie.' },
    { bars: 3, role: 'build', visual: 'parallax', prompt: '', mode: 'text', reference: null, sceneId: 'scena-testowa-zla', cardText: null, note: 'Spokojne narastanie na scenie kanału.' },
    { bars: 2, role: 'story', visual: 'plansza', prompt: '', mode: 'text', reference: null, sceneId: null, cardText: 'Muzyka z DarkaIK nocy', note: 'Krótki napis.' },
    { bars: 9, role: 'drop', visual: 'flow', prompt: 'A chrome car speeds through a neon city as the lights explode', mode: 'ingredients', reference: null, sceneId: null, cardText: null, note: 'Refren: wybuch świateł.' },
    { bars: 2, role: 'outro', visual: 'plansza', prompt: '', mode: 'text', reference: null, sceneId: null, cardText: 'Subskrybuj', note: 'Koniec.' },
  ],
  copy: { title: 'MuzaIK – Nocna jazda', description: 'Stworzyłam ten zwiastun dla Was. Więcej: https://example.com/x', tags: ['synthwave', 'MuzaIK', 'retro'], hashtags: ['synthwave', 'retrowave'] },
};
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c)).on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url.startsWith('/v1/models')) return res.end(JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', type: 'model', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' }));
    if (req.method === 'POST' && req.url.startsWith('/v1/messages')) {
      const j = JSON.parse(body || '{}');
      return res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: j.model, content: [{ type: 'text', text: JSON.stringify(draft) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
}).listen(PORT, '127.0.0.1', () => console.log(`mock claude on ${PORT}`));
