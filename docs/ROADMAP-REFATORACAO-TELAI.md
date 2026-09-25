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
- [ ] Padronizar formato de erros HTTP sem alterar contratos existentes.
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
- [x] Extrair criação, leitura e envio de conversas diretas para `server/http/direct-routes.mjs`.
- [x] Extrair convites de membro e resgate de convites para `server/http/member-invite-routes.mjs`.
- [x] Extrair manutenção e API administrativa para `server/http/admin-routes.mjs`, mantendo a página `/admin` no servidor principal.
- [x] Extrair sessão, consentimento, cadastro, login, logout e operações de conta para `server/http/auth-routes.mjs`, mantendo OAuth no gateway.
- [x] Extrair métricas locais e diagnósticos de cliente para `server/http/observability-routes.mjs`.
- [x] Extrair descoberta, criação e saída de grupos para `server/http/group-discovery-routes.mjs`, mantendo exclusão e runtime de voz no gateway.
- [x] Extrair solicitações de entrada, configurações e visão administrativa de grupos para `server/http/group-management-routes.mjs`.
- [x] Extrair criação, ordenação, edição, exclusão e atribuição de cargos para `server/http/group-role-routes.mjs`.
- [x] Extrair CRUD e validação de slug das salas de texto e voz para `server/http/group-room-routes.mjs`, mantendo presença e WebRTC no gateway.
- [x] Extrair envio de mensagens textuais e atualização de permissões para `server/http/group-content-routes.mjs`.
- [x] Extrair criação e revogação de convites de grupo e convites de membros para `server/http/group-invite-routes.mjs`.
- [x] Extrair configuração ICE, healthcheck e runtime config para `server/http/media-routes.mjs`, mantendo WebRTC/WebSocket no gateway.
- [x] Extrair resolução, listagem, abertura, encerramento e follows de streams para `server/http/stream-routes.mjs`, mantendo salas runtime e WebRTC no gateway.
- [x] Extrair exclusão de grupos, overview e presença para `server/http/group-runtime-routes.mjs`, mantendo o runtime de voz no gateway.
- [x] Extrair início, callback e vínculo OAuth para `server/http/oauth-routes.mjs`, mantendo a sessão local e os provedores existentes.
- [x] Extrair páginas SEO, legais, download, updates e fallback de arquivos para `server/http/static-routes.mjs`.
- [x] Extrair bootstrap, limites, heartbeat e lifecycle do WebSocket para `server/gateway/websocket.mjs`, mantendo handlers de voz/transmissão e o protocolo `/signal`.
- [x] Extrair o handler binário do relay de mídia para `server/gateway/binary-message.mjs`, mantendo limites e ressincronização.
- [x] Extrair entrada, moderação, estado e sinalização das salas de voz para `server/gateway/voice-message-handler.mjs`.
- [x] Extrair entrada, relay, sinalização, qualidade, chat e encerramento de transmissões para `server/gateway/broadcast-message-handler.mjs`.
- [x] Extrair a configuração ICE/STUN/TURN para `server/media/ice-configuration.mjs`, mantendo credenciais TURN temporárias.
- [ ] Separar consultas/repositórios restantes de domínio das rotas HTTP.
- [ ] Separar autenticação, grupos, mensagens, notificações e mídia por domínio.
- [x] Extrair o cliente HTTP para `frontend/src/services` sem alterar o layout.
- [x] Extrair configuração de ícones e navegação global do `App.svelte`.
- [x] Extrair a feature de autenticação para `frontend/src/features/auth`.
- [x] Extrair a feature de notificações para `frontend/src/features/notifications`.
- [x] Extrair a feature de amigos para `frontend/src/features/social`.
- [x] Extrair a tela de canais seguidos para `frontend/src/features/social`.
- [x] Extrair a feature de mensagens diretas para `frontend/src/features/direct`.
- [x] Extrair a camada de apresentação da transmissão para `frontend/src/features/broadcast`.
- [x] Extrair o cabeçalho, navegação global e banner de reconexão do shell para `frontend/src/features/shell`.
- [x] Extrair a tela inicial para `frontend/src/features/home` sem alterar sua identidade visual.
- [x] Extrair a seleção de grupos, rails de comunidades/canais/membros e cabeçalho do workspace para `frontend/src/features/groups`.
- [x] Extrair o chat textual e a sala de voz do workspace de grupos para `frontend/src/features/groups`, mantendo o estado de mídia no shell.
- [x] Extrair o pipeline de entrada de voz para `frontend/src/services/media` sem alterar os filtros atuais.
- [x] Extrair o diagnóstico e telemetria de erros do cliente para `frontend/src/services/client-diagnostics.js` sem alterar o layout.
- [x] Extrair captura, fallback e seleção do microfone para `frontend/src/services/media`.
- [x] Extrair sincronização, `replaceTrack` e renegociação do áudio local para `frontend/src/services/media`.
- [ ] Dividir `App.svelte` em stores e features sem alterar o layout.
  - [ ] Extrair estado de navegação, grupos, mensagens e configurações para stores/serviços sem duplicar contratos.
  - [ ] Separar a tela de configurações por domínio e reduzir o markup restante do shell.
    - [x] Extrair navegação, cabeçalho, subnavegação interna e formulário de perfil do canal para `frontend/src/features/settings`.
    - [x] Extrair cartões de perfil, preferências, contas conectadas e administração de grupo.
    - [x] Extrair cartão de notificações.
    - [ ] Extrair cartão de voz com code-splitting para não aumentar o bundle inicial.

### Fase 2 — Contratos e tempo real

- [ ] Definir `/api/v1` e envelope de erros consistente.
- [ ] Gerar OpenAPI e cliente TypeScript interno.
- [ ] Criar Gateway de eventos separado da sinalização WebRTC.
- [x] Adicionar heartbeat nativo ao WebSocket para detectar conexões mortas.
- [ ] Adicionar reconexão, sequência e descarte seguro de eventos antigos.
- [ ] Trocar polling de chat/presença por eventos onde isso reduzir carga sem prejudicar simplicidade.

### Fase 3 — Núcleo funcional de comunidade

- [ ] Permissões por grupo, cargo e canal.
- [ ] Hierarquia de cargos e auditoria administrativa.
- [ ] Editar/excluir mensagens, reações, menções e pins.
- [ ] Anexos com armazenamento local controlado e posterior compatibilidade S3/MinIO.
- [ ] Threads, busca, não lidas e notificações em tempo real.
- [ ] Moderação básica: bloquear, expulsar, banir e silenciar.

### Fase 4 — Qualidade de mídia

- [ ] Manter P2P para chamadas pequenas e TURN como fallback.
- [ ] Criar contrato de mídia independente do restante do backend.
- [ ] Avaliar SFU (LiveKit ou mediasoup) com teste de carga real.
- [ ] Avaliar codecs, bitrate adaptativo, simulcast/SVC e TURN adequados à VPS, preservando a interface atual.
- [ ] Substituir o P2P por uma arquitetura de mídia escalável somente após benchmark de custo, latência, CPU e qualidade.
- [ ] Adicionar métricas de jitter, perda, RTT, bitrate e reconexão.
- [ ] Preservar captura de tela, janela, câmera, áudio de jogos e Electron.

### Fase 5 — Plataforma e escala sob demanda

- [ ] Webhooks de entrada.
- [ ] Tokens de aplicação e bots.
- [ ] Comandos, componentes e modais.
- [x] Decidir PostgreSQL como banco principal e preparar a migração sem cutover.
- [x] Criar migration baseline e importador offline SQLite → PostgreSQL.
- [x] Subir PostgreSQL local em Docker e aplicar/validar a migration baseline sem cutover.
- [ ] Executar migration, importar dados e ativar PostgreSQL após validação real.
- [ ] Adicionar Redis/event bus somente quando houver mais de uma instância ou necessidade de filas.

## Critérios de conclusão

Cada fase só será considerada concluída quando:

1. O comportamento existente continuar funcionando.
2. O build frontend passar sem warnings novos relevantes.
3. Os testes aplicáveis passarem.
4. O diff não carregar banco, instalador, `node_modules` ou temporários.
5. A mudança tiver commit próprio e descrição clara.
