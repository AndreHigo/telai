# Armazenamento de anexos

O Telai mantém o armazenamento local como padrão para continuar leve na VPS. A camada em `server/media/attachment-storage.mjs` expõe somente `write`, `read` e `remove`, permitindo trocar o backend sem alterar as rotas, o banco ou o frontend.

## Modos

- `TELAI_ATTACHMENT_STORAGE=local` (padrão): arquivos fora do banco, em `data/attachments` ou no caminho de `TELAI_ATTACHMENT_DIR`.
- `TELAI_ATTACHMENT_STORAGE=s3`: storage S3/MinIO compatível via `TELAI_S3_ENDPOINT`, `TELAI_S3_BUCKET`, `TELAI_S3_ACCESS_KEY_ID` e `TELAI_S3_SECRET_ACCESS_KEY`.

O adapter S3 usa assinatura AWS SigV4, não adiciona o SDK ao bundle do servidor e mantém `forcePathStyle=true` por padrão para MinIO. As rotas do Telai continuam protegidas por sessão e associação ao grupo; o bucket não deve ser público.

## Política operacional atual

- Limites e tipos permitidos continuam sendo validados antes do storage: até 4 arquivos por mensagem, 8 MiB por arquivo e 20 MiB por mensagem.
- A varredura antivírus é um adapter opcional antes do storage. Configure `TELAI_ATTACHMENT_SCAN_COMMAND=clamdscan` quando a VPS tiver o executável disponível; sem essa variável o modo continua desativado para preservar o footprint leve.
- `TELAI_ATTACHMENT_SCAN_TIMEOUT_MS` limita cada varredura (padrão: 15 segundos). Falha ou detecção bloqueia o envio; o arquivo temporário é removido sempre.
- A remoção de mensagem ou grupo remove os objetos correspondentes quando o backend responde; não há expiração automática silenciosa.
- O download continua privado e sem URL pública/presigned. O cache HTTP é privado e limitado à sessão do usuário.
- A validação atual é de tamanho, MIME e base64. Antivírus/ClamAV ainda é uma etapa explícita antes de ativar S3 em produção; o adapter não finge oferecer varredura.
- A política de custo recomendada para S3/MinIO é lifecycle de objetos órfãos e versões antigas administrada pelo operador, sem alterar o comportamento padrão local.
