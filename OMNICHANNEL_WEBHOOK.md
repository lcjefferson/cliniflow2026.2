# Omnichannel – Mensagens enviadas pelo celular (secretarias)

Para as **mensagens que as secretarias enviam pelo WhatsApp (celular)** aparecerem na conversa do Omnichannel, o sistema precisa receber um **webhook** do UAZ-API/FortaLabs sempre que uma mensagem é **enviada** pelo número conectado.

## O que o sistema já faz

- Quando o webhook recebe um evento de mensagem **enviada** (remetente = número da clínica), o backend:
  - Usa o **contato do chat** (não o remetente) para identificar o lead.
  - Salva a mensagem como `sender_type: "consultant"` na conversa correta.
  - Registra em log: `[WEBHOOK] Processing possible OUTGOING/sent message` e `[WEBHOOK] Saved OUTGOING message to conversation...`.

## Se as mensagens do celular não aparecem

Na maioria dos casos o provedor **não está enviando** webhooks para mensagens enviadas pelo celular.

### 1. Confirmar se o webhook de “enviadas” está ativo

- Acesse o **painel do FortaLabs/UAZ-API** (ou onde o número WhatsApp está configurado).
- Procure configuração de **webhook** ou **eventos**.
- Verifique se existe opção para ativar eventos de **mensagens enviadas**, **outgoing** ou **message_sent**.
- Se existir, ative e salve a URL do webhook que já está configurada no sistema (a mesma que recebe mensagens recebidas).

### 2. Ver os logs do backend

Ao **enviar uma mensagem pelo celular** (número da clínica) para um lead, verifique os logs do backend:

- Se aparecer **`[WEBHOOK] Processing possible OUTGOING/sent message`** e **`[WEBHOOK] Saved OUTGOING message to conversation...`**  
  → O webhook está sendo recebido e as mensagens estão sendo salvas; se ainda não aparecerem na tela, pode ser cache/atualização da lista.
- Se **não** aparecer nenhuma dessas linhas  
  → O provedor não está enviando o evento de “mensagem enviada” para a sua URL. É necessário ativar esse tipo de evento no painel do UAZ-API/FortaLabs ou pedir suporte para habilitar webhook de mensagens enviadas.

### 3. Falar com o suporte do provedor

Se no painel não houver opção para “mensagens enviadas” / “outgoing”:

- Entre em contato com o **suporte da FortaLabs/UAZ-API**.
- Pergunte se há como configurar o webhook para receber também **eventos de mensagens enviadas** pelo número conectado (não só as recebidas).
- Envie a URL do seu webhook (a mesma usada para mensagens recebidas) para eles confirmarem que podem disparar esse evento para ela.

## Resumo

| Situação | Ação |
|----------|------|
| Mensagens **recebidas** (lead) aparecem | Webhook de mensagens recebidas está OK. |
| Mensagens **enviadas pelo celular** (secretaria) não aparecem | Provável que o provedor não envie webhook de “mensagem enviada”. Ativar no painel ou via suporte. |
| Aparece `[WEBHOOK] Saved OUTGOING message` nos logs | Backend está salvando; conferir se a conversa na tela é a mesma (mesmo lead/telefone). |

Com o webhook de mensagens enviadas ativo no provedor, as respostas das secretarias pelo celular passam a ser gravadas e exibidas na conversa do lead no Omnichannel.
