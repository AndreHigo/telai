# Contrato de erros HTTP

As rotas HTTP mantêm a mensagem legada em `error` para não quebrar o frontend
ou clientes existentes. Toda resposta de erro JSON também recebe um `code`
estável derivado do status HTTP, salvo quando a rota já fornece um código de
domínio próprio.

Exemplo:

```json
{
  "error": "Você não participa deste grupo.",
  "code": "forbidden"
}
```

Códigos padronizados: `bad_request`, `unauthorized`, `forbidden`, `not_found`,
`method_not_allowed`, `conflict`, `payload_too_large`, `unprocessable_entity`,
`too_many_requests`, `internal_error`, `bad_gateway`,
`service_unavailable` e `http_error` para status não mapeado.

Metadados existentes, como `retryAfter` e códigos específicos de SMTP, são
preservados. O namespace versionado inicial `/api/v1` reutiliza esse mesmo
envelope e mantém os códigos iguais aos da rota legada correspondente.
