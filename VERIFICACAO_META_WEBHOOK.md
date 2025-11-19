# 🔍 Verificação Completa do Webhook no Meta for Developers

## ✅ Status do Sistema CliniFlow:
- Backend: **FUNCIONANDO** ✅
- Webhook: **FUNCIONANDO** ✅  
- Túnel: **FUNCIONANDO** ✅
- Processamento: **FUNCIONANDO** ✅

**Teste realizado com sucesso via curl - mensagem recebida e salva!**

## ❌ Problema Identificado:
O **Meta for Developers não está enviando webhooks POST** quando você envia mensagens pelo WhatsApp.

## 🎯 Causas Possíveis e Soluções:

### 1. Webhook NÃO está inscrito nos eventos
**Verifique no Meta for Developers:**
- Vá para: Seu App → WhatsApp → Configuração
- Role até a seção "Webhooks"
- **IMPORTANTE**: Após clicar em "Verificar e Salvar", você DEVE clicar em "Gerenciar" (ou "Manage")
- Na lista de eventos (Webhook fields), marque:
  - ☑️ **messages**
  - ☑️ **message_status**
- Clique em "Salvar" novamente

**Muitos usuários esquecem este passo!**

### 2. Número de telefone não está configurado corretamente
**Verifique:**
- O número do WhatsApp Business está ativo?
- Você está enviando mensagem PARA o número correto?
- O número está no painel do Meta for Developers?

**Para encontrar o número:**
- Vá para: WhatsApp → API Setup
- Veja o número em "From" (número de teste do Meta)
- **OU** use seu número de produção

### 3. Usando número de teste do Meta
Se você está usando o **número de teste gratuito do Meta**:
- Você só pode enviar mensagens para números aprovados
- Vá para: WhatsApp → API Setup → "To"
- Adicione seu número pessoal clicando em "Manage phone number list"
- Envie o código de verificação que o Meta enviar
- Aguarde aprovação

### 4. App está em modo de desenvolvimento
**Verifique se o app está em modo "Live" (Ao vivo):**
- Vá para: Settings → Basic
- Verifique se o app está em modo "Live"
- Se estiver em "Development", você precisa publicá-lo

### 5. Permissões não foram concedidas
**Verifique as permissões:**
- Vá para: App Review → Permissions and Features
- Certifique-se de que tem:
  - `whatsapp_business_management`
  - `whatsapp_business_messaging`

## 🧪 Como Testar se o Meta está Enviando:

### Teste 1: Enviar mensagem e verificar no Meta
1. Vá para: WhatsApp → API Setup
2. Envie uma mensagem de teste usando a interface do Meta
3. Verifique se aparece em "Recent outbound messages"

### Teste 2: Verificar no Webhook Monitor do Meta
1. Vá para: WhatsApp → Configuração → Webhooks
2. Clique em "Test" ao lado de "messages"
3. Veja se o Meta envia um webhook de teste
4. Verifique se aparece como sucesso (200 OK)

### Teste 3: Verificar logs do Meta
1. Na mesma página de Webhooks
2. Role até o final
3. Veja "Recent Deliveries" ou "Webhook Logs"
4. Verifique se há erros

## 📋 Checklist Completo:

**No Meta for Developers:**
- [ ] Webhook URL está correta: `https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp`
- [ ] Verify Token está correto: `ichrg8pgmhp`
- [ ] Webhook foi validado (botão verde "Verificar e Salvar")
- [ ] Eventos estão inscritos: `messages` e `message_status` marcados
- [ ] Número de telefone está ativo
- [ ] Seu número pessoal está na lista de permitidos (se usando teste)
- [ ] App está em modo "Live" (ou Development com permissões)

**No CliniFlow:**
- [x] Backend funcionando
- [x] Webhook processando
- [x] Túnel ativo
- [x] Monitor do túnel rodando

## 🎯 Teste Final Definitivo:

**Passo 1:** Vá para Meta for Developers → WhatsApp → Configuração → Webhooks

**Passo 2:** Clique no botão "Test" ao lado do evento "messages"

**Passo 3:** O Meta enviará um webhook de teste

**Passo 4:** Vá para `/webhook-monitor` no CliniFlow

**Passo 5:** Se aparecer uma nova conversa/mensagem, está funcionando! ✅

## 💡 Dicas Importantes:

1. **Número de teste vs. Produção:**
   - Número de teste do Meta: Só recebe de números aprovados
   - Número de produção: Precisa de verificação Business do Meta

2. **Limite de mensagens:**
   - Contas novas têm limite de 250 mensagens/dia
   - Após aprovação: até 1000/dia
   - Depois aumenta gradualmente

3. **Janela de 24 horas:**
   - Você só pode iniciar conversa com templates aprovados
   - Após o lead enviar mensagem, você tem 24h para responder livremente

## 🆘 Se nada funcionar:

Execute este comando e me envie o resultado:
```bash
# Simular webhook do Meta
curl -X POST "https://cliniflow-webhook.loca.lt/api/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "field": "messages",
        "value": {
          "messages": [{
            "from": "SEU_NUMERO_AQUI",
            "id": "test",
            "text": {"body": "Teste manual"},
            "timestamp": "1700000000"
          }]
        }
      }]
    }]
  }'
```

Se este comando funcionar mas mensagens reais não, o problema está 100% na configuração do Meta.

## 📞 Números para Teste:

**Encontre seu número de teste:**
1. Meta for Developers → WhatsApp → API Setup
2. Veja em "From" o número do WhatsApp Business
3. Este é o número que deve receber as mensagens

**Adicione seu número pessoal:**
1. Na mesma tela, vá em "To"
2. Clique em "Manage phone number list"
3. Adicione seu WhatsApp pessoal
4. Verifique com o código que receberá
