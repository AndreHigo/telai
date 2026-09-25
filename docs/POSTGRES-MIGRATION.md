# Migração do Telai para PostgreSQL

## Decisão

O Telai vai adotar PostgreSQL como banco persistente principal antes da
implementação de threads, reações, anexos, busca avançada e API pública.

O núcleo continuará leve: um monólito Node modular, PostgreSQL, Caddy e
Coturn. Redis, RabbitMQ, Kubernetes e múltiplas réplicas ficam fora desta
etapa.

## Estado atual

- O runtime de produção ainda usa SQLite por padrão.
- O pacote `pg`, a configuração de pool e um Compose local foram adicionados.
- SSL exige validação de certificado por padrão; a exceção local deve ser explícita.
- A migration baseline e o importador SQLite → PostgreSQL já existem.
- O comando `pnpm run db:import:postgres -- --plan` inspeciona o SQLite sem conectar no PostgreSQL.
- O importador é idempotente e o relatório conta somente linhas realmente inseridas; `pnpm run db:test:postgres-import` valida uma fonte SQLite temporária em duas execuções e remove o fixture ao final.
- A migration baseline já foi executada e validada no PostgreSQL local via Docker; o cutover continua adiado e SQLite permanece sendo o driver ativo.
- A migration incremental `003_group_room_permissions.sql` adiciona overrides de acesso por cargo/canal; ela foi aplicada e validada no PostgreSQL local junto com as migrations anteriores.
- A migration incremental `004_group_audit_logs.sql` adiciona o histórico administrativo enxuto por grupo; ela foi aplicada e validada no PostgreSQL local.
- O runtime HTTP falha explicitamente se `TELAI_DATABASE_DRIVER=postgres` for configurado antes do cutover; isso evita que uma configuração PostgreSQL seja ignorada e o processo use SQLite sem aviso.
- O primeiro domínio com cutover opt-in é manutenção administrativa: `TELAI_MAINTENANCE_DATABASE_DRIVER=postgres` usa o repositório PostgreSQL somente para `/api/maintenance` e `/api/admin/maintenance`, enquanto o restante do runtime permanece no SQLite. Essa flag é uma etapa de validação, não o cutover global.
- Os repositórios já extraídos, incluindo autenticação, consentimentos, OAuth, contas, perfil local, administração, manutenção, social, descoberta/criação, configuração e exclusão de grupos, setup, cargos, salas, permissões, membros, streams, chat da transmissão, convites, solicitações de entrada, mensagens de grupo e conversas diretas, agora possuem implementações PostgreSQL assíncronas paralelas, validadas em uma transação com rollback; manutenção é a primeira exceção, ligada somente por flag opt-in.
- Não existe um banco SQLite de aplicação válido neste checkout para importar; nenhum dado de teste foi tratado como dado real.
- Nenhum ambiente de produção foi apontado para PostgreSQL.
- Nenhum banco SQLite foi apagado ou alterado por esta preparação.

## Ordem obrigatória

1. Converter o schema para migrations PostgreSQL versionadas.
2. Implementar repositórios assíncronos por domínio.
3. Converter rotas e tarefas de limpeza para `async/await`.
4. Criar importador SQLite → PostgreSQL com contagem por tabela e modo de validação.
5. Repetir API, segurança, autenticação, permissões, mensagens e mídia contra PostgreSQL.
6. Executar teste de concorrência e validar índices, transações e recuperação.
7. Fazer cutover somente com backup, janela de manutenção, health check e rollback documentado.

## Regras de compatibilidade

- Rotas não acessam o pool diretamente; passam por repositórios.
- Cada transação deve declarar explicitamente seu limite.
- `INSERT OR IGNORE`, `PRAGMA` e outras extensões SQLite não entram nos novos repositórios.
- Aliases de retorno devem preservar o contrato camelCase do frontend.
- O importador deve ser idempotente e nunca apagar o SQLite de origem.
- WebRTC, TURN e futura SFU permanecem independentes do banco.

## Ambiente local

O PostgreSQL de desenvolvimento pode ser iniciado com:

```powershell
docker compose --env-file deploy/.env.postgres -f deploy/docker-compose.postgres.yml up -d
```

O arquivo `.env.postgres` é local e não deve ser commitado.

Para validar a cobertura do schema sem Docker:

```powershell
pnpm run db:test:postgres-migration
```

Para validar os contratos dos repositórios contra o PostgreSQL local:

```powershell
pnpm run db:test:postgres-repositories
```

Para validar a importação idempotente com um fixture descartável:

```powershell
pnpm run db:test:postgres-import
```
