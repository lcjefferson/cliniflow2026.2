# 📱 Instruções para Configurar o Webhook do WhatsApp

## ✅ Status do Sistema
- **Backend**: ✅ Funcionando corretamente
- **Endpoint do Webhook**: ✅ Configurado e testado
- **Validação de Token**: ✅ Implementada com sucesso
- **URL Pública**: ✅ Acessível via HTTPS
- **Teste Externo**: ✅ Validado com sucesso

## 🔑 Suas Credenciais Corretas

**USE ESTAS CREDENCIAIS NO META FOR DEVELOPERS:**

- **Webhook URL**: `https://clinic-portal-9.preview.emergentagent.com/api/webhooks/whatsapp`
- **Verify Token**: `ichrg8pgmhp`
- **Phone Number ID**: `857247354135552`
- **Business Account ID**: `2272353643208771`
- **Access Token**: `EAAMFNEiQ4kQBP...` (oculto por segurança)

⚠️ **IMPORTANTE**: Copie estas credenciais EXATAMENTE da página de Configurações no CliniFlow!

## 📋 Passo a Passo para Configurar no Meta for Developers

### 1. Acesse o Meta for Developers
- Vá para: https://developers.facebook.com
- Faça login com sua conta

### 2. Selecione ou Crie um App
- Se já tem um app, selecione-o
- Se não tem, clique em "Criar App" → Tipo "Business"

### 3. Adicione o Produto WhatsApp
- No menu lateral, procure por "WhatsApp"
- Clique em "Adicionar" ou "Configurar"

### 4. Configure o Webhook

#### 4.1. Vá para a seção "Configuração" do WhatsApp
- No menu lateral do WhatsApp, clique em "Configuração"
- Role até a seção "Webhook"

#### 4.2. Clique em "Editar" ou "Configurar Webhook"

#### 4.3. Preencha os Campos:

**Callback URL (URL de retorno de chamada):**
```
https://clinic-portal-9.preview.emergentagent.com/api/webhooks/whatsapp
```

**COPIE EXATAMENTE ESTA URL** ⬆️ (use o botão de copiar na página de Configurações)

**Verify Token (Token de verificação):**
```
ichrg8pgmhp
```

**COPIE EXATAMENTE ESTE TOKEN** ⬆️ (case-sensitive!)

⚠️ **ATENÇÃO**: Este token DEVE ser exatamente `ichrg8pgmhp` (o que está salvo no seu banco de dados).

#### 4.4. Clique em "Verificar e Salvar"

O Meta vai fazer uma requisição GET para o seu servidor com:
- `hub.mode=subscribe`
- `hub.verify_token=ichrg8pgmhp`
- `hub.challenge=[um número aleatório]`

Se tudo estiver correto, seu servidor vai retornar o `challenge` e a verificação será aprovada! ✅

### 5. Inscreva-se nos Eventos (Webhook Fields)

Após a verificação bem-sucedida, você precisa se inscrever nos eventos:

- ✅ Marque: **messages** (para receber mensagens)
- ✅ Marque: **message_status** (para receber status de entrega)

Clique em "Salvar" para confirmar.

### 6. Teste o Webhook

Após configurar, você pode testar enviando uma mensagem para o número do WhatsApp Business.

## 🔍 Verificação de Problemas

### Se o Meta retornar erro de validação:

1. **Verifique a URL do Webhook**
   - Deve terminar com `/api/webhooks/whatsapp`
   - Deve usar HTTPS (não HTTP) em produção
   - Não deve ter espaços ou caracteres especiais

2. **Verifique o Verify Token**
   - Deve ser exatamente: `ichrg8pgmhp`
   - Sem espaços antes ou depois
   - Case-sensitive (maiúsculas e minúsculas importam)

3. **Verifique se o servidor está acessível**
   - O Meta precisa conseguir acessar sua URL publicamente
   - Teste no navegador: `[SUA_URL]/api/webhooks/whatsapp` (deve retornar erro 400, mas não erro de conexão)

## 📊 Como Ver os Logs

Se precisar debugar, você pode ver os logs detalhados do webhook:

```bash
tail -f /var/log/supervisor/backend.out.log | grep "WhatsApp"
```

Você verá algo como:
```
========== WhatsApp Webhook Verification ==========
[RECEIVED] Mode: subscribe
[RECEIVED] Verify Token: ichrg8pgmhp
[RECEIVED] Challenge: 1234567890
[SUCCESS] ✅ Verification successful!
===================================================
```

## 🎯 Próximos Passos

Após configurar o webhook com sucesso:

1. ✅ O CliniFlow começará a receber mensagens do WhatsApp
2. ✅ As mensagens aparecerão na página de Omnichannel
3. ✅ Os consultores poderão responder aos leads diretamente pelo sistema

## 💡 Dicas Importantes

- **HTTPS é obrigatório em produção**: O Meta só aceita webhooks HTTPS
- **Mantenha o verify_token seguro**: Não compartilhe publicamente
- **Teste localmente com ngrok**: Se precisar testar em ambiente local, use ngrok ou similar
- **Logs são seus amigos**: Sempre consulte os logs se algo não funcionar

## 🆘 Precisa de Ajuda?

Se encontrar algum problema:
1. Verifique os logs do backend
2. Teste o endpoint manualmente com curl
3. Confirme que o verify_token está correto no banco de dados
4. Certifique-se de que sua URL está acessível publicamente

---

**Sistema testado e funcionando! 🎉**
