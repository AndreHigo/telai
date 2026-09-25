# Roadmap de refatoração do Telai

## Objetivo

Evoluir o Telai para uma plataforma própria de comunidades, voz, vídeo e transmissão com qualidade de produto maduro, sem copiar a identidade visual do Discord e sem transformar o sistema em uma pilha pesada de microserviços.

O objetivo é preservar a experiência e os diferenciais atuais do Telai enquanto separamos responsabilidades, fortalecemos os contratos internos e abrimos espaço para novas funcionalidades.

## Regras da refatoração

- Trabalhar somente na branch `codex/refactor-telai` deste checkout.
- Preservar o comportamento existente antes de adicionar novos recursos.
- Manter o núcleo como um monólito modular inicialmente.
- Não introduzir Redis, RabbitMQ, Kubernetes ou PostgreSQL sem uma necessidade comprovada.
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
- [x] Extrair o repositório de acesso e permissões de grupos.
- [x] Extrair o repositório de conversas diretas.
- [x] Extrair o acesso persistente às sessões de autenticação.
- [x] Preparar pool, Compose local e plano de migração para PostgreSQL.
- [ ] Separar consultas/repositórios restantes de domínio das rotas HTTP.
- [ ] Separar autenticação, grupos, mensagens, notificações e mídia por domínio.
- [x] Extrair o cliente HTTP para `frontend/src/services` sem alterar o layout.
- [ ] Dividir `App.svelte` em stores e features sem alterar o layout.

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
- [ ] Adicionar métricas de jitter, perda, RTT, bitrate e reconexão.
- [ ] Preservar captura de tela, janela, câmera, áudio de jogos e Electron.

### Fase 5 — Plataforma e escala sob demanda

- [ ] Webhooks de entrada.
- [ ] Tokens de aplicação e bots.
- [ ] Comandos, componentes e modais.
- [x] Decidir PostgreSQL como banco principal e preparar a migração sem cutover.
- [ ] Migrar schema, repositórios e dados de SQLite para PostgreSQL.
- [ ] Adicionar Redis/event bus somente quando houver mais de uma instância ou necessidade de filas.

## Critérios de conclusão

Cada fase só será considerada concluída quando:

1. O comportamento existente continuar funcionando.
2. O build frontend passar sem warnings novos relevantes.
3. Os testes aplicáveis passarem.
4. O diff não carregar banco, instalador, `node_modules` ou temporários.
5. A mudança tiver commit próprio e descrição clara.
