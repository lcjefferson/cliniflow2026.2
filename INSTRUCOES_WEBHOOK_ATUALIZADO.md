# 📱 Instruções para Configurar Webhook WhatsApp - CliniFlow

## ✅ Status Atual

O sistema está configurado e pronto para receber webhooks do WhatsApp!

### 🔗 URL Pública do Webhook
```
https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp
```

### 🔑 Verify Token Configurado
```
cliniflow_webhook_2025
```

---

## 📋 Passo a Passo para Configurar no Meta for Developers

### 1️⃣ Acessar o Meta for Developers
- Vá para: https://developers.facebook.com/
- Faça login com sua conta
- Acesse seu App do WhatsApp Business

### 2️⃣ Navegar até Configurações de Webhook
1. No menu lateral, clique em **"WhatsApp"** → **"Configuração"**
2. Role até a seção **"Webhook"**
3. Clique em **"Editar"** ou **"Configurar Webhook"**

### 3️⃣ Inserir as Informações do Webhook

**URL de Callback:**
```
https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp
```

**Token de Verificação:**
```
cliniflow_webhook_2025
```

### 4️⃣ Verificar e Salvar
1. Clique em **"Verificar e Salvar"**
2. O Meta vai fazer uma requisição para validar o webhook
3. Se tudo estiver correto, você verá uma mensagem de sucesso ✅

### 5️⃣ Assinar Eventos (Subscribe)
Após salvar o webhook, você precisa se inscrever nos eventos que deseja receber:

✅ Marque as seguintes opções:
- **messages** (para receber mensagens)
- **messaging_postbacks** (para receber callbacks)
- **message_deliveries** (opcional - status de entrega)
- **message_reads** (opcional - status de leitura)

Clique em **"Salvar"** novamente.

---

## 🧪 Testar o Webhook

### Teste Manual
1. Envie uma mensagem do WhatsApp para o número configurado no Meta
2. Verifique os logs do backend:
```bash
tail -f /var/log/supervisor/backend.*.log
```

3. A mensagem deve aparecer na página Omnichannel do CliniFlow

### Verificar Logs do Túnel
```bash
cat /tmp/localtunnel.log
cat /tmp/keep_tunnel_alive.log
```

---

## ⚠️ IMPORTANTE - Sobre o LocalTunnel

### Limitações
- **Solução Temporária**: LocalTunnel é apenas para desenvolvimento/testes
- **Instabilidade**: O túnel pode cair e a URL pode mudar
- **Performance**: Pode haver latência adicional nas mensagens

### Script de Monitoramento
Um script está rodando em background (`keep_tunnel_alive.sh`) que:
- Verifica se o túnel está ativo a cada 30 segundos
- Reinicia automaticamente se cair
- Mantém o mesmo subdomínio: `cliniflow-webhook`

### Verificar Status do Túnel
```bash
# Ver se o túnel está rodando
ps aux | grep "lt --port"

# Ver URL atual
cat /tmp/localtunnel_url.log

# Ver logs
tail -f /tmp/localtunnel.log
```

---

## 🚀 Recomendação para Produção

Para usar em **produção**, você DEVE fazer o deploy do CliniFlow em um servidor com:
- URL pública estável (domínio próprio)
- HTTPS configurado
- Alta disponibilidade

**Opções de Deploy:**
1. **Emergent Platform**: Deploy nativo com um clique
2. **Cloud Providers**: AWS, Google Cloud, Azure
3. **VPS**: DigitalOcean, Linode, Vultr

Após o deploy em produção:
- A URL será estável (ex: `https://cliniflow.seudominio.com.br`)
- Configure o webhook no Meta com a nova URL
- Remova o LocalTunnel

---

## 🔧 Solução de Problemas

### Webhook não está sendo verificado
1. Verifique se o túnel está rodando: `ps aux | grep "lt --port"`
2. Teste localmente: `curl "http://localhost:8001/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=cliniflow_webhook_2025&hub.challenge=test"`
3. Verifique os logs do backend

### Mensagens não estão sendo recebidas
1. Verifique se você se inscreveu nos eventos corretos no Meta
2. Verifique os logs: `tail -f /var/log/supervisor/backend.*.log`
3. Confirme que o túnel está ativo
4. Teste enviando uma mensagem e verifique se aparece no log

### Túnel caiu e a URL mudou
1. O script `keep_tunnel_alive.sh` deve reiniciar automaticamente
2. Se a URL mudou, você precisa RE-CONFIGURAR no Meta for Developers
3. Use o comando para ver a nova URL: `cat /tmp/localtunnel_url.log`

---

## 📞 Próximos Passos

Depois de configurar e testar o recebimento de mensagens:

1. ✅ Teste enviando mensagens do WhatsApp
2. ✅ Verifique se aparecem na página Omnichannel
3. ✅ Implemente o envio de respostas (já está preparado no código)
4. ✅ Configure os tokens de acesso do Meta para enviar mensagens
5. 🚀 Faça o deploy em produção para uso real

---

**Data de Configuração:** 19/11/2025
**Versão:** 1.0
**Status:** ✅ Webhook Configurado e Pronto
