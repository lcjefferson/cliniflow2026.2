# Módulo de Follow-ups

## Novidades
- Regra de disparo para aniversários de pacientes (`patient_birthday`).
- Campo "Aguardar" com opções de envio antecipado: "1 dia antes" e "2 dias antes".

## Como usar
- Em "Gerenciar Regras", selecione "Pacientes Aniversariantes" em "Disparar".
- Defina "Aguardar":
  - `No dia` (0)
  - `1 dia depois` (1)
  - `2 dias depois` (2)
  - `1 dia antes` (-1)
  - `2 dias antes` (-2)
- O endpoint `POST /api/followups/dispatch-birthday` cria follow-ups e envia felicitações via WhatsApp quando configurado.

## Requisitos
- Compatível com regras existentes.
- Testes em `tests/test_followup_birthday.py` validam cálculo de datas.
