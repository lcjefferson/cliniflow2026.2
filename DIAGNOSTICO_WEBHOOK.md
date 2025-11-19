# 🔍 Diagnóstico do Problema de Webhook

## Problema Identificado:

O túnel LocalTunnel não é estável e está caindo frequentemente. Quando o túnel cai, o Meta não consegue enviar as mensagens.

## Status Atual:
- ✅ Backend funcionando corretamente
- ✅ Endpoint do webhook correto
- ❌ Túnel LocalTunnel instável (cai com frequência)
- ❌ Meta não está enviando webhooks POST

## Soluções:

### Solução 1: Usar ngrok com token (RECOMENDADO)

O ngrok é muito mais estável que o localtunnel, mas precisa de uma conta grátis.

**Passos:**
1. Crie uma conta grátis em: https://dashboard.ngrok.com/signup
2. Copie seu authtoken em: https://dashboard.ngrok.com/get-started/your-authtoken
3. Configure o authtoken:
```bash
ngrok authtoken SEU_TOKEN_AQUI
```
4. Inicie o túnel:
```bash
ngrok http 8001
```
5. Copie a URL HTTPS fornecida (ex: https://xxxx-xx-xx-xx-xx.ngrok-free.app)
6. Configure no Meta: `https://xxxx-xx-xx-xx-xx.ngrok-free.app/api/webhooks/whatsapp`

### Solução 2: Deploy em Produção (MELHOR)

Use o botão "Deploy" da plataforma Emergent para publicar em um domínio permanente.

### Solução 3: Manter o LocalTunnel Rodando

Se quiser continuar com o LocalTunnel, você precisa:

1. **Manter o processo rodando:**
```bash
# Iniciar o túnel
nohup lt --port 8001 --subdomain cliniflow-webhook > /tmp/localtunnel.log 2>&1 &

# Verificar se está rodando
ps aux | grep "lt --port"

# Ver a URL
cat /tmp/localtunnel.log
```

2. **Re-validar o webhook no Meta sempre que reiniciar:**
   - Após reiniciar o túnel, você precisa ir ao Meta for Developers
   - Ir em Configuração do WhatsApp → Webhook
   - Clicar em "Editar" e depois "Verificar e Salvar" novamente

## Como Verificar se o Meta está Enviando Webhooks:

### 1. Monitorar logs em tempo real:
```bash
tail -f /var/log/supervisor/backend.out.log | grep -i "whatsapp\|webhook"
```

### 2. Verificar no Meta for Developers:
- Vá para seu App → WhatsApp → Configuração
- Role até "Webhooks"
- Verifique se está inscrito em:
  - ✅ messages
  - ✅ message_status

### 3. Testar manualmente:
```bash
# Teste a validação
curl "https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=ichrg8pgmhp&hub.challenge=TEST"

# Simule uma mensagem
curl -X POST https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "field": "messages",
        "value": {
          "messages": [{
            "from": "5511999999999",
            "id": "test",
            "text": {"body": "Teste"},
            "timestamp": "1700000000"
          }]
        }
      }]
    }]
  }'
```

## Checklist de Troubleshooting:

- [ ] O túnel está rodando? (`ps aux | grep "lt --port"`)
- [ ] A URL está acessível? (`curl https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=ichrg8pgmhp&hub.challenge=TEST`)
- [ ] O webhook está inscrito nos eventos corretos no Meta?
- [ ] Você re-validou o webhook após reiniciar o túnel?
- [ ] Os logs mostram requisições POST chegando? (`tail -f /var/log/supervisor/backend.out.log`)

## Recomendação Final:

**Para ambiente de produção**: Use o deploy da plataforma Emergent em vez do LocalTunnel.

**Para testes rápidos**: Use ngrok com autenticação (mais estável que localtunnel).

**LocalTunnel é útil apenas para testes rápidos**, mas não é confiável para uso contínuo.
