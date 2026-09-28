function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MiB

async function listCampanhas(env) {
  const items = [];
  let cursor;
  do {
    const page = await env.CAMPANHAS.list({ prefix: 'campanha:', cursor });
    for (const key of page.keys) {
      const value = await env.CAMPANHAS.get(key.name, 'json');
      if (value) items.push({ id: key.name.slice('campanha:'.length), ...value });
    }
    cursor = page.cursor;
  } while (cursor);
  items.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return items;
}

function campanhaDocFromBody(body) {
  return {
    nome: String(body.nome),
    canal: String(body.canal),
    data: String(body.data),
    vigencia: String(body.vigencia),
    estado: String(body.estado),
    cluster: String(body.cluster),
    enviados: Number(body.enviados) || 0,
    abriram: Number(body.abriram) || 0,
    vendaGerada: Number(body.vendaGerada) || 0,
    positivacao: Number(body.positivacao) || 0,
    imagemId: body.imagemId ? String(body.imagemId) : null,
  };
}

async function handleCampanhas(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','campanhas', maybe id]
  const id = parts[2];

  if (request.method === 'GET' && !id) {
    const items = await listCampanhas(env);
    return json(items);
  }

  if (request.method === 'POST' && !id) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON inválido' }, 400);
    }
    const required = ['nome', 'canal', 'data', 'vigencia', 'estado', 'cluster'];
    for (const field of required) {
      if (!body[field]) return json({ error: `Campo obrigatório ausente: ${field}` }, 400);
    }
    const doc = { ...campanhaDocFromBody(body), criadoEm: new Date().toISOString() };
    const newId = crypto.randomUUID();
    await env.CAMPANHAS.put('campanha:' + newId, JSON.stringify(doc));
    return json({ id: newId, ...doc }, 201);
  }

  if (request.method === 'PUT' && id) {
    const existing = await env.CAMPANHAS.get('campanha:' + id, 'json');
    if (!existing) return json({ error: 'Disparo não encontrado' }, 404);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON inválido' }, 400);
    }
    const required = ['nome', 'canal', 'data', 'vigencia', 'estado', 'cluster'];
    for (const field of required) {
      if (!body[field]) return json({ error: `Campo obrigatório ausente: ${field}` }, 400);
    }
    const doc = {
      ...campanhaDocFromBody(body),
      criadoEm: existing.criadoEm,
      atualizadoEm: new Date().toISOString(),
    };
    if (existing.imagemId && existing.imagemId !== doc.imagemId) {
      await env.CAMPANHAS.delete('imagem:' + existing.imagemId).catch(() => {});
    }
    await env.CAMPANHAS.put('campanha:' + id, JSON.stringify(doc));
    return json({ id, ...doc });
  }

  if (request.method === 'DELETE' && id) {
    const existing = await env.CAMPANHAS.get('campanha:' + id, 'json');
    if (existing?.imagemId) {
      await env.CAMPANHAS.delete('imagem:' + existing.imagemId).catch(() => {});
    }
    await env.CAMPANHAS.delete('campanha:' + id);
    return json({ ok: true });
  }

  return json({ error: 'Não encontrado' }, 404);
}

async function handleImagens(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','imagens', maybe id]
  const id = parts[2];

  if (request.method === 'POST' && !id) {
    const contentType = request.headers.get('content-type') || '';
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return json({ error: 'Tipo de imagem não suportado. Use PNG, JPEG, WEBP ou GIF.' }, 400);
    }
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) return json({ error: 'Arquivo vazio' }, 400);
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return json({ error: 'Imagem maior que 8 MB' }, 413);
    }
    const newId = crypto.randomUUID();
    await env.CAMPANHAS.put('imagem:' + newId, bytes, { metadata: { contentType } });
    return json({ id: newId }, 201);
  }

  if (request.method === 'GET' && id) {
    const { value, metadata } = await env.CAMPANHAS.getWithMetadata('imagem:' + id, 'arrayBuffer');
    if (!value) return new Response('Não encontrado', { status: 404 });
    return new Response(value, {
      headers: {
        'content-type': metadata?.contentType || 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  }

  return json({ error: 'Não encontrado' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/campanhas')) {
      return handleCampanhas(request, env, url);
    }
    if (url.pathname.startsWith('/api/imagens')) {
      return handleImagens(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
