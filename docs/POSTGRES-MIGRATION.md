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
