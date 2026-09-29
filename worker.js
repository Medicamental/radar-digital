function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MiB

// Todos os disparos ficam num único documento: o plano gratuito do KV permite só 1.000 list()/dia,
// e listar a cada atualização da página esgotava a cota. get() tem cota de 100.000/dia.
const INDEX_KEY = 'index:campanhas';

const sortByDate = items => items.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

async function legacyList(env) {
  const items = [];
  let cursor;
  do {
    const page = await env.CAMPANHAS.list({ prefix: 'campanha:', cursor });
    for (const key of page.keys) {
      const value = await env.CAMPANHAS.get(key.name, 'json');
      if (value) items.push({ id: key.name.slice('campanha:'.length), ...value });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return items;
}

// Carrega o índice; enquanto os registros antigos (uma chave por disparo) não tiverem sido
// incorporados, tenta migrá-los. Se a cota de list() do dia já acabou, segue com o que o índice tem.
async function loadIndex(env) {
  const idx = (await env.CAMPANHAS.get(INDEX_KEY, 'json')) || { migrated: false, items: [], deleted: [] };
  if (idx.migrated) return idx;
  try {
    const legacy = await legacyList(env);
    const byId = new Map(legacy.map(d => [d.id, d]));
    for (const item of idx.items) byId.set(item.id, item);
    for (const id of idx.deleted || []) byId.delete(id);
    const migrated = { migrated: true, items: sortByDate([...byId.values()]) };
    await env.CAMPANHAS.put(INDEX_KEY, JSON.stringify(migrated));
    return migrated;
  } catch (err) {
    return { ...idx, deleted: idx.deleted || [], pending: true };
  }
}

async function saveIndex(env, idx) {
  const { pending, ...rest } = idx;
  rest.items = sortByDate(rest.items);
  await env.CAMPANHAS.put(INDEX_KEY, JSON.stringify(rest));
}

async function findCampanha(env, idx, id) {
  const inIndex = idx.items.find(d => d.id === id);
  if (inIndex) return inIndex;
  if (idx.migrated || (idx.deleted || []).includes(id)) return null;
  const legacy = await env.CAMPANHAS.get('campanha:' + id, 'json');
  return legacy ? { id, ...legacy } : null;
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

async function readBody(request) {
  try {
    const body = await request.json();
    const required = ['nome', 'canal', 'data', 'vigencia', 'estado', 'cluster'];
    for (const field of required) {
      if (!body[field]) return { error: `Campo obrigatório ausente: ${field}` };
    }
    return { body };
  } catch {
    return { error: 'JSON inválido' };
  }
}

async function handleCampanhas(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','campanhas', maybe id]
  const id = parts[2];

  if (request.method === 'GET' && !id) {
    const idx = await loadIndex(env);
    return json(sortByDate([...idx.items]), 200, idx.pending ? { 'x-radar-migration': 'pending' } : {});
  }

  if (request.method === 'POST' && !id) {
    const { body, error } = await readBody(request);
    if (error) return json({ error }, 400);
    const idx = await loadIndex(env);
    const doc = { id: crypto.randomUUID(), ...campanhaDocFromBody(body), criadoEm: new Date().toISOString() };
    idx.items.push(doc);
    await saveIndex(env, idx);
    return json(doc, 201);
  }

  if (request.method === 'PUT' && id) {
    const { body, error } = await readBody(request);
    if (error) return json({ error }, 400);
    const idx = await loadIndex(env);
    const existing = await findCampanha(env, idx, id);
    if (!existing) return json({ error: 'Disparo não encontrado' }, 404);
    const doc = {
      id,
      ...campanhaDocFromBody(body),
      criadoEm: existing.criadoEm,
      atualizadoEm: new Date().toISOString(),
    };
    if (existing.imagemId && existing.imagemId !== doc.imagemId) {
      await env.CAMPANHAS.delete('imagem:' + existing.imagemId).catch(() => {});
    }
    idx.items = idx.items.filter(d => d.id !== id);
    idx.items.push(doc);
    await saveIndex(env, idx);
    return json(doc);
  }

  if (request.method === 'DELETE' && id) {
    const idx = await loadIndex(env);
    const existing = await findCampanha(env, idx, id);
    if (existing?.imagemId) {
      await env.CAMPANHAS.delete('imagem:' + existing.imagemId).catch(() => {});
    }
    idx.items = idx.items.filter(d => d.id !== id);
    if (!idx.migrated) idx.deleted = [...new Set([...(idx.deleted || []), id])];
    await saveIndex(env, idx);
    await env.CAMPANHAS.delete('campanha:' + id).catch(() => {});
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
    try {
      if (url.pathname.startsWith('/api/campanhas')) {
        return await handleCampanhas(request, env, url);
      }
      if (url.pathname.startsWith('/api/imagens')) {
        return await handleImagens(request, env, url);
      }
    } catch (err) {
      const quota = /limit exceeded/i.test(String(err && err.message));
      return json(
        { error: quota ? 'Limite diário do banco de dados atingido. Tente novamente mais tarde.' : 'Erro interno ao acessar os dados.' },
        quota ? 503 : 500,
      );
    }
    return env.ASSETS.fetch(request);
  },
};
