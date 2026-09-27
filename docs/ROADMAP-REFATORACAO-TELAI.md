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
- [x] Centralizar compactação de avatares e resumos de usuário em `server/shared/presentation.mjs`, preservando limites de payload para SQLite/PostgreSQL.
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
- [x] Extrair persistência e publicação de notificações para `server/notifications/service.mjs`, mantendo o evento pessoal `/events`.
- [x] Extrair limpeza periódica de OAuth, presença e sessões para `server/services/runtime-cleanup.mjs`, preservando o timer desacoplado do processo.
- [x] Extrair criação, leitura e envio de conversas diretas para `server/http/direct-routes.mjs`.
- [x] Extrair convites de membro e resgate de convites para `server/http/member-invite-routes.mjs`.
- [x] Extrair manutenção e API administrativa para `server/http/admin-routes.mjs`, mantendo a página `/admin` no servidor principal.
- [x] Extrair autenticação de operador, consultas paginadas e visão do painel para `server/admin/runtime.mjs`.
- [x] Extrair sessão, consentimento, cadastro, login, logout e operações de conta para `server/http/auth-routes.mjs`, mantendo OAuth no gateway.
- [x] Extrair o runtime de sessão, cookies, rate limit de login, PKCE e identidade OAuth para `server/auth/runtime.mjs`.
- [x] Extrair a guarda HTTP autenticada para `server/auth/guards.mjs`, mantendo o envelope 401 e o contrato síncrono/assíncrono.
- [x] Extrair hashing de senha e token de sessão para `server/auth/crypto.mjs`, mantendo o formato e a validação existentes.
- [x] Extrair buckets, políticas e limpeza de rate limit HTTP para `server/http/rate-limit.mjs`.
- [x] Extrair configuração de limites, buckets voláteis e limites de transporte para `server/config/limits.mjs`, mantendo clamps e valores padrão.
- [x] Centralizar a seleção dos repositórios SQLite/PostgreSQL e do repositório de manutenção em `server/database/runtime-repositories.mjs`, mantendo o bootstrap HTTP/gateway agnóstico ao driver.
- [x] Extrair métricas locais e diagnósticos de cliente para `server/http/observability-routes.mjs`.
- [x] Extrair o runtime de logs sanitizados, contadores HTTP e identificação de observabilidade local para `server/observability/runtime.mjs`.
- [x] Extrair o snapshot de métricas, proteções e diagnóstico para `server/observability/snapshot.mjs`, mantendo o envelope de `/metrics`.
- [x] Centralizar contexto de requisição, confiança em headers encaminhados, IP do cliente e origem pública em `server/http/request-context.mjs`.
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
- [x] Extrair coordenação de desconexão de membros em voz, presença e eventos para `server/domain/groups/runtime.mjs`, mantendo autorização na rota de moderação.
- [x] Centralizar a composição das rotas de grupos e seu runtime em `server/http/group-routes-runtime.mjs`, mantendo contratos de autorização, eventos e persistência.
- [x] Extrair início, callback e vínculo OAuth para `server/http/oauth-routes.mjs`, mantendo a sessão local e os provedores existentes.
- [x] Extrair normalização e validação de aplicações, comandos, componentes e modais para `server/domain/applications/normalization.mjs`, mantendo as rotas focadas em autorização e orquestração.
- [x] Extrair páginas SEO, legais, download, updates e fallback de arquivos para `server/http/static-routes.mjs`.
- [x] Extrair o despacho HTTP e a página administrativa para `server/http/router.mjs`, mantendo a ordem dos domínios e dos fallbacks.
- [x] Extrair ciclo de vida, headers de segurança, métricas e despacho de cada requisição para `server/http/request-handler.mjs`.
- [x] Extrair bootstrap, limites, heartbeat e lifecycle do WebSocket para `server/gateway/websocket.mjs`, mantendo handlers de voz/transmissão e o protocolo `/signal`.
- [x] Extrair serialização, sequência e envio seguro de mensagens do gateway para `server/gateway/socket-sender.mjs`, preservando o protocolo existente.
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
    - [x] Extrair carregamento concorrente de grupos, overview incremental, presença e criação/edição de grupos e canais para `frontend/src/features/groups/controller.js` em chunk separado.
- [x] Extrair o chat textual e a sala de voz do workspace de grupos para `frontend/src/features/groups`, mantendo o estado de mídia no shell.
- [x] Extrair o pipeline de entrada de voz para `frontend/src/services/media` sem alterar os filtros atuais.
- [x] Extrair utilitários de identificação, persistência e normalização de dispositivos de voz para `frontend/src/services/media/voice-device-utils.js`.
- [x] Extrair o diagnóstico e telemetria de erros do cliente para `frontend/src/services/client-diagnostics.js` sem alterar o layout.
- [x] Extrair captura, fallback e seleção do microfone para `frontend/src/services/media`.
- [x] Extrair sincronização, `replaceTrack` e renegociação do áudio local para `frontend/src/services/media`.
- [ ] Dividir `App.svelte` em stores e features sem alterar o layout.
  - [x] Extrair o controlador de relay WebM para `frontend/src/features/broadcast/relay-controller.js`, mantendo o transporte lazy e o shell visual.
  - [x] Extrair preparação pública, revisão, visibilidade e início de câmera para `frontend/src/features/broadcast/setup-controller.js`, preservando os mesmos diálogos e rotas.
  - [x] Extrair captura, composição e inicialização da transmissão para `frontend/src/features/broadcast/start-controller.js`, mantendo os fluxos P2P/relay e o layout.
  - [x] Extrair envio, chat e recuperação da captura para `frontend/src/features/broadcast/runtime-controller.js`, preservando mensagens, avisos e encerramento automático.
  - [x] Extrair encerramento, limpeza de peers/tracks, confirmação da API e fechamento do relay para `frontend/src/features/broadcast/lifecycle-controller.js`, mantendo o estado visual.
  - [x] Cobrir os controladores de runtime e lifecycle com testes unitários de socket, chat, recuperação, tracks, peers e confirmação da API.
  - [x] Extrair estado de navegação, grupos, mensagens e configurações para stores/serviços sem duplicar contratos.
    - [x] Extrair seleção de telas, abertura do workspace de grupos e navegação da sidebar para `frontend/src/features/shell/navigation-controller.js` em chunk lazy, preservando o layout.
    - [x] Extrair parsing de rotas públicas, visualizador, convites pendentes e canonicalização de login para `frontend/src/features/shell/route-controller.js`, preservando URLs e layout.
    - [x] Extrair o controle do breakpoint responsivo e fechamento da sidebar para `frontend/src/features/shell/viewport-controller.js`, preservando o layout.
    - [x] Extrair polling condicionado por visibilidade, manutenção e countdown para `frontend/src/services/client-polling.js`, preservando frequências e condições do shell.
    - [x] Extrair o controller de manutenção programada, countdown e reload protegido para `frontend/src/features/shell/maintenance-controller.js`, preservando o banner existente.
    - [x] Extrair a navegação e o fechamento do menu de conta para `frontend/src/features/shell/account-controller.js`, preservando destinos, rolagem e identidade visual.
    - [x] Centralizar a deduplicação monotônica de eventos WebSocket em `frontend/src/services/gateway-sequence.js`, preservando a ordem dos gateways.
    - [x] Extrair tema, cores personalizadas e defaults visuais para `frontend/src/features/settings/visual-state.js`, preservando bindings e identidade visual.
    - [x] Extrair estado do visualizador, fullscreen e rota de transmissão para `frontend/src/features/shell/viewer-state.js`, preservando URLs e navegação.
    - [x] Extrair submissão de login/cadastro e início de OAuth para `frontend/src/features/auth/controller.js`, preservando payloads e navegação existentes.
    - [x] Extrair o estado do formulário de autenticação para `frontend/src/features/auth/auth-state.js`, mantendo o `AuthPage` controlado sem alterar o layout.
    - [x] Extrair notificações, badge, preferência de leitura e carregamento concorrente para `frontend/src/features/notifications/notification-state.js`, preservando o controlador e o layout.
    - [x] Centralizar amigos, solicitações, busca, seguidores, bloqueios e estado da pesquisa em `frontend/src/features/social/social-state.js`, mantendo o `FriendsPage` controlado sem alterar o layout.
    - [x] Extrair abertura e navegação da tela de configurações para `frontend/src/features/settings/navigation-controller.js`, preservando bindings e carregamentos existentes.
    - [x] Extrair o pós-carregamento, seleção de salas e inscrição em eventos para `frontend/src/features/groups/controller.js`.
    - [x] Centralizar grupos, overview, sala selecionada e flags de carregamento em `frontend/src/features/groups/group-state.js`, preservando os contratos do shell.
    - [x] Extrair catálogo, carregamento e execução de comandos de aplicações para `frontend/src/features/groups/application-command-state.js` e `application-command-controller.js`, preservando o compositor visual.
    - [x] Centralizar rascunhos, edição, menções, busca e threads em `frontend/src/features/groups/message-state.js`, preservando os bindings do workspace textual.
    - [x] Centralizar conversas diretas, histórico, rascunho e flags de envio em `frontend/src/features/direct/direct-state.js`, preservando a tela e o contrato do controlador.
    - [x] Centralizar navegação, formulários de perfil/canal e flags de configuração em `frontend/src/features/settings/settings-state.js`, preservando a tela e os bindings visuais.
    - [x] Extrair leitura persistente, deduplicação de requests e contagem de não lidas para `frontend/src/features/groups/room-read-controller.js`.
    - [x] Extrair o ciclo de vida do gateway de eventos de grupos e o carregamento do handler para `frontend/src/features/groups/event-runtime.js`.
    - [x] Extrair o carregamento lazy e os wrappers da feature de threads para `frontend/src/features/groups/thread-runtime.js`.
    - [x] Centralizar carregadores lazy de telas e diálogos em `frontend/src/services/lazy-component-loader.js`, mantendo chunks e estados de erro.
    - [x] Extrair clipboard Electron/browser para `frontend/src/services/clipboard.js` e autocomplete de menções para `frontend/src/features/groups/mention-controller.js`.
    - [x] Extrair o painel de cargos e permissões da administração de grupos para `frontend/src/features/settings/GroupRolePermissionsPanel.svelte`, preservando classes e bindings.
    - [x] Extrair acesso por canal, convites, solicitações de entrada e auditoria para `frontend/src/features/settings/GroupAccessSettingsPanel.svelte`, mantendo componentes lazy e contratos existentes.
    - [x] Extrair o painel de áudio, dispositivos, PTT, filtros WebRTC, sons e sensibilidade para `frontend/src/features/settings/VoiceSettingsPanel.svelte`, sem alterar o pipeline de mídia.
    - [x] Extrair preferências, `AudioContext`, efeitos sonoros e sons pendentes de interação para `frontend/src/features/voice/sound-controller.js`, mantendo o estado visual no shell.
    - [x] Extrair o teste de microfone, medidor de nível e teste de alto-falante para `frontend/src/features/voice/audio-test-controller.js`, mantendo o estado visual e o pipeline de captura no shell.
    - [x] Extrair criação, retry, autoplay, volume e saída selecionada dos áudios remotos para `frontend/src/features/voice/remote-playback-controller.js`, mantendo o estado visual e o ciclo de peers no shell.
    - [x] Extrair resolução, volume individual, mudo local e persistência das preferências de participantes para `frontend/src/features/voice/participant-preferences-controller.js`, mantendo o estado visual no shell.
    - [x] Extrair recuperação, bind e reaplicação da trilha local de voz para `frontend/src/features/voice/input-lifecycle-controller.js`, mantendo captura, sincronização e estado visual no shell.
    - [x] Extrair PTT, atalho de mudo, botões laterais e registro global do Electron para `frontend/src/features/voice/shortcut-controller.js`, preservando os atalhos e mensagens atuais.
    - [x] Extrair notas de atualização e seu estado de leitura para `frontend/src/features/shell/release-notes-controller.js` em chunk lazy.
    - [x] Extrair atualização, inicialização com o sistema, aceleração gráfica e seletores de captura Electron para `frontend/src/features/shell/desktop-controller.js` em chunk lazy.
    - [x] Extrair transporte WebSocket, pares WebRTC, ICE, renegociação e chat do host para `frontend/src/features/broadcast/transport-controller.js` em chunk lazy.
    - [x] Extrair composição de vídeo, sobreposição de câmera e limpeza de tracks para `frontend/src/features/broadcast/composition-controller.js` em chunk lazy.
    - [x] Extrair o bridge PCM de áudio do Electron, incluindo áudio de janela/sistema e liberação do `AudioContext`, para `frontend/src/features/broadcast/audio-bridge-controller.js` em chunk lazy.
    - [x] Extrair captura de tela/janela, câmera, microfone, limites de resolução e fallback legado para `frontend/src/features/broadcast/capture-controller.js` em chunk lazy.
    - [x] Extrair mixagem de áudio da transmissão e liberação das trilhas compostas para `frontend/src/features/broadcast/audio-mixer-controller.js` em chunk lazy, preservando o fast path de trilha única.
    - [x] Extrair `replaceTrack`, remoção de duplicatas e renegociação de áudio dos peers para `frontend/src/features/broadcast/track-controller.js` em chunk lazy.
    - [x] Extrair os diálogos de configuração, revisão, visibilidade e seleção de fontes de transmissão para `frontend/src/features/broadcast/BroadcastDialogs.svelte`, carregados apenas quando necessários e mantendo o estado de captura no shell.
    - [x] Extrair carregamento, visualização pública, seleção e multistream para `frontend/src/features/live/controller.js` em chunk lazy, preservando rotas e layout.
    - [x] Extrair a tela “Ao vivo agora” para `frontend/src/features/live/LivePage.svelte`, preservando classes, ações, seleção e multistream.
    - [x] Extrair a central de multistream para `frontend/src/features/live/MultistreamPage.svelte`, com carregamento sob demanda e contratos de seleção preservados.
    - [x] Centralizar streams públicos, filtro de seguindo, multistream selecionado e preferências de lives em `frontend/src/features/live/live-state.js`, preservando contratos e identidade visual.
    - [x] Extrair menus contextuais de grupo, canal, voz e preview de perfil para `frontend/src/features/shell/ContextMenus.svelte`, carregados apenas quando necessários.
    - [x] Extrair diálogos de convite, descoberta, criação, saída e exclusão de grupos/canais para `frontend/src/features/groups/GroupDialogs.svelte`, carregados apenas quando necessários.
    - [x] Extrair operações de mensagens, anexos, edição, exclusão e busca para `frontend/src/features/groups/message-controller.js` em chunk lazy.
    - [x] Extrair descoberta de grupos, convites e solicitações de entrada para `frontend/src/features/groups/membership-controller.js` em chunk lazy.
    - [x] Extrair administração de cargos, ordenação e permissões de canal para `frontend/src/features/groups/administration-controller.js` em chunk lazy.
  - [x] Separar a tela de configurações por domínio e reduzir o markup restante do shell.
    - [x] Extrair navegação, cabeçalho, subnavegação interna e formulário de perfil do canal para `frontend/src/features/settings`.
    - [x] Centralizar o estado de navegação, breakpoints e painéis móveis em `frontend/src/features/shell/navigation-state.js`, preservando as bindings visuais do shell.
    - [x] Extrair cartões de perfil, preferências, contas conectadas e administração de grupo.
    - [x] Extrair a tela de configurações para `frontend/src/features/settings/SettingsPage.svelte`, preservando bindings, ações e identidade visual, com carregamento sob demanda.
    - [x] Extrair carregamento e persistência de perfil, canal, preferências gerais e preferências de voz para controlador em chunk separado, mantendo mídia e identidade visual no shell.
    - [x] Extrair cartão de notificações.
    - [x] Extrair carregamento, leitura e preferência de notificações para `frontend/src/features/notifications/controller.js`.
    - [x] Extrair workspace de voz com code-splitting sob demanda para não aumentar o bundle inicial.
    - [x] Extrair cartões residuais de restauração, inicialização e aceleração gráfica para `frontend/src/features/settings/ProfileSettingsExtras.svelte` em chunk lazy, preservando a identidade visual.

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
- [x] Anexos com armazenamento local controlado e posterior compatibilidade S3/MinIO.
  - [x] Persistir metadados em SQLite/PostgreSQL, armazenar arquivos fora do banco e servir downloads somente para membros autenticados, com limites de tamanho e tipos permitidos.
  - [x] Extrair um adapter S3/MinIO opcional em `server/media/attachment-storage.mjs`, mantendo local como padrão leve e documentando retenção, expiração, antivírus e custo.
  - [x] Integrar varredura antivírus e lifecycle operacional antes de ativar S3 em produção.
    - [x] Integrar scanner de comando opcional antes do storage, desativado por padrão, com timeout, arquivo temporário restrito e limpeza garantida.
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

- [x] Manter P2P para chamadas pequenas e TURN como fallback.
  - [x] Formalizar no contrato compartilhado a detecção de TURN e a política `iceTransportPolicy: relay` usada somente na recuperação de peers.
- [x] Criar contrato de mídia independente do restante do backend.
  - [x] Centralizar modos P2P/relay e perfis de qualidade em `shared/media-contract.mjs`, consumido pelo cliente e backend sem alterar o layout.
  - [x] Extrair criação de peers de voz, timeout, faixa remota e callbacks de recuperação para `frontend/src/features/voice/peer-controller.js`, preservando captura e comportamento visual.
- [ ] Avaliar SFU (LiveKit ou mediasoup) com teste de carga real.
  - [x] Registrar a comparação arquitetural e o gate de decisão em `docs/SFU-DECISION.md`; o teste de carga em servidor independente continua pendente.
- [x] Registrar baseline funcional P2P e critérios de benchmark em `docs/MEDIA-BENCHMARK.md` sem trocar a arquitetura atual.
- [ ] Avaliar codecs, bitrate adaptativo, simulcast/SVC e TURN adequados à VPS, preservando a interface atual.
  - [x] Registrar Opus/VP8 observados, perfis de `maxBitrate`/`maxFramerate`/`scaleResolutionDownBy` e adaptação nativa do WebRTC em `docs/MEDIA-BENCHMARK.md`.
  - [x] Manter TURN como fallback por peer e na recuperação, sem forçar relay global ou adicionar dependência pesada.
  - [ ] Medir simulcast/SVC e perfis alternativos em servidor independente antes de ativá-los no runtime P2P.
- [ ] Substituir o P2P por uma arquitetura de mídia escalável somente após benchmark de custo, latência, CPU e qualidade.
- [x] Adicionar métricas de jitter, perda, RTT, bitrate e reconexão.
  - [x] Extrair sumarização leve de `RTCStatsReport` e enviar amostras de qualidade de voz sob demanda, sem aumentar o bundle inicial.
    - [x] Extrair o polling de qualidade RTC para um controlador de voz independente, isolando snapshots por participante e preservando o bundle inicial lazy.
    - [x] Extrair a persistência/normalização da sessão de reconexão de voz para `frontend/src/services/media/voice-reconnect-storage.js`, mantendo o banner e o fluxo no shell.
    - [x] Extrair fila, buffer de candidatos e negociação offer/answer de voz para `frontend/src/features/voice/signaling-controller.js`, mantendo a captura local no shell.
    - [x] Extrair o monitor de áudio remoto, limiar de stall e recuperação via TURN para `frontend/src/features/voice/peer-health-controller.js`.
    - [x] Extrair timers, `iceRestart`, fallback TURN e recriação determinística de peers para `frontend/src/features/voice/peer-recovery-controller.js`.
    - [x] Incluir a contagem de recuperações por peer nos snapshots de qualidade RTC, cobrindo reconexão além de jitter, perda, RTT e bitrate.
- [x] Preservar captura de tela, janela, câmera, áudio de jogos e Electron.
  - [x] Validar captura real, limites de resolução, troca de fonte, primeira imagem, multistream e chat pelo fluxo Electron/WebRTC existente.
  - [x] Validar a ponte de áudio do Electron, mixagem, `replaceTrack` e reconexão automática sem alterar o shell visual.

### Fase 5 — Plataforma e escala sob demanda

- [x] Webhooks de entrada.
  - [x] Persistir webhooks por grupo/canal com token armazenado somente como hash e gestão restrita ao dono do grupo.
  - [x] Executar mensagens sem sessão, publicar evento em tempo real e preservar autoria no histórico SQLite/PostgreSQL.
- [ ] Tokens de aplicação e bots.
  - [x] Persistir aplicações e identidades de bot separadas do usuário humano em SQLite/PostgreSQL.
  - [x] Criar tokens aleatórios armazenados somente como hash, com listagem de metadados e revogação.
  - [x] Instalar/remover o bot em grupos autorizados pelo dono e manter a associação no banco.
   - [x] Publicar mensagens autenticadas por token e propagar o evento pelo gateway.
   - [x] Adicionar gerenciamento visual de aplicações, tokens, comandos e instalação de bots na área de configurações existente.
   - [x] Separar rotas de gerenciamento do proprietário das rotas de bot e interações em módulos HTTP independentes, preservando os contratos existentes.
   - [x] Adicionar escopos persistentes por instalação para comandos, mensagens e interações, mantendo todos habilitados por compatibilidade.
   - [x] Separar presenters, parsing de comandos e conversão de permissões do repositório de aplicações em um módulo de domínio compartilhado pelos drivers.
   - [x] Separar as implementações SQLite e PostgreSQL do repositório de aplicações, mantendo uma fachada de importação estável.
   - [x] Aplicar a permissão de interações no catálogo e no polling de bots para não expor nem capturar comandos desativados.
   - [ ] Ampliar a superfície de permissões, comandos e eventos com controles avançados.
- [x] Comandos, componentes e modais.
  - [x] Registrar comandos por aplicação com validação de nome, descrição e opções em SQLite/PostgreSQL.
  - [x] Expor o manifesto de comandos ao bot autenticado sem vazar tokens ou dados internos.
  - [x] Implementar fila expirada, claim exclusivo, resposta sanitizada e despacho de eventos para interações de comandos.
  - [x] Aceitar interações de componentes e submissões de modal com validação de campos e opções.
  - [x] Renderizar respostas de bot, botões, seleções e formulários modais no workspace de chat existente, preservando o shell visual.
  - [x] Persistir respostas no histórico visual e recuperar seus componentes após refresh.
  - [x] Descobrir comandos de bots instalados por grupo e executá-los pelo compositor de mensagens, sem criar uma tela paralela ou alterar a identidade visual.
- [x] Decidir PostgreSQL como banco principal e preparar a migração sem cutover.
- [x] Criar migration baseline e importador offline SQLite → PostgreSQL.
- [x] Subir PostgreSQL local em Docker e aplicar/validar a migration baseline sem cutover.
- [x] Impedir fallback silencioso entre drivers e selecionar explicitamente o conjunto de repositórios conforme `TELAI_DATABASE_DRIVER`.
- [x] Validar o primeiro domínio PostgreSQL opt-in (manutenção administrativa) com agendamento, leitura e limpeza contra o container local.
- [x] Serializar a aplicação de migrations PostgreSQL com advisory lock e cobrir inicialização concorrente com fixture descartável.
- [x] Consolidar migrations, paridade, repositories, importação e manutenção em uma suíte PostgreSQL local sequencial e reproduzível.
- [x] Corrigir a ordem de compatibilidade SQLite legada para que índices de colunas adicionadas depois do schema não impeçam a inicialização.
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
- [x] Validar a smoke test da API HTTP completa com o runtime PostgreSQL em banco temporário isolado.
- [ ] Executar migration, importar dados e ativar PostgreSQL após validação real.
  - [x] Executar as migrations e o importador real no banco PostgreSQL local; as 33 tabelas importáveis tinham zero registros na SQLite de origem.
  - [x] Ativar uma instância opt-in do runtime PostgreSQL em `127.0.0.1:8788`, mantendo a prévia SQLite em `127.0.0.1:8787` e sem alterar produção.
- [ ] Adicionar Redis/event bus somente quando houver mais de uma instância ou necessidade de filas.

## Critérios de conclusão

Cada fase só será considerada concluída quando:

1. O comportamento existente continuar funcionando.
2. O build frontend passar sem warnings novos relevantes.
3. Os testes aplicáveis passarem.
4. O diff não carregar banco, instalador, `node_modules` ou temporários.
5. A mudança tiver commit próprio e descrição clara.
