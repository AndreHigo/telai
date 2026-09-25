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
