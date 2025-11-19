# 📱 Guia Completo do Omnichannel CliniFlow

## ✅ Sistema Implementado

O sistema de Omnichannel está 100% funcional e pronto para receber e enviar mensagens do WhatsApp!

## 🔧 O que foi implementado:

### Backend:
1. **Recebimento de Mensagens (Webhook)**
   - ✅ Endpoint `POST /webhooks/whatsapp` processando mensagens do Meta
   - ✅ Criação automática de leads quando recebe mensagem de novo número
   - ✅ Criação automática de conversas
   - ✅ Salvamento de mensagens no banco de dados

2. **Envio de Mensagens**
   - ✅ Endpoint `POST /conversations/{id}/messages` atualizado
   - ✅ Integração com WhatsApp Graph API
   - ✅ Envio automático de mensagens via API do WhatsApp
   - ✅ Usa credenciais salvas (phone_number_id e access_token)

3. **Gestão de Conversas**
   - ✅ Listagem de conversas (`GET /conversations`)
   - ✅ Listagem de mensagens (`GET /conversations/{id}/messages`)
   - ✅ Atribuir conversa a consultor (`PUT /conversations/{id}/assign`)
   - ✅ Fechar conversa (`PUT /conversations/{id}/close`)
   - ✅ Reabrir conversa (`PUT /conversations/{id}/reopen`)

### Frontend:
1. **Página Omnichannel (`/omnichannel`)**
   - ✅ Lista de conversas com filtros (Todos, Meus, Não Atribuídos)
   - ✅ Chat em tempo real
   - ✅ Envio e recebimento de mensagens
   - ✅ Atribuição de conversas
   - ✅ Auto-refresh a cada 10 segundos
   - ✅ Indicadores visuais de canal (WhatsApp, Instagram, Messenger)
   - ✅ Informações do lead (nome, telefone, email)

## 🚀 Como Funciona:

### 1. Fluxo de Recebimento de Mensagens:

```
Cliente envia mensagem no WhatsApp
        ↓
Meta envia webhook para: /api/webhooks/whatsapp
        ↓
Backend processa a mensagem:
  - Cria/encontra lead
  - Cria/encontra conversa
  - Salva mensagem no banco
        ↓
Frontend (auto-refresh) carrega novas mensagens
        ↓
Consultor vê a mensagem e pode responder
```

### 2. Fluxo de Envio de Mensagens:

```
Consultor digita mensagem no CliniFlow
        ↓
Frontend envia para: POST /conversations/{id}/messages
        ↓
Backend:
  - Salva mensagem no banco
  - Envia via WhatsApp Graph API
        ↓
Cliente recebe mensagem no WhatsApp
```

## 📋 Como Testar:

### Passo 1: Configurar Webhook no Meta
1. Acesse `/tunnel-webhook` no CliniFlow
2. Copie a Callback URL: `https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp`
3. Copie o Verify Token: `ichrg8pgmhp`
4. Configure no Meta for Developers
5. Marque os eventos: `messages` e `message_status`

### Passo 2: Enviar Mensagem de Teste
1. Use seu WhatsApp pessoal
2. Envie uma mensagem para o número do WhatsApp Business configurado
3. Aguarde alguns segundos

### Passo 3: Ver no Omnichannel
1. Acesse `/omnichannel` no CliniFlow
2. Você verá uma nova conversa aparecer
3. O lead será criado automaticamente com o número de telefone
4. A mensagem aparecerá no chat

### Passo 4: Responder
1. Clique na conversa
2. Clique em "Assumir Atendimento" (botão com ícone de usuário)
3. Digite sua resposta no campo de mensagem
4. Clique em "Enviar" ou pressione Enter
5. A mensagem será enviada via WhatsApp API
6. O cliente receberá no WhatsApp dele

## 🔍 Monitoramento e Debug:

### Ver logs do webhook:
```bash
tail -f /var/log/supervisor/backend.out.log | grep "WhatsApp"
```

### Ver todas as conversas no banco:
```bash
mongosh cliniflow_db --eval "db.conversations.find().pretty()"
```

### Ver todas as mensagens:
```bash
mongosh cliniflow_db --eval "db.messages.find().pretty()"
```

### Testar webhook manualmente:
```bash
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
            "id": "test123",
            "text": {
              "body": "Olá! Esta é uma mensagem de teste"
            },
            "timestamp": "1234567890"
          }]
        }
      }]
    }]
  }'
```

## 📊 Estrutura de Dados:

### Conversas (conversations):
```json
{
  "id": "uuid",
  "lead_id": "uuid-do-lead",
  "channel": "whatsapp",
  "assigned_to": "uuid-do-consultor ou null",
  "assigned_to_name": "Nome do Consultor",
  "status": "active ou closed",
  "last_message_at": "2025-11-19T15:00:00",
  "created_at": "2025-11-19T14:00:00"
}
```

### Mensagens (messages):
```json
{
  "id": "uuid",
  "conversation_id": "uuid-da-conversa",
  "sender_type": "lead ou consultant",
  "sender_id": "uuid",
  "sender_name": "Nome",
  "content": "Texto da mensagem",
  "read": false,
  "created_at": "2025-11-19T15:00:00"
}
```

### Leads (leads):
```json
{
  "id": "uuid",
  "name": "Nome do Lead",
  "phone": "5511999999999",
  "email": "",
  "status": "novo",
  "source": "whatsapp",
  "created_at": "2025-11-19T14:00:00"
}
```

## ⚡ Funcionalidades Adicionais:

### Auto-refresh:
- A página Omnichannel atualiza automaticamente a cada 10 segundos
- Novas mensagens aparecem sem precisar recarregar a página

### Filtros:
- **Todos**: Mostra todas as conversas
- **Meus**: Apenas conversas atribuídas a você
- **Não Atribuídos**: Conversas sem consultor

### Indicadores Visuais:
- 💬 WhatsApp (verde)
- 📷 Instagram (rosa)
- 💌 Messenger (azul)

## ⚠️ Notas Importantes:

1. **LocalTunnel é temporário**: Para produção, faça deploy em domínio permanente
2. **Rate Limits**: WhatsApp tem limites de mensagens por dia
3. **Qualidade do Número**: Números novos do WhatsApp Business têm limites menores
4. **Templates**: Mensagens para leads novos podem precisar de templates aprovados pelo Meta
5. **24h Window**: Após 24h sem mensagem do cliente, você precisa usar templates

## 🎯 Próximos Passos (Melhorias Futuras):

- [ ] WebSockets para atualização em tempo real (sem polling)
- [ ] Suporte a mensagens com mídia (imagens, vídeos, áudios)
- [ ] Templates de mensagens rápidas
- [ ] Estatísticas de atendimento
- [ ] Integração com Instagram e Messenger
- [ ] Notificações desktop
- [ ] Marcação de mensagens como lidas
- [ ] Histórico de atendimentos por lead

## 📞 Suporte:

Se encontrar algum problema:
1. Verifique os logs do backend
2. Confirme que o webhook está configurado corretamente no Meta
3. Teste o endpoint do webhook manualmente
4. Verifique se as credenciais do WhatsApp estão corretas em `/settings`

---

**Sistema 100% funcional e pronto para uso! 🎉**
