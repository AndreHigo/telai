# Roadmap de refatoração do Telai

## Objetivo

Evoluir o Telai para uma plataforma própria de comunidades, voz, vídeo e transmissão com qualidade de produto maduro, sem copiar a identidade visual do Discord e sem transformar o sistema em uma pilha pesada de microserviços.

O objetivo é preservar a experiência e os diferenciais atuais do Telai enquanto separamos responsabilidades, fortalecemos os contratos internos e abrimos espaço para novas funcionalidades.

## Regras da refatoração

- Trabalhar somente na branch `codex/refactor-telai` deste checkout.
- Preservar o comportamento existente antes de adicionar novos recursos.
- Manter o núcleo como um monólito modular inicialmente.
- Não introduzir Redis, RabbitMQ ou Kubernetes sem uma necessidade comprovada; PostgreSQL já foi decidido como próximo banco principal.
- Não gerar instalador para mudanças exclusivamente web/backend.
- Validar cada fatia com build, testes aplicáveis e revisão do diff.
- Manter arquivos locais, GitHub, build/testes e produção como estados separados.

## Estado inicial identificado

- Backend concentrado em `server.mjs`, com HTTP, SQLite, autenticação, WebSocket, voz, transmissão e administração no mesmo módulo.
- Frontend concentrado em `frontend/src/App.svelte`, com estado de navegação, chat, voz, captura, configurações e chamadas de API no mesmo componente.
- SQLite em modo WAL e estado de presença/voz/transmissão em memória.
- WebSocket `/signal` usado para sinalização WebRTC, voz e eventos de transmissão.
- Já existem testes de API, segurança, mídia, Electron, observabilidade, notificações e auditoria web.

## Arquitetura alvo incremental

```text
server/
  config/              configuração e limites
  http/                transporte HTTP e respostas
  auth/                sessão, OAuth e consentimento
  users/               perfil, amizades e preferências
  communities/         grupos, membros, convites e descoberta
  channels/             salas, mensagens e permissões por canal
  notifications/       notificações persistentes
  gateway/              eventos em tempo real e reconexão
  media/                voz, WebRTC, captura e SFU futuro
  integrations/         webhooks, bots e comandos futuros
  repositories/         acesso ao banco e migrações
  shared/               validação, IDs, erros e contratos

frontend/src/
  app/                  shell e roteamento visual
  stores/               estado compartilhado
  services/             API, Gateway e mídia
  features/             comunidades, chat, voz, live e configurações
  components/           componentes reutilizáveis
```

## Fases

### Fase 0 — Base e segurança da mudança

- [x] Copiar o código-fonte para este checkout separado.
- [x] Excluir dependências instaladas, banco, backups e artefatos gerados da base versionável.
- [x] Registrar este roadmap.
- [x] Criar commit inicial da cópia limpa (`a55e478`).
- [x] Registrar o estado do código-fonte que veio do clone real.

Snapshot inicial: código copiado do checkout local do Telai/Mirante, remoto
`https://github.com/AndreHigo/mirante.git`, preservando o estado funcional
existente no momento da cópia. Esta branch é independente e ainda não foi
enviada ao GitHub nem publicada em produção.

### Fase 1 — Monólito modular sem mudança de produto

- [x] Extrair normalização de nomes e limites de sala para módulos de domínio.
- [x] Extrair configuração de runtime e limites operacionais.
- [x] Extrair validações puras de entrada e normalização de dados.
- [x] Padronizar formato de erros HTTP sem alterar contratos existentes, mantendo `error` e adicionando `code` estável em `server/http/body.mjs`.
- [x] Extrair abertura do SQLite e migrações genéricas para `server/repositories`.
- [x] Isolar colunas e índices de compatibilidade SQLite do bootstrap principal.
- [x] Extrair o repositório de acesso e permissões de grupos.
- [x] Extrair o repositório de conversas diretas.
- [x] Extrair o acesso persistente às sessões de autenticação.
- [x] Extrair a escrita persistente de notificações.
- [x] Extrair o repositório de perfil de canal.
- [x] Extrair o repositório de preferências gerais e de áudio por usuário.
- [x] Extrair listagem e estado de leitura das notificações persistentes.
- [x] Separar o sincronizador de notificações e suas consultas de domínio.
- [x] Preparar pool, Compose local e plano de migração para PostgreSQL.
- [x] Criar implementações PostgreSQL assíncronas para os repositórios já extraídos e testá-las com rollback.
- [x] Extrair o repositório de autenticação, contas vinculadas e consentimentos sem alterar o fluxo existente.
- [x] Extrair criação e vínculo de contas OAuth, mantendo a mesclagem de contas como operação transacional separada.
- [x] Extrair exportação, exclusão e mesclagem de contas com transações e rollback explícitos.
- [x] Extrair busca social, amizades, solicitações e follows do roteador HTTP.
- [x] Validar o contrato PostgreSQL do domínio social com transação de teste e rollback.
- [x] Extrair setup de canais/cargos padrão e migração de permissões legadas dos grupos.
- [x] Extrair criação, leitura e envio transacional de conversas e mensagens diretas.
- [x] Extrair leitura e envio de mensagens de grupo do overview/roteador.
- [x] Extrair lista, busca e criação transacional de grupos.
- [x] Extrair convites de membro e convites por token, incluindo aceitação, expiração, resgate e revogação.
- [x] Extrair solicitações de entrada em grupos, decisão administrativa e aprovação transacional.
- [x] Extrair criação, ordenação, edição, exclusão e atribuição de cargos de grupo.
- [x] Extrair CRUD e validação de slug das salas de texto e voz, mantendo presença/runtime fora do repositório.
- [x] Extrair atualização e leitura de permissões individuais dos membros.
- [x] Extrair listagem, presença de membros e saída transacional de grupos.
- [x] Extrair persistência de streams, chat da transmissão, follows e encerramento sem acoplar o WebRTC ao banco.
- [x] Extrair atualização e exclusão persistente de grupos, mantendo cleanup de runtime no gateway.
- [x] Extrair consultas paginadas de administração e membros, mantendo métricas de runtime fora do repositório.
- [x] Extrair agendamento, consulta e cancelamento de manutenção do roteador HTTP.
- [x] Extrair rotas de perfil, canal, preferências e preferências de voz para `server/http/user-settings-routes.mjs`.
- [x] Extrair busca social, amizades, solicitações e follows para `server/http/social-routes.mjs`.
- [x] Extrair listagem, leitura e sincronização de notificações para `server/http/notification-routes.mjs`.
- [x] Extrair apresentação contextual de lives e sincronização de notificações para `server/notifications/runtime.mjs`.
- [x] Extrair criação, leitura e envio de conversas diretas para `server/http/direct-routes.mjs`.
- [x] Extrair convites de membro e resgate de convites para `server/http/member-invite-routes.mjs`.
- [x] Extrair manutenção e API administrativa para `server/http/admin-routes.mjs`, mantendo a página `/admin` no servidor principal.
- [x] Extrair autenticação de operador, consultas paginadas e visão do painel para `server/admin/runtime.mjs`.
- [x] Extrair sessão, consentimento, cadastro, login, logout e operações de conta para `server/http/auth-routes.mjs`, mantendo OAuth no gateway.
- [x] Extrair o runtime de sessão, cookies, rate limit de login, PKCE e identidade OAuth para `server/auth/runtime.mjs`.
- [x] Extrair hashing de senha e token de sessão para `server/auth/crypto.mjs`, mantendo o formato e a validação existentes.
- [x] Extrair buckets, políticas e limpeza de rate limit HTTP para `server/http/rate-limit.mjs`.
- [x] Extrair métricas locais e diagnósticos de cliente para `server/http/observability-routes.mjs`.
- [x] Extrair descoberta, criação e saída de grupos para `server/http/group-discovery-routes.mjs`, mantendo exclusão e runtime de voz no gateway.
- [x] Extrair solicitações de entrada, configurações e visão administrativa de grupos para `server/http/group-management-routes.mjs`.
- [x] Extrair criação, ordenação, edição, exclusão e atribuição de cargos para `server/http/group-role-routes.mjs`.
- [x] Extrair CRUD e validação de slug das salas de texto e voz para `server/http/group-room-routes.mjs`, mantendo presença e WebRTC no gateway.
- [x] Extrair envio de mensagens textuais e atualização de permissões para `server/http/group-content-routes.mjs`.
- [x] Extrair criação e revogação de convites de grupo e convites de membros para `server/http/group-invite-routes.mjs`.
- [x] Extrair configuração ICE, healthcheck e runtime config para `server/http/media-routes.mjs`, mantendo WebRTC/WebSocket no gateway.
- [x] Extrair resolução, listagem, abertura, encerramento e follows de streams para `server/http/stream-routes.mjs`, mantendo salas runtime e WebRTC no gateway.
- [x] Extrair presença, autorização, validade runtime e caminhos públicos de streams para `server/domain/streams/runtime.mjs`.
- [x] Extrair autorização de host/viewer para `server/domain/streams/runtime.mjs`, mantendo as regras de visibilidade e grupo.
- [x] Extrair exclusão de grupos, overview e presença para `server/http/group-runtime-routes.mjs`, mantendo o runtime de voz no gateway.
- [x] Extrair início, callback e vínculo OAuth para `server/http/oauth-routes.mjs`, mantendo a sessão local e os provedores existentes.
- [x] Extrair páginas SEO, legais, download, updates e fallback de arquivos para `server/http/static-routes.mjs`.
- [x] Extrair o despacho HTTP e a página administrativa para `server/http/router.mjs`, mantendo a ordem dos domínios e dos fallbacks.
- [x] Extrair ciclo de vida, headers de segurança, métricas e despacho de cada requisição para `server/http/request-handler.mjs`.
- [x] Extrair bootstrap, limites, heartbeat e lifecycle do WebSocket para `server/gateway/websocket.mjs`, mantendo handlers de voz/transmissão e o protocolo `/signal`.
- [x] Extrair o handler binário do relay de mídia para `server/gateway/binary-message.mjs`, mantendo limites e ressincronização.
- [x] Extrair entrada, moderação, estado e sinalização das salas de voz para `server/gateway/voice-message-handler.mjs`.
- [x] Extrair criação de salas, participantes, autorização, saída e substituição de sessões para `server/domain/voice/runtime.mjs`.
- [x] Extrair validação de SDP/ICE e rate limits de sinalização, fala e mensagens de controle para `server/gateway/policy.mjs`.
- [x] Extrair entrada, relay, sinalização, qualidade, chat e encerramento de transmissões para `server/gateway/broadcast-message-handler.mjs`.
- [x] Extrair o dispatcher de mensagens WebSocket para `server/gateway/message-dispatcher.mjs`.
- [x] Extrair runtime de salas, reconexão do host, relay e presença para `server/gateway/broadcast-runtime.mjs`.
- [x] Extrair a configuração ICE/STUN/TURN para `server/media/ice-configuration.mjs`, mantendo credenciais TURN temporárias.
- [x] Separar consultas/repositórios restantes de domínio das rotas HTTP.
- [x] Separar autenticação, grupos, mensagens, notificações e mídia por domínio.
- [x] Extrair o cliente HTTP para `frontend/src/services` sem alterar o layout.
- [x] Extrair configuração de ícones e navegação global do `App.svelte`.
- [x] Extrair a feature de autenticação para `frontend/src/features/auth`.
- [x] Extrair a feature de notificações para `frontend/src/features/notifications`.
- [x] Extrair a feature de amigos para `frontend/src/features/social`.
- [x] Extrair a tela de canais seguidos para `frontend/src/features/social`.
- [x] Extrair a feature de mensagens diretas para `frontend/src/features/direct`.
- [x] Extrair o controlador de conversas diretas e carregá-lo em chunk separado para reduzir o bundle inicial.
- [x] Extrair carregamento, busca, amizades e follows para `frontend/src/features/social/controller.js` em chunk separado.
- [x] Extrair a camada de apresentação da transmissão para `frontend/src/features/broadcast`.
- [x] Extrair o cabeçalho, navegação global e banner de reconexão do shell para `frontend/src/features/shell`.
- [x] Extrair a tela inicial para `frontend/src/features/home` sem alterar sua identidade visual.
- [x] Extrair a seleção de grupos, rails de comunidades/canais/membros e cabeçalho do workspace para `frontend/src/features/groups`.
- [x] Extrair carregamento concorrente de grupos, overview incremental e presença para `frontend/src/features/groups/controller.js` em chunk separado.
- [x] Extrair o chat textual e a sala de voz do workspace de grupos para `frontend/src/features/groups`, mantendo o estado de mídia no shell.
- [x] Extrair o pipeline de entrada de voz para `frontend/src/services/media` sem alterar os filtros atuais.
- [x] Extrair utilitários de identificação, persistência e normalização de dispositivos de voz para `frontend/src/services/media/voice-device-utils.js`.
- [x] Extrair o diagnóstico e telemetria de erros do cliente para `frontend/src/services/client-diagnostics.js` sem alterar o layout.
- [x] Extrair captura, fallback e seleção do microfone para `frontend/src/services/media`.
- [x] Extrair sincronização, `replaceTrack` e renegociação do áudio local para `frontend/src/services/media`.
- [ ] Dividir `App.svelte` em stores e features sem alterar o layout.
  - [ ] Extrair estado de navegação, grupos, mensagens e configurações para stores/serviços sem duplicar contratos.
    - [x] Extrair seleção de telas, abertura do workspace de grupos e navegação da sidebar para `frontend/src/features/shell/navigation-controller.js` em chunk lazy, preservando o layout.
    - [x] Extrair notas de atualização e seu estado de leitura para `frontend/src/features/shell/release-notes-controller.js` em chunk lazy.
    - [x] Extrair atualização, inicialização com o sistema, aceleração gráfica e seletores de captura Electron para `frontend/src/features/shell/desktop-controller.js` em chunk lazy.
    - [x] Extrair transporte WebSocket, pares WebRTC, ICE, renegociação e chat do host para `frontend/src/features/broadcast/transport-controller.js` em chunk lazy.
    - [x] Extrair composição de vídeo, sobreposição de câmera e limpeza de tracks para `frontend/src/features/broadcast/composition-controller.js` em chunk lazy.
    - [x] Extrair o bridge PCM de áudio do Electron, incluindo áudio de janela/sistema e liberação do `AudioContext`, para `frontend/src/features/broadcast/audio-bridge-controller.js` em chunk lazy.
    - [x] Extrair captura de tela/janela, câmera, microfone, limites de resolução e fallback legado para `frontend/src/features/broadcast/capture-controller.js` em chunk lazy.
    - [x] Extrair mixagem de áudio da transmissão e liberação das trilhas compostas para `frontend/src/features/broadcast/audio-mixer-controller.js` em chunk lazy, preservando o fast path de trilha única.
    - [x] Extrair `replaceTrack`, remoção de duplicatas e renegociação de áudio dos peers para `frontend/src/features/broadcast/track-controller.js` em chunk lazy.
    - [x] Extrair carregamento, visualização pública, seleção e multistream para `frontend/src/features/live/controller.js` em chunk lazy, preservando rotas e layout.
    - [x] Extrair operações de mensagens, anexos, edição, exclusão e busca para `frontend/src/features/groups/message-controller.js` em chunk lazy.
    - [x] Extrair descoberta de grupos, convites e solicitações de entrada para `frontend/src/features/groups/membership-controller.js` em chunk lazy.
    - [x] Extrair administração de cargos, ordenação e permissões de canal para `frontend/src/features/groups/administration-controller.js` em chunk lazy.
  - [ ] Separar a tela de configurações por domínio e reduzir o markup restante do shell.
    - [x] Extrair navegação, cabeçalho, subnavegação interna e formulário de perfil do canal para `frontend/src/features/settings`.
    - [x] Extrair cartões de perfil, preferências, contas conectadas e administração de grupo.
    - [x] Extrair carregamento e persistência de perfil, canal, preferências gerais e preferências de voz para controlador em chunk separado, mantendo mídia e identidade visual no shell.
    - [x] Extrair cartão de notificações.
    - [x] Extrair carregamento, leitura e preferência de notificações para `frontend/src/features/notifications/controller.js`.
    - [x] Extrair workspace de voz com code-splitting sob demanda para não aumentar o bundle inicial.

### Fase 2 — Contratos e tempo real

- [x] Definir `/api/v1` como namespace compatível inicial e envelope de erros consistente.
- [x] Gerar documento OpenAPI versionado em `/api/v1/openapi.json`.
- [x] Migrar o cliente HTTP interno para o namespace `/api/v1`.
- [x] Criar tipos TypeScript para o cliente interno e validá-los com `tsc --noEmit` sem converter o shell Svelte inteiro.
- [x] Criar Gateway de eventos separado da sinalização WebRTC em `/events`, mantendo voz, transmissão e relay em `/signal`.
- [x] Adicionar heartbeat nativo ao WebSocket para detectar conexões mortas.
- [x] Adicionar sequência monotônica por conexão e descarte de eventos de controle antigos no cliente.
- [x] Adicionar reconexão automática e ressincronização segura após queda, validada com queda controlada do socket e novo `voice-joined` autoritativo.
- [x] Trocar polling de chat/presença por eventos autenticados de grupo; o refresh periódico mantém apenas metadados do overview sem transportar mensagens.

### Fase 3 — Núcleo funcional de comunidade

- [x] Permissões por grupo, cargo e canal.
  - [x] Criar overrides por cargo/canal, interface administrativa, e aplicar a visão, chat, voz e eventos em tempo real.
- [x] Hierarquia de cargos, com ordenação persistente e moderação delegada apenas sobre cargos inferiores.
- [x] Auditoria administrativa.
  - [x] Registrar mudanças de grupo, cargos, atribuições de membros, canais e overrides de permissão em SQLite/PostgreSQL.
  - [x] Expor histórico paginado somente ao dono e apresentar as ações recentes na administração do grupo.
- [x] Editar/excluir mensagens com autorização do autor/dono, sincronização por eventos e controles inline.
- [ ] Anexos com armazenamento local controlado e posterior compatibilidade S3/MinIO.
  - [x] Persistir metadados em SQLite/PostgreSQL, armazenar arquivos fora do banco e servir downloads somente para membros autenticados, com limites de tamanho e tipos permitidos.
  - [ ] Extrair um adapter S3/MinIO opcional após definir retenção, expiração, antivírus e política de custo.
- [x] Threads, busca, não lidas e notificações em tempo real.
  - [x] Persistir cursores de leitura por membro/canal, expor `unreadCount` no overview e atualizar o badge pelo gateway de eventos.
  - [x] Buscar mensagens por grupo/canal com limite de resultados e modal leve no frontend.
  - [x] Adicionar threads de uma camada com respostas persistentes, limite de 100 itens e painel carregado sob demanda.
  - [x] Entregar notificações pessoais persistidas pelo gateway `/events`, com atualização otimista e leitura sincronizada.
- [x] Moderação básica: bloquear, expulsar, banir e silenciar.
  - [x] Bloquear e desbloquear usuários, removendo vínculos sociais e impedindo novas mensagens diretas.
  - [x] Expulsar, banir, silenciar, remover silêncio e desfazer banimento no servidor, com auditoria e desconexão de voz/eventos.
  - [x] Permissão de moderação por cargo com respeito à hierarquia.

### Fase 4 — Qualidade de mídia

- [ ] Manter P2P para chamadas pequenas e TURN como fallback.
- [ ] Criar contrato de mídia independente do restante do backend.
- [ ] Avaliar SFU (LiveKit ou mediasoup) com teste de carga real.
- [ ] Avaliar codecs, bitrate adaptativo, simulcast/SVC e TURN adequados à VPS, preservando a interface atual.
- [ ] Substituir o P2P por uma arquitetura de mídia escalável somente após benchmark de custo, latência, CPU e qualidade.
- [ ] Adicionar métricas de jitter, perda, RTT, bitrate e reconexão.
  - [x] Extrair sumarização leve de `RTCStatsReport` e enviar amostras de qualidade de voz sob demanda, sem aumentar o bundle inicial.
  - [x] Extrair o polling de qualidade RTC para um controlador de voz independente, isolando snapshots por participante e preservando o bundle inicial lazy.
- [ ] Preservar captura de tela, janela, câmera, áudio de jogos e Electron.

### Fase 5 — Plataforma e escala sob demanda

- [ ] Webhooks de entrada.
- [ ] Tokens de aplicação e bots.
- [ ] Comandos, componentes e modais.
- [x] Decidir PostgreSQL como banco principal e preparar a migração sem cutover.
- [x] Criar migration baseline e importador offline SQLite → PostgreSQL.
- [x] Subir PostgreSQL local em Docker e aplicar/validar a migration baseline sem cutover.
- [x] Impedir fallback silencioso entre drivers e selecionar explicitamente o conjunto de repositórios conforme `TELAI_DATABASE_DRIVER`.
- [x] Validar o primeiro domínio PostgreSQL opt-in (manutenção administrativa) com agendamento, leitura e limpeza contra o container local.
- [x] Serializar a aplicação de migrations PostgreSQL com advisory lock e cobrir inicialização concorrente com fixture descartável.
- [x] Tornar as rotas HTTP de social e mensagens diretas explicitamente compatíveis com repositórios síncronos e assíncronos, sem alterar o comportamento SQLite.
- [x] Tornar descoberta, gestão, salas, permissões, auditoria e convites de grupos compatíveis com repositórios síncronos e assíncronos.
- [x] Tornar cargos, moderação, mensagens, anexos, threads, overview e presença de grupos compatíveis com repositórios síncronos e assíncronos.
- [x] Ajustar o helper HTTP JSON para encerrar corretamente o dispatch quando uma rota assíncrona responde diretamente.
- [x] Tornar configurações de usuário, preferências de voz, notificações e convites pendentes compatíveis com repositórios síncronos e assíncronos.
- [x] Tornar as rotas HTTP de transmissões públicas, follows e resolução de canais compatíveis com repositórios síncronos e assíncronos.
- [x] Migrar autenticação, sessões, contas e o handshake de autenticação dos gateways HTTP/WebSocket para a fronteira assíncrona.
- [x] Migrar autorização de voz e filtragem do gateway de eventos para consultas assíncronas de salas, membros e permissões.
- [x] Migrar autorização privada, histórico/chat e encerramento de transmissões para o runtime assíncrono de streams.
- [x] Migrar o painel administrativo, paginação e overview para consultas assíncronas de contas, grupos, membros e streams.
- [x] Completar a fronteira assíncrona das rotas HTTP e gateways cobertas pelo runtime atual antes de selecionar os repositórios PostgreSQL.
- [x] Selecionar os repositórios PostgreSQL no runtime e validar API, gateways, segurança, administração, observabilidade, reconexão de voz e mídia contra PostgreSQL local.
- [ ] Executar migration, importar dados e ativar PostgreSQL após validação real.
- [ ] Adicionar Redis/event bus somente quando houver mais de uma instância ou necessidade de filas.

## Critérios de conclusão

Cada fase só será considerada concluída quando:

1. O comportamento existente continuar funcionando.
2. O build frontend passar sem warnings novos relevantes.
3. Os testes aplicáveis passarem.
4. O diff não carregar banco, instalador, `node_modules` ou temporários.
5. A mudança tiver commit próprio e descrição clara.
