# API v1

O Telai agora oferece `/api/v1` como namespace versionado inicial, sem
duplicar os handlers existentes e sem alterar as rotas legadas em `/api`.

Nesta primeira etapa, `/api/v1/<rota>` é um alias compatível de
`/api/<rota>`. Autenticação, autorização, validação, limites de requisição e
mensagens de erro permanecem os mesmos nos dois namespaces. Os limites usam a
mesma chave normalizada, portanto alternar entre `/api` e `/api/v1` não cria
uma forma de contornar rate limit.

`GET /api/v1` retorna a disponibilidade da versão. Rotas inexistentes usam o
envelope JSON de erro com `code: "not_found"`.

O contrato está disponível em `GET /api/v1/openapi.json`. Ele descreve as
rotas HTTP versionadas e o esquema comum de erros sem adicionar dependências
ao runtime.

O cliente HTTP interno do frontend já usa `/api/v1` automaticamente para as
rotas `/api/*`; os componentes continuam usando seus caminhos lógicos atuais,
sem alteração visual ou duplicação de URLs.

Mensagens de grupo podem ser editadas ou excluídas pelo autor; o dono do grupo
também pode excluir mensagens para moderação. As alterações são publicadas no
gateway `/events` como `group-message-updated` e `group-message-deleted`.

O dono também pode usar `/api/v1/groups/{groupId}/rooms/{roomId}/permissions`
para configurar overrides por cargo (`canView`, `canChat` e `canConnect`).
Esses overrides são aplicados no servidor ao overview, chat, voz e entrega de
eventos; remover o override faz o cargo voltar a herdar as permissões do grupo.

O dono também pode consultar `GET /api/v1/groups/{groupId}/audit-log`. A
resposta contém `entries` com as ações administrativas recentes e
`nextBefore`; use esse cursor em `before` para buscar páginas anteriores.

`POST /api/v1/groups/{groupId}/rooms/{roomId}/read` persiste o último ponto
lido do membro no canal de texto. O overview devolve `unreadCount` por canal;
mensagens anteriores à entrada do membro e mensagens próprias não entram nessa
contagem.

`GET /api/v1/groups/{groupId}/messages/search?q=...` busca até 50 mensagens
visíveis ao membro; `roomId` pode restringir a busca a um canal de texto.

`GET /api/v1/groups/{groupId}/messages/{messageId}/thread` lista a mensagem
principal e até 100 respostas diretas. Respostas não podem abrir uma segunda
camada de thread e continuam sujeitas às permissões do canal.

O dono pode usar `POST /api/v1/groups/{groupId}/moderation` com `action` igual
a `kick`, `ban`, `mute`, `unmute` ou `unban`. Cargos com a permissão de moderar
membros também podem usar a rota, mas somente contra cargos inferiores na ordem
do grupo. Banimentos e silêncios aceitam `durationMinutes` e `reason`; a
autorização e o bloqueio de mensagens são aplicados no servidor.

`POST /api/v1/users/{userId}/block` bloqueia uma conta, remove amizades,
solicitações pendentes e follows entre as duas contas e impede novas
interações sociais ou mensagens diretas. `DELETE` na mesma rota desbloqueia a
conta; a lista de bloqueados é retornada em `GET /api/v1/social`.

Mensagens de grupo também aceitam `attachments` no POST. Cada mensagem pode
ter até 4 anexos, com no máximo 8 MB por arquivo e 20 MB no conjunto. Nesta
fase são aceitos imagens, PDF, texto simples, áudio e vídeo nos tipos
permitidos pelo servidor; o conteúdo é enviado como data URL e armazenado no
diretório privado da aplicação, enquanto o banco guarda somente os metadados.
`GET /api/v1/groups/{groupId}/attachments/{attachmentId}` exige sessão e
participação no grupo. A resposta das mensagens expõe apenas `id`, nome, tipo,
tamanho, data e URL protegida, nunca a chave interna de armazenamento.

O namespace ainda não representa uma promessa de compatibilidade eterna para
cada campo de resposta. Antes de remover ou alterar contratos, novas mudanças
incompatíveis devem ser introduzidas em outra versão e documentadas aqui.

As mensagens de controle do WebSocket incluem `sequence` monotônica por
conexão. O cliente descarta sequências repetidas ou antigas; mensagens
binárias de relay continuam fora desse envelope.

Eventos de comunidade usam o WebSocket autenticado `/events`, separado da
sinalização WebRTC em `/signal`. O contrato e o fluxo de assinatura estão em
`docs/EVENTS-GATEWAY.md`.

Após uma queda inesperada do socket de voz, o cliente persiste a sala ativa,
refaz a conexão automaticamente e aceita o novo estado somente depois do
`voice-joined` emitido pelo servidor. Esse fluxo é coberto por
`pnpm run test:voice-reconnect`.
