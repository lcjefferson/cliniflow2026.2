# Migração Render → Coolify (VPS própria)

Este guia cobre a migração do CliniFlow do Render para o Coolify em
`http://72.60.154.65:8000/`. Foram adicionados ao repositório:

- [backend/Dockerfile](backend/Dockerfile) — imagem da API (FastAPI/Uvicorn)
- [frontend/Dockerfile](frontend/Dockerfile) + [frontend/nginx.conf](frontend/nginx.conf) — build do React servido via Nginx
- `.dockerignore` em `backend/` e `frontend/`

Estrutura escolhida: **2 recursos separados no Coolify**, ambos apontando para
o mesmo repositório Git, cada um com "Base Directory" diferente
(`/backend` e `/frontend`).

## 0. Pré-requisitos

- Repositório acessível pelo Coolify (GitHub/GitLab, ou via deploy key se for privado).
- String de conexão do MongoDB Atlas atual (a mesma `MONGO_URL` já usada no Render) — não precisa migrar dados, só reaproveitar a connection string.
- Dois domínios/subdomínios apontando para o IP da VPS (ex.: `api.seudominio.com` e `app.seudominio.com`), ou use os domínios `*.sslip.io`/`*.nip.io` que o Coolify sugere automaticamente se ainda não tiver DNS configurado.

## 1. Criar o recurso do Backend

1. No Coolify, **New Resource → Application → from a Git repository**.
2. Selecione o repositório e a branch (ex.: `develop` ou a branch de produção que você usa).
3. **Build Pack**: `Dockerfile`.
4. **Base Directory**: `/backend`.
5. **Dockerfile Location**: `Dockerfile` (relativo ao base directory).
6. **Port**: `8000` (é a porta exposta no Dockerfile).
7. **Health Check Path**: `/api/health` (mesmo path usado no Render).
8. Variáveis de ambiente (aba *Environment Variables*):

   | Variável | Valor |
   |---|---|
   | `MONGO_URL` | a connection string do Atlas (a mesma do Render) |
   | `DB_NAME` | `clinicflow` |
   | `CORS_ORIGINS` | `https://app.seudominio.com` (domínio final do frontend) |
   | `JWT_SECRET_KEY` | gerar um valor novo e forte — **não** reuse o default do código. Gere com `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` |
   | `JWT_ALGORITHM` | `HS256` |
   | `JWT_EXPIRATION_MINUTES` | `10080` (ou o valor que você já usa) |
   | `PASSWORD_SCHEME` | `bcrypt` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | só necessários se o seed de admin inicial for usado; senão pode omitir |
   | `BACKEND_URL` | a URL pública final da API, ex. `https://api.seudominio.com` (usado para montar links/webhooks) |

9. **Persistent Storage**: adicione um volume mapeando `/app/media` dentro do
   container para um path persistente no host. O backend grava uploads de
   mídia do WhatsApp em disco (`backend/media`) — sem esse volume, os arquivos
   somem a cada novo deploy.
10. Deploy. Depois de subir, teste `https://<domínio-da-api>/api/health`.

## 2. Criar o recurso do Frontend

1. **New Resource → Application → from a Git repository**, mesmo repositório.
2. **Build Pack**: `Dockerfile`.
3. **Base Directory**: `/frontend`.
4. **Port**: `80`.
5. **Build Argument** (aba *Build Args* ou *Environment Variables* marcadas como build-time): `REACT_APP_BACKEND_URL=https://api.seudominio.com`
   - Importante: esse valor é "assado" dentro do build do React (CRA faz isso em tempo de build, não de runtime). Se você mudar a URL da API depois, precisa rebuildar o frontend, não só reiniciar.
6. Deploy. Depois de subir, acesse o domínio do frontend e confirme que o
   login funciona (ou seja, que ele está falando com a API nova).

## 3. Domínios e HTTPS

No Coolify, em cada recurso, aba **Domains**: adicione o domínio final
(`api.seudominio.com`, `app.seudominio.com`) e deixe o Coolify emitir o
certificado Let's Encrypt automaticamente (ele já tem um proxy Traefik/Caddy
integrado).

Depois de configurar os domínios reais, **atualize**:
- `CORS_ORIGINS` no backend para o domínio real do frontend.
- `REACT_APP_BACKEND_URL` (build arg) no frontend para o domínio real da API, e rebuilde.

## 4. Webhook do WhatsApp (UAZ-API / Meta)

A URL do webhook (`/api/webhooks/whatsapp`) está hoje configurada apontando
para o domínio do Render. Depois do cutover, atualize no painel da
UAZ-API/Meta for Developers para a nova URL
`https://api.seudominio.com/api/webhooks/whatsapp` — senão as mensagens
recebidas não chegam mais.

## 5. Corte (cutover) sem downtime

1. Suba os dois recursos no Coolify com os domínios temporários (sslip.io) primeiro, teste tudo.
2. Quando estiver validado, aponte o DNS dos domínios finais para o Coolify (ou já cadastre eles direto no Coolify se o DNS já for o definitivo).
3. Atualize o webhook do WhatsApp para a nova URL.
4. Só então desative os serviços no Render.

## 6. Diferenças importantes em relação ao Render

- Render fazia build nativo via `pip install` / `yarn build` (buildpack). Agora
  o build acontece dentro do Dockerfile — mais previsível, mas qualquer
  dependência de sistema nova (ex. para Pillow/cryptography) precisa ser
  adicionada ao `apt-get install` do [backend/Dockerfile](backend/Dockerfile).
- `REACT_APP_BACKEND_URL` agora é um **build arg**, não só uma env var de
  runtime — mudar de ambiente exige rebuild do frontend.
- Uploads de mídia (`backend/media`) precisam de um **volume persistente**
  no Coolify; no Render isso rodava em disco efêmero (risco que já existia lá
  também, então migrar para um volume é uma melhoria).

## Checklist rápido

- [ ] Backend deployado no Coolify, `/api/health` respondendo 200
- [ ] Volume `/app/media` persistente configurado
- [ ] `JWT_SECRET_KEY` novo e forte configurado
- [ ] `MONGO_URL` do Atlas configurado e testado
- [ ] Frontend deployado, build arg `REACT_APP_BACKEND_URL` correto
- [ ] Domínios configurados com HTTPS (Let's Encrypt via Coolify)
- [ ] `CORS_ORIGINS` atualizado para o domínio final do frontend
- [ ] Webhook do WhatsApp atualizado para a nova URL da API
- [ ] Testado login, agendamento, envio/recebimento de mensagem WhatsApp
- [ ] Render desativado
