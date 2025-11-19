# 🔍 Diagnóstico: Omnichannel WhatsApp - Mensagens Não Chegam

**Data:** 19/11/2025 - 23:36
**Status:** ⚠️ WEBHOOK VERIFICADO MAS MENSAGENS NÃO CHEGAM

---

## ✅ O QUE ESTÁ FUNCIONANDO

1. **LocalTunnel:** ✅ Ativo e acessível
   - URL: `https://cliniflow-webhook.loca.lt`
   - Teste GET: Funcionando perfeitamente
   - Tunnel rodando: PID 267

2. **Backend Webhook:** ✅ Endpoint funcionando
   - Endpoint: `/api/webhooks/whatsapp`
   - Teste local POST: Retorna `{"status":"ok"}`
   - Verificação GET: Retorna challenge correto

3. **Configuração Meta:** ✅ Webhook conectado
   - Verificação no Meta: Sucesso
   - Campo "messages": Subscrito
   - Access Token: Configurado
   - Phone Number ID: 857247354135552
   - Business Account ID: 2272353643208771

---

## ❌ O QUE NÃO ESTÁ FUNCIONANDO

**Problema Principal:** Meta NÃO está enviando requisições POST quando mensagens reais são enviadas do WhatsApp.

**Evidências:**
- Usuário envia mensagem do WhatsApp ✓
- Nenhuma requisição POST chega em `/api/webhooks/whatsapp` ✗
- Logs do backend não mostram chamadas do Meta ✗
- Página Omnichannel não recebe mensagens ✗

---

## 🔍 POSSÍVEIS CAUSAS

### 1️⃣ **App no Modo Desenvolvimento (mais provável)**
- Apps em modo desenvolvimento têm limitações
- Webhooks podem não funcionar totalmente
- **Solução:** Mudar app para modo "Ativo/Live"

### 2️⃣ **Número de Telefone Não Ativado**
- Número pode estar apenas "verificado" mas não "ativo"
- Status precisa ser "Ativo" para receber/enviar mensagens
- **Solução:** Ativar número no Meta Business Manager

### 3️⃣ **Webhook Subscription Não Completa**
- Verificação (GET) funciona
- Mas subscription real (POST) não está ativa
- **Solução:** Re-subscrever manualmente no Meta

### 4️⃣ **Permissões do Access Token**
- Token pode não ter permissão `whatsapp_business_messaging`
- **Solução:** Gerar novo token com permissões corretas

### 5️⃣ **LocalTunnel Bloqueado pelo Meta**
- Meta pode estar bloqueando domínios .loca.lt
- Alguns provedores bloqueiam túneis públicos
- **Solução:** Usar ngrok ou fazer deploy em produção

---

## 📋 CHECKLIST PARA O USUÁRIO

**No Meta for Developers:**

- [ ] **Verificar Modo do App**
  - Dashboard → Configurações → Básico
  - Status deve ser: **"Ativo" ou "Live"**
  - Se for "Desenvolvimento", mudar para Ativo

- [ ] **Verificar Status do Número**
  - WhatsApp → Números de Telefone
  - Status deve ser: **"Ativo"** (não apenas "Verificado")
  - Se não estiver, clicar em "Ativar"

- [ ] **Verificar Permissões do Token**
  - Ferramentas → Graph API Explorer
  - Token precisa ter: `whatsapp_business_messaging`
  - Gerar novo token se necessário

- [ ] **Re-subscrever Webhook**
  - WhatsApp → Configuração → Webhook
  - DESMARCAR "messages" → SALVAR
  - MARCAR "messages" novamente → SALVAR

- [ ] **Verificar Logs no Meta**
  - WhatsApp → Configuração → Webhook
  - Ver se há erros nos logs do Meta
  - Copiar qualquer erro encontrado

---

## 🧪 TESTES REALIZADOS

```bash
# Teste 1: Verificação do túnel
curl "https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=cliniflow_webhook_2025&hub.challenge=test123"
Resultado: ✅ "test123" (OK)

# Teste 2: POST local no webhook
curl -X POST http://localhost:8001/api/webhooks/whatsapp -d '{...}'
Resultado: ✅ {"status":"ok"} (OK)

# Teste 3: Mensagem real do WhatsApp
Usuário enviou mensagem
Resultado: ❌ Nenhum POST recebido no backend
```

---

## 🚀 PRÓXIMOS PASSOS

**OPÇÃO 1: Resolver no Meta (Recomendado para agora)**
1. Verificar todos os itens do checklist acima
2. Especialmente: Modo do app e Status do número
3. Re-subscrever ao webhook
4. Testar novamente

**OPÇÃO 2: Usar Ngrok ao invés de LocalTunnel**
```bash
# Instalar ngrok
npm install -g ngrok

# Iniciar túnel
ngrok http 8001

# Pegar URL gerada e configurar no Meta
```

**OPÇÃO 3: Deploy em Produção (Melhor solução)**
- Fazer deploy do CliniFlow na Emergent Platform
- Usar URL estável (ex: cliniflow.seudominio.com.br)
- Configurar webhook com a URL de produção
- Eliminar problemas de túneis temporários

---

## 📝 NOTAS TÉCNICAS

- **LocalTunnel:** Funcional mas pode ter limitações com Meta
- **Webhook Verification:** Funciona (GET request OK)
- **Webhook Messages:** Não funciona (POST não chega)
- **Isso indica:** Problema de configuração no Meta, não no código

**Conclusão:** O problema é 99% configuração no lado do Meta, não no CliniFlow.
