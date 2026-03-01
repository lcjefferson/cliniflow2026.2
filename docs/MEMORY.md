# Uso de memória – Frontend e Backend

Resumo da análise e otimizações aplicadas.

## Backend

### Pontos que mais consomem memória

| Onde | O que | Observação |
|------|--------|------------|
| `run_birthday_followup_automation` | Carregava até 10.000 pacientes de uma vez | **Ajustado:** processamento em lotes de 500 com cursor |
| `GET /appointments` (sem `limit`) | Até 1.000 agendamentos + lista de serviços (5.000) | **Ajustado:** padrão reduzido de 1.000 para 500 agendamentos |
| `GET /transactions` | Até 1.000 transações + lookup de nomes de pacientes | Limite máximo 1.000; uso normal com limit 200–500 |
| Automação de aniversário (thumbnail) | Itera todos os pacientes com `attachments` | Usa cursor (um por vez); anexos com `file_data` (base64) aumentam memória por documento |
| Campanhas / follow-ups | Até 5.000 pacientes ou leads em listas | Só em fluxos específicos (ex.: disparo em massa) |
| Mensagens / conversas | Até 500 conversas, 2.000 mensagens | Endpoints de omnichannel |

### Otimizações já feitas

1. **Aniversário (birthday follow-up):** em vez de `to_list(10000)`, uso de cursor e processamento em lotes de 500, com projeção só dos campos necessários (`id`, `name`, `phone`, `birthdate`).
2. **GET /appointments:** valor padrão de `limit` reduzido de 1.000 para 500 quando o cliente não envia `limit`.

### Recomendações futuras (opcional)

- Paginar ou limitar melhor em relatórios que carregam muitos appointments/patients/transactions de uma vez.
- Em listas grandes no frontend, considerar virtualização (ex.: react-window) para não renderizar centenas de itens no DOM.
- Thumbnail job: se muitos anexos usam apenas `file_data` (sem GridFS), considerar migrar para GridFS para evitar carregar base64 na memória.

---

## Frontend

### Pontos que mais consomem memória

| Página / fluxo | O que carrega | Observação |
|----------------|----------------|------------|
| **RevenuePage** | 500 transações + 500 agendamentos + 300 pacientes + stats | Carregamento inicial pesado |
| **CalendarPage** | 500 agendamentos + todos os pacientes (paginados) + profissionais, serviços, salas | Valores já limitados |
| **ReportsPage** | appointments + patients + transactions + professionals sem `limit` | Backend devolve até 500 appointments (após ajuste), patients paginados (ex.: 100) |
| **LeadsPage** (exportar) | Até 5.000 leads só na exportação para Excel | Uso pontual |
| **PatientDetailDialog** | Até 100 transações + 200 agendamentos + 100 prontuários por paciente | Ao abrir um paciente |
| **OmnichannelPageV2** | 300 leads + conversas + mensagens | Valores limitados |

### Boas práticas já em uso

- Uso de limites (limit, page_size) na maioria das chamadas.
- Paginação em pacientes e leads na API.

### Recomendações futuras (opcional)

- **Relatórios:** pedir apenas os campos necessários e/ou intervalos de data para reduzir payload.
- **Listas longas:** virtualizar listas (transações, leads, etc.) para não renderizar milhares de linhas no DOM.
- **RevenuePage:** manter limit 500 em transações/agendamentos; 300 pacientes já é um teto razoável para a primeira carga.

---

## Conclusão

- **Backend:** os pontos mais sensíveis (aniversário em massa e lista grande de appointments sem limite) foram suavizados. O resto usa limites ou paginação; em bases muito grandes, o próximo passo é paginar mais onde ainda não há.
- **Frontend:** o uso de memória é moderado; os maiores consumos vêm de carregar muitas transações/agendamentos/pacientes de uma vez e de listas longas no DOM. Com os ajustes no backend e limites já existentes, o consumo não deve ser excessivo em cenários típicos; em bases grandes, vale aplicar as recomendações opcionais acima.
