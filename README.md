# Radar Digital

Dashboard de disparos de promoção (B2list & Web): quantos enviou, quantos abriram, custo do disparo, venda gerada, positivação e ROI.

## Arquitetura

- `public/index.html` — frontend estático (mesmo design system dos outros radares: Space Grotesk + Inter + JetBrains Mono, fundo navy com glow).
- `worker.js` — Cloudflare Worker: serve o frontend e expõe a API `/api/campanhas` (GET lista, POST adiciona, DELETE remove), usando **Workers KV** como banco de dados.
- `wrangler.jsonc` — configuração do Worker, incluindo o binding do KV.

Diferente dos outros radares (que são só leitura, alimentados por JSON gerado por automação), este tem formulário — a responsável pelos envios preenche direto na página, os dados ficam salvos no Worker (KV), e qualquer pessoa com o link vê os cards atualizados (a página sincroniza a cada 15s).

## O que falta para colocar no ar

1. **Criar o namespace KV** (guarda os disparos):
   ```
   npm install wrangler --no-save
   node node_modules/wrangler/bin/wrangler.js kv namespace create CAMPANHAS
   ```
   (rodar sem `npx` — bloqueado por política de grupo nesta máquina). O comando devolve um `id`.

2. **Colar esse `id`** em `wrangler.jsonc`, no lugar de `PREENCHER_COM_O_ID_DO_NAMESPACE_KV`.

3. **Deploy**:
   - **Opção A — Git integration (recomendado, deploy automático a cada push):** no painel da Cloudflare, Workers & Pages → Create → Import a repository → apontar para `Medicamental/radar-digital`. Build command: vazio (não há build). Deploy command: `npx wrangler deploy`. Root directory: `/`.
   - **Opção B — deploy manual daqui:**
     ```
     node node_modules/wrangler/bin/wrangler.js deploy
     ```
     usando `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` como variáveis de ambiente.

4. Confirmar com `curl` que o link `https://radar-digital.eloapiresoliveira.workers.dev` está respondendo antes de considerar concluído.

## Canais e custo por envio

Definidos em `worker.js`/`public/index.html` (`CUSTO_POR_CANAL`): B2list R$ 0,30/envio, Web R$ 0,04/envio. Se o valor mudar, atualizar nos dois lugares.
