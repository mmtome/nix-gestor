# Módulo SAC: Kanban de dúvidas via WhatsApp

> **Como usar este arquivo**
> 1. Crie a pasta `docs/sac/` no projeto do gestor e coloque nela:
>    `SAC_WHATSAPP_SPEC.md`, `sac-core.ts` e `sac-core.test.ts`.
> 2. No VS Code, abra o Claude e mande:
>    **"Leia docs/sac/SAC_WHATSAPP_SPEC.md e execute só a Fase 0."**
> 3. A cada fase concluída, revise, teste e mande seguir para a próxima.

---

## Instruções para o agente (Claude Code)

- Este módulo entra num **gestor (CRM de marketing) que já existe**. Antes de
  escrever código, entenda o stack (framework, banco/ORM, autenticação, storage,
  biblioteca de UI, como rotas e itens de menu são criados) e **siga os padrões
  do projeto**. Os exemplos aqui estão em TypeScript/SQL Postgres como
  referência; adapte para o que o projeto usa.
- `sac-core.ts` tem a lógica pura (normalizar o webhook, ler legenda, regras
  de status), sem dependência de banco ou HTTP, e está coberta por
  `sac-core.test.ts` (18 testes passando). Reaproveite esse arquivo; se o
  projeto não for TS, porte a lógica e os testes.
- Trabalhe **por fases**. No fim de cada fase, pare, resuma o que mudou, diga
  como testar e espere confirmação.
- Não use n8n nem outras ferramentas de automação externas: tudo é código dentro do gestor.
- Interface toda em **português do Brasil**.

---

## 1. Objetivo

O Matheus trabalha com eventos e recebe dúvidas de clientes no Instagram,
WhatsApp, site e outros canais. Ele tira print e manda num **grupo de WhatsApp
com os donos da empresa**, que ajudam a responder.

O módulo **SAC** (uma aba nova no gestor) deve:

1. Detectar automaticamente cada print enviado nesse grupo.
2. Criar um card num Kanban com a imagem, o canal de origem, a categoria e o
   evento, lidos de um padrão de legenda.
3. Mudar o card de coluna conforme a reação ou resposta no próprio grupo
   (ex.: reagir ✅ = resolvido).
4. Guardar no card a resposta que os donos deram no grupo, pra virar
   histórico e base de respostas prontas.

---

## 2. Arquitetura

```
Grupo WhatsApp ──► Evolution API (self-hosted, v2.3.7)
                         │  POST webhook (MESSAGES_UPSERT, imagem em base64)
                         ▼
        Gestor: POST /api/sac/webhook?token=...
                         │
            normalizeEvolutionEvent()  ← sac-core.ts
                         │
     ┌───────────────┬───┴───────────┬──────────────┐
   image          reaction         reply          revoke
 cria card     muda status    comentário ou     arquiva
 + upload      (✅ ❌)         comando curto
                         │
                  Banco (sac_*) + Storage privado
                         │
              Aba "SAC" no gestor (Kanban)
```

**Evolution API**: API não oficial e open source que conecta um número de
WhatsApp via QR code (como o WhatsApp Web) e envia cada mensagem para um
webhook. A API oficial da Meta não serve: o recurso de grupos exige Conta
Comercial Oficial e limita o grupo a 8 pessoas.

**Versão travada em `v2.3.7`**: a partir da v2.4.0 cada instância precisa ser
ativada num servidor de licenças da Evolution Foundation. A 2.3.7 é a última
estável sem isso. Use a imagem `evoapicloud/evolution-api:v2.3.7` e nunca `latest`.

---

## 3. Regras de negócio

### 3.1 Quais mensagens viram card

Um card é criado quando **todas** as condições abaixo valem:

- `data.key.remoteJid === SAC_GROUP_JID` (o grupo certo; IDs de grupo terminam em `@g.us`).
- A mensagem é uma **imagem** (`imageMessage`, ou `documentMessage` com mimetype `image/*`).
- O remetente é permitido, conforme `SAC_SENDER_MODE`:
  - `fromMe`: só mensagens enviadas pelo próprio número conectado (padrão, quando o número conectado é o do Matheus).
  - `allowlist`: só remetentes em `SAC_ALLOWED_SENDERS` (usar se for um chip separado só pra isso).
  - `any`: qualquer participante do grupo.
- Ainda não existe card nem anexo com esse `wa_message_id` (idempotência: o webhook pode chegar repetido).

> **Atenção, remetente `@lid`**: em grupos, o WhatsApp pode identificar o
> participante por um LID (`123456@lid`) em vez do telefone. O
> `resolveSender()` prefere o telefone quando ele vier (`participantAlt` /
> `participantPn`) e, se não vier, usa o `@lid`. A allowlist deve aceitar os
> dois formatos, e a tela de configurações deve listar os "remetentes vistos"
> para facilitar o cadastro.

### 3.2 Padrão de legenda

O Matheus manda o print com uma legenda, por exemplo:

```
#ig #ingresso #lapa Cliente perguntando se ainda tem 2º lote
#insta #meia #urgente estudante sem carteirinha
#zap dúvida sobre estacionamento #local
```

Regras (implementadas em `parseCaption`):

- Toda `#palavra` é procurada na tabela `sac_tags` (pelo slug ou pelos
  aliases), sem diferenciar maiúscula de minúscula e ignorando acentos.
- Cada tag tem um **tipo**: `canal`, `categoria`, `evento` ou `prioridade`.
  A ordem na legenda não importa; vale a **primeira** de cada tipo.
- Tags não cadastradas ficam em `tags_desconhecidas` e aparecem no card
  como chips cinzas com o botão "+ cadastrar".
- O texto que sobra, sem as tags, vira o **título** (máx. 120 caracteres).
- Sem legenda, o card nasce como "Sem classificação" e pode ser editado no gestor.

Tags iniciais (seed). O Matheus edita depois pela tela de configurações:

| tipo | slug | label | aliases |
|---|---|---|---|
| canal | ig | Instagram | insta, instagram |
| canal | wpp | WhatsApp | zap, whatsapp |
| canal | site | Site | lp |
| canal | email | E-mail | mail |
| canal | tiktok | TikTok | tt |
| canal | outro | Outro canal | |
| categoria | ingresso | Ingresso / lotes | ingressos, lote |
| categoria | meia | Meia-entrada | meiaentrada |
| categoria | local | Local / acesso | endereco, estacionamento |
| categoria | horario | Horário | hora |
| categoria | pagamento | Pagamento | pix, cartao |
| categoria | reembolso | Reembolso / troca | troca, cancelamento |
| categoria | outros | Outros | |
| prioridade | urgente | Urgente | urg |

Cada evento é cadastrado como tag do tipo `evento` (ex.: `#lapa`).

### 3.3 Vários prints de uma vez (álbum)

Num álbum, cada imagem chega como uma mensagem separada e só uma traz legenda.
Regra:

- Imagem **sem legenda**, do mesmo remetente, até `SAC_ALBUM_WINDOW_SECONDS`
  (padrão 60s) depois do último card dele: vira **anexo** desse card.
- Se a imagem com legenda chegar depois das sem legenda (dentro da janela),
  ela atualiza a classificação do card e entra como anexo.

### 3.4 Colunas e status

| status | coluna no quadro | significado |
|---|---|---|
| `novo` | Aguardando resposta | print chegou, ninguém respondeu |
| `respondido_grupo` | Respondido no grupo | os donos responderam; falta repassar ao cliente |
| `resolvido` | Resolvido | o cliente já recebeu a resposta |
| `arquivado` | (oculto) | descartado ou print apagado |

### 3.5 O que muda o status

**Reações no print** (`statusFromReaction`, configurável):

| emoji | vai para |
|---|---|
| ✅ ✔️ ☑️ | `resolvido` |
| ❌ | `arquivado` |

- Qualquer participante do grupo pode reagir.
- **Reação removida** (emoji vazio): se a última mudança de status do card
  veio de uma reação **da mesma pessoa**, o card volta ao status anterior
  (consultar `sac_events`).
- Outros emojis são ignorados (👍 e ❤️ costumam significar só "vi").

**Respostas citando o print** (reply):

- **Comando curto** (até 3 palavras, começando com `ok`, `respondido`,
  `resolvido`, `feito` ou `pronto`): vai para `resolvido`.
- **Qualquer outra resposta**: vira **comentário** no card (é a resposta dos
  donos). Se o card estava `novo` e quem respondeu não é quem mandou o print,
  vai para `respondido_grupo` e registra `first_response_at`.
- A busca do card aceita o ID do print, de um anexo **ou de um comentário**.
  Assim, um "ok" citando a resposta do dono também resolve o card certo.

**Mensagem apagada** (`revoke`): se for o print principal, o card vai para
`arquivado` (os dados ficam guardados).

**No gestor**: arrastar o card entre colunas muda o status (registrar
`via = 'gestor'`).

---

## 4. Variáveis de ambiente

```env
EVOLUTION_API_URL=https://evolution.seudominio.com
EVOLUTION_API_KEY=xxxxxxxx              # chave global ou token da instância
EVOLUTION_INSTANCE=sac
SAC_WEBHOOK_TOKEN=<string aleatória longa>
SAC_GROUP_JID=120363xxxxxxxxxxxx@g.us   # descoberto na Fase 2
SAC_SENDER_MODE=fromMe                  # fromMe | allowlist | any
SAC_ALLOWED_SENDERS=                    # separados por vírgula (@s.whatsapp.net ou @lid)
SAC_ALBUM_WINDOW_SECONDS=60
SAC_LOG_PAYLOADS=true                   # deixar true até estabilizar
```

Se o gestor já tiver uma tabela de configurações, `SAC_GROUP_JID`,
`SAC_SENDER_MODE` e `SAC_ALLOWED_SENDERS` podem ir para lá e ser editados na tela.

---

## 5. Modelo de dados (referência Postgres; adaptar ao ORM do projeto)

```sql
create table sac_tags (
  slug        text primary key,
  type        text not null check (type in ('canal','categoria','evento','prioridade')),
  label       text not null,
  aliases     text[] not null default '{}',
  color       text,
  active      boolean not null default true,
  sort        int not null default 0
);

create table sac_cards (
  id                  uuid primary key default gen_random_uuid(),
  wa_message_id       text not null unique,          -- id do print principal
  group_jid           text not null,
  status              text not null default 'novo'
                      check (status in ('novo','respondido_grupo','resolvido','arquivado')),
  canal               text references sac_tags(slug),
  categoria           text references sac_tags(slug),
  evento              text references sac_tags(slug),
  prioridade          text references sac_tags(slug),
  titulo              text not null default '',
  legenda_original    text not null default '',
  tags_desconhecidas  text[] not null default '{}',
  sender_id           text,
  sender_name         text,
  position            int not null default 0,        -- ordem dentro da coluna
  received_at         timestamptz not null,
  first_response_at   timestamptz,
  resolved_at         timestamptz,
  resolved_by         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on sac_cards (status, received_at desc);
create index on sac_cards (sender_id, created_at desc);

create table sac_attachments (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references sac_cards(id) on delete cascade,
  wa_message_id  text not null unique,
  storage_path   text not null,
  mimetype       text not null,
  created_at     timestamptz not null default now()
);

create table sac_comments (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references sac_cards(id) on delete cascade,
  wa_message_id  text unique,                        -- null quando escrito no gestor
  author_id      text,
  author_name    text,
  text           text not null,
  source         text not null check (source in ('whatsapp','gestor')),
  created_at     timestamptz not null default now()
);

create table sac_events (                            -- histórico / auditoria
  id             bigserial primary key,
  card_id        uuid not null references sac_cards(id) on delete cascade,
  type           text not null,                      -- criado | status | comentario | anexo | reclassificado
  from_status    text,
  to_status      text,
  via            text,                               -- reacao | resposta | gestor | sistema
  actor_id       text,
  actor_name     text,
  emoji          text,
  wa_message_id  text,
  created_at     timestamptz not null default now()
);

create table sac_webhook_logs (                      -- debug; limpar depois de 30 dias
  id           bigserial primary key,
  received_at  timestamptz not null default now(),
  event        text,
  payload      jsonb not null,
  result       text                                  -- ex: "card criado", "ignorado: não é grupo"
);
```

O print principal também entra em `sac_attachments` (com o mesmo
`wa_message_id` do card), assim a galeria do card lista todas as imagens.

---

## 6. Webhook: `POST /api/sac/webhook?token=...`

```ts
// Pseudocódigo: adaptar ao framework do projeto
export async function sacWebhook(req, res) {
  if (req.query.token !== env.SAC_WEBHOOK_TOKEN) return res.status(401).end();

  res.status(200).json({ ok: true }); // responder logo; nunca deixar a Evolution esperando
  // Se o framework não deixar processar depois da resposta, processar antes e
  // responder 200 mesmo em erro de regra de negócio (logar o erro).

  const body = req.body;
  const ev = normalizeEvolutionEvent(body);
  const log = env.SAC_LOG_PAYLOADS ? await saveWebhookLog(body) : null;

  try {
    if (ev.kind === 'ignore') return log?.result(`ignorado: ${ev.reason}`);
    if (ev.groupJid !== env.SAC_GROUP_JID) return log?.result('ignorado: outro grupo');

    switch (ev.kind) {
      case 'image':    return log?.result(await handleImage(ev));
      case 'reaction': return log?.result(await handleReaction(ev));
      case 'reply':    return log?.result(await handleReply(ev));
      case 'revoke':   return log?.result(await handleRevoke(ev));
    }
  } catch (err) {
    log?.result(`erro: ${err.message}`);
  }
}
```

### 6.1 `handleImage`

1. Validar o remetente com `SAC_SENDER_MODE`.
2. Se já existe anexo com `ev.waMessageId`, parar (idempotência).
3. Pegar a imagem: `ev.base64`; se vier `null`, chamar a Evolution:
   ```http
   POST {EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/{EVOLUTION_INSTANCE}
   apikey: {EVOLUTION_API_KEY}
   Content-Type: application/json

   { "message": { "key": { "id": "<waMessageId>" } }, "convertToMp4": false }
   ```
   Baixar **na hora**: a URL de mídia do WhatsApp é criptografada e expira,
   então nunca guarde essa URL.
4. Subir no storage do projeto num caminho **privado**:
   `sac/{yyyy}/{mm}/{waMessageId}.jpg`.
5. Aplicar a regra de álbum (3.3). Se não for álbum, criar o card com
   `parseCaption(ev.caption, tagsAtivas)`, `status = 'novo'`,
   `received_at = ev.timestamp` e `position` no topo da coluna.
6. Registrar `sac_events` (`criado` ou `anexo`).

### 6.2 `handleReaction`

1. `card = findCardByAnyMessageId(ev.targetMessageId)`. Se não achar, ignorar.
2. Emoji vazio: aplicar a regra de reverter (3.5).
3. `novo = statusFromReaction(ev.emoji)`. Se `null`, ignorar.
4. Atualizar o status (`resolved_at` / `resolved_by` quando for `resolvido`)
   e registrar o evento com `via = 'reacao'` e o `emoji`.

### 6.3 `handleReply`

1. `card = findCardByAnyMessageId(ev.quotedMessageId)` (procura em cards, anexos e comentários).
2. `cmd = statusFromReplyText(ev.text)`. Se houver comando, mudar o status (`via = 'resposta'`).
3. Se não, criar o comentário (`source = 'whatsapp'`) e, se o card estava
   `novo` e `ev.senderId !== card.sender_id`, mudar para `respondido_grupo`
   e preencher `first_response_at`.

### 6.4 `handleRevoke`

Se `targetMessageId` for o print principal, o card vai para `arquivado`. Se for
um anexo, remover o anexo.

### 6.5 Formato do payload (aproximado; confirmar com log real na Fase 2)

```jsonc
{
  "event": "messages.upsert",
  "instance": "sac",
  "data": {
    "key": {
      "remoteJid": "120363xxxxxxxxxxxx@g.us",
      "fromMe": true,
      "id": "3EB0C767D26A1B2E5F",
      "participant": "5534999990000@s.whatsapp.net"   // pode vir @lid
    },
    "pushName": "Matheus",
    "message": {
      "imageMessage": { "mimetype": "image/jpeg", "caption": "#ig #ingresso ..." },
      "base64": "/9j/4AAQ..."                         // com Webhook Base64 ligado
    },
    "contextInfo": { "stanzaId": "..." },             // em respostas
    "messageType": "imageMessage",
    "messageTimestamp": 1763592000
  }
}
```

Reação: `data.message.reactionMessage = { key: { id: "<id do print>" }, text: "✅" }`.
O `normalizeEvolutionEvent` já trata as variações conhecidas: envelopes
(`ephemeralMessage`, `viewOnceMessage`...), `contextInfo` em lugares
diferentes, `data` em array, nome do evento em maiúsculas, timestamp em ms ou s.
**Se o log real mostrar outro formato, ajuste o normalizador e adicione um teste com o payload real.**

---

## 7. Interface: aba "SAC"

**Menu**: item "SAC" com um badge mostrando quantos cards estão em "Aguardando resposta".

**Barra superior**: busca (título, legenda e comentários); filtros por canal,
categoria, evento, prioridade e período; contador por coluna; opção
"mostrar arquivados".

**Quadro** com 3 colunas: Aguardando resposta · Respondido no grupo ·
Resolvido (por padrão, só os últimos 7 dias).

**Card**:
- miniatura do print (clicar abre em tela cheia; mostrar "+2" se houver mais imagens);
- badges coloridos de canal, categoria e evento; badge vermelho se urgente;
- título (ou "Sem título");
- chips cinzas das tags desconhecidas, com "+ cadastrar";
- "há 2h" com cor de SLA: até 2h normal, 2 a 6h amarelo, mais de 6h vermelho (configurável);
- ícones com a contagem de comentários e anexos.

Os cards podem ser arrastados entre colunas e reordenados (usar a biblioteca
de drag and drop que o projeto já tiver; se não tiver, `@dnd-kit` em React).

**Detalhe do card** (drawer lateral):
- galeria das imagens com zoom;
- campos editáveis de canal, categoria, evento, prioridade e título (registrar `reclassificado`);
- linha do tempo com comentários do WhatsApp e notas internas, onde é possível escrever uma nota (`source = 'gestor'`);
- botão **"Copiar resposta"**, que copia o último comentário dos donos para colar direto pro cliente;
- histórico de status (quem, quando, por qual via).

**Configurações do SAC**: cadastro de tags (CRUD), mapa de emojis, grupo
monitorado, modo de remetente e allowlist, e lista de "remetentes vistos".

**Atualização**: começar com polling a cada 15s. Se o projeto já usar
realtime (websocket, SSE, Supabase Realtime), usar ele.

**Segurança**: as imagens têm dados de clientes. Usar bucket privado com URL
assinada de curta duração e acesso só para usuários logados no gestor.

---

## 8. Fases de implementação

### Fase 0: Reconhecimento (sem escrever código)
Explorar o repositório e responder:
- stack, banco/ORM, como as migrations são feitas;
- autenticação e permissões;
- storage de arquivos usado (ou qual sugerir);
- biblioteca de UI, componentes existentes, drag and drop, como criar item de menu e página;
- onde ficam as rotas de API.

Depois, propor a **lista de arquivos** que serão criados ou alterados.
**Parar e esperar confirmação.**

### Fase 1: Banco
Migrations das tabelas da seção 5, seed das tags (3.2) e repositórios/models.
**Parar.**

### Fase 2: Webhook e log
- Copiar `sac-core.ts`, rodar os testes de `sac-core.test.ts` no runner do projeto.
- Criar o endpoint da seção 6 **só gravando o log** (`sac_webhook_logs`), sem criar cards ainda.
- Testar com `curl` usando os payloads dos testes.
- **Parar.** O Matheus conecta a Evolution (seção 9), manda um print e uma
  reação no grupo, e o agente lê os logs reais para confirmar
  `SAC_GROUP_JID`, o formato do remetente e o formato dos campos. Ajustar o
  normalizador e os testes se precisar.

### Fase 3: Criação de cards
`handleImage` completo: download/base64, storage, parser, regra de álbum e idempotência. **Parar.**

### Fase 4: Status pelo WhatsApp
`handleReaction`, `handleReply`, `handleRevoke`, reverter reação e `findCardByAnyMessageId`. **Parar.**

### Fase 5: Interface
Aba SAC, quadro, card, drawer, filtros, configurações e polling. **Parar.**

### Fase 6: Extras (opcional)
- **Sincronizar de volta**: ao mover para "Resolvido" no gestor, reagir ✅ no
  print pelo WhatsApp:
  ```http
  POST {EVOLUTION_API_URL}/message/sendReaction/{EVOLUTION_INSTANCE}
  apikey: {EVOLUTION_API_KEY}
  { "key": { "remoteJid": "<group_jid>", "fromMe": true, "id": "<wa_message_id>" }, "reaction": "✅" }
  ```
  Conferir o formato do body na doc da v2.3.7. A reação volta pelo webhook,
  e a idempotência evita duplicar.
- **Legenda editada** no WhatsApp: reclassificar o card (descobrir o formato
  do evento de edição pelo log).
- **Métricas**: volume por canal, categoria e evento; tempo médio até a 1ª
  resposta e até a resolução.
- **Base de respostas**: agrupar dúvidas parecidas e sugerir a resposta já dada antes.
- Limpeza automática de `sac_webhook_logs` com mais de 30 dias.

---

## 9. Setup da Evolution API (pelo navegador, sem terminal)

**Opção recomendada, Railway (one-click):**
1. Railway → New Project → Deploy a Template → buscar "Evolution API" →
   escolher um template com a imagem **`evoapicloud/evolution-api:v2.3.7`**
   (que já vem com Postgres e Redis) → Deploy.
2. Anotar o **domínio público** e a **API key** gerada (variável `AUTHENTICATION_API_KEY`).
3. Abrir `https://<domínio>/manager` e entrar com a URL e a API key.
4. Criar uma instância com nome `sac` e canal Baileys. Gerar o QR code e
   escanear no celular em WhatsApp → Aparelhos conectados → Conectar aparelho.
5. Nas configurações da instância:
   - **Ignorar grupos: DESLIGADO** (senão nada chega);
   - **Sempre online: DESLIGADO** (senão o celular para de receber notificações);
   - **Marcar como lida: DESLIGADO**;
   - Sincronizar histórico completo: desligado.
6. Em Eventos → Webhook:
   - Ativado: **ON**
   - URL: `https://<gestor>/api/sac/webhook?token=<SAC_WEBHOOK_TOKEN>`
   - Webhook por eventos: **OFF**
   - Webhook Base64: **ON**
   - Eventos: `MESSAGES_UPSERT` (opcional: `MESSAGES_UPDATE`, `MESSAGES_DELETE`)

Os nomes dos campos no Manager podem variar um pouco entre versões.

**Testar local sem publicar o gestor**: no VS Code, aba **Portas** →
Encaminhar uma porta → porta do gestor → botão direito → Visibilidade da
porta → **Pública**. Usar essa URL no webhook enquanto desenvolve.

**Descobrir o ID do grupo**: mandar qualquer mensagem no grupo e ver
`data.key.remoteJid` em `sac_webhook_logs`, ou chamar
`GET {EVOLUTION_API_URL}/group/fetchAllGroups/sac?getParticipants=false`
com o header `apikey`.

---

## 10. Riscos e limites

- **API não oficial**: existe risco de bloqueio do número. Ler e reagir num
  grupo é baixo risco; **nunca** usar para disparo em massa. Usar um chip
  separado protege o número principal.
- **Aparelho conectado**: o WhatsApp desconecta aparelhos vinculados se o
  celular ficar muitos dias sem abrir o app. Monitorar o evento
  `CONNECTION_UPDATE`, ou checar o status da instância, e mostrar um alerta
  "WhatsApp desconectado" na aba SAC.
- **Não atualizar a Evolution para 2.4+** sem antes entender o licenciamento.
- **LGPD**: os prints têm dados pessoais. Usar storage privado e acesso
  autenticado, e considerar apagar as imagens de cards resolvidos depois de X meses.
