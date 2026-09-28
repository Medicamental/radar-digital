function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

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

async function handleApi(request, env, url) {
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
    const doc = {
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
      criadoEm: new Date().toISOString(),
    };
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
      criadoEm: existing.criadoEm,
      atualizadoEm: new Date().toISOString(),
    };
    await env.CAMPANHAS.put('campanha:' + id, JSON.stringify(doc));
    return json({ id, ...doc });
  }

  if (request.method === 'DELETE' && id) {
    await env.CAMPANHAS.delete('campanha:' + id);
    return json({ ok: true });
  }

  return json({ error: 'Não encontrado' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/campanhas')) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
