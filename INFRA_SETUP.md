# Chavea — Infraestrutura de Produção

Este guia provisiona Cloudflare Pages, R2 e Hyperdrive para o Chavea. O PostgreSQL permanece hospedado no Railway.

> Nunca grave URLs de banco, tokens ou senhas no Git. Use secrets/variables do GitHub e secrets do Worker.

## 1. Pré-requisitos

Na raiz do repositório, instale as dependências e autentique o Wrangler:

```bash
npm ci
npx wrangler login
```

## 2. Railway PostgreSQL

No Railway, copie a URL **direta** do PostgreSQL. Ela será usada em dois lugares:

- GitHub Actions secret `DATABASE_URL_DIRECT`, exclusivamente para `prisma migrate deploy`.
- Criação do Hyperdrive, para que o Worker alcance o PostgreSQL por uma conexão gerenciada.

Formato esperado:

```text
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

Não commite essa URL.

## 3. Cloudflare Pages

Crie o projeto com `main` como branch de produção:

```bash
npx wrangler pages project create chavea --production-branch=main
```

O pipeline fará os próximos deploys com:

```bash
cd apps/web
npx wrangler pages deploy dist --project-name=chavea --branch=main
cd ../..
```

## 4. Cloudflare R2

Crie o bucket das evidências:

```bash
npx wrangler r2 bucket create chavea-evidence
```

O binding já está definido em `apps/api/wrangler.toml` como:

```toml
[[r2_buckets]]
binding = "EVIDENCE_BUCKET"
bucket_name = "chavea-evidence"
```

No painel do R2, configure uma Object Lifecycle Rule para remover automaticamente os objetos de `match-evidence/` após 1 dia. Evidências de placar não devem ser mantidas indefinidamente.

## 5. Cloudflare Hyperdrive

Crie o Hyperdrive usando a conexão PostgreSQL fornecida pelo Railway:

```bash
npx wrangler hyperdrive create chavea-postgres --connection-string="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
```

O comando retorna um ID. Substitua `REPLACE_WITH_HYPERDRIVE_ID` em `apps/api/wrangler.toml`:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "COLE_O_HYPERDRIVE_ID_AQUI"
```

Depois faça commit dessa alteração. O ID do Hyperdrive é configuração de recurso; a senha do banco continua fora do repositório.

## 6. GitHub Actions — Secrets

No repositório GitHub, cadastre estes **Actions secrets**:

```text
CLOUDFLARE_API_TOKEN=<token com permissões necessárias para Workers/Pages>
CLOUDFLARE_ACCOUNT_ID=<account id da conta Cloudflare>
DATABASE_URL_DIRECT=<url PostgreSQL direta do Railway>
```

O `CLOUDFLARE_API_TOKEN` deve seguir princípio de menor privilégio e permitir os recursos usados pelo pipeline (Workers e Pages).

## 7. GitHub Actions — Variable

Cadastre esta **Actions variable**:

```text
VITE_API_URL=https://SEU-WORKER.workers.dev
```

Use a URL pública final da API. Como variáveis `VITE_*` são incorporadas ao bundle do navegador, nunca coloque segredos nelas.

## 8. Secrets e variáveis do Worker

A API também espera configurações de runtime como `SESSION_SECRET`, credenciais OAuth Google e `WEB_APP_URL`. Cadastre valores sensíveis via `wrangler secret put`, por exemplo:

```bash
cd apps/api
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REDIRECT_URI
npx wrangler secret put WEB_APP_URL
cd ../..
```

Quando solicitado, informe cada valor sem adicioná-lo ao Git.

## 9. Primeiro deploy

Confirme que `apps/api/wrangler.toml` contém o ID real do Hyperdrive. Depois, um push na `main` executará os três jobs:

1. `Database · Railway migrations` — `npx prisma migrate deploy` usando `DATABASE_URL_DIRECT`.
2. `Worker · Hono API` — `npx wrangler deploy`.
3. `Pages · React PWA` — build Vite e `npx wrangler pages deploy dist --project-name=chavea --branch=main`.

Para disparar após configurar tudo:

```bash
git add apps/api/wrangler.toml
git commit -m "chore(infra): set production Hyperdrive id"
git push origin main
```

## Checklist

- [ ] PostgreSQL Railway criado e acessível
- [ ] `DATABASE_URL_DIRECT` cadastrada como GitHub secret
- [ ] Login Wrangler concluído
- [ ] Pages `chavea` criado
- [ ] R2 `chavea-evidence` criado
- [ ] Lifecycle R2 de 1 dia configurado
- [ ] Hyperdrive `chavea-postgres` criado
- [ ] Hyperdrive ID gravado no `wrangler.toml`
- [ ] `CLOUDFLARE_API_TOKEN` cadastrado
- [ ] `CLOUDFLARE_ACCOUNT_ID` cadastrado
- [ ] `VITE_API_URL` cadastrada como GitHub Actions variable
- [ ] Secrets de runtime do Worker cadastrados
- [ ] Push na `main` executado
