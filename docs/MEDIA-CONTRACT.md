# Contrato de mídia do Telai

O contrato de mídia fica em `shared/media-contract.mjs`, sem dependência de Node, Electron ou Svelte. Ele pode ser consumido pelo backend e pelo cliente web/desktop sem copiar listas de valores entre camadas.

## Modos

- `p2p`: sinalização WebRTC direta entre transmissor e espectador; é o modo padrão atual.
- `relay`: transporte relay existente para transmissão; continua sendo uma alternativa controlada por `MEDIA_MODE`.

`normalizeMediaMode` mantém qualquer valor desconhecido em `p2p`. A escolha de migrar para SFU não faz parte deste contrato: exige benchmark de CPU, custo, latência e qualidade antes de substituir o P2P.

## Perfis de transmissão

| Perfil | Resolução alvo | FPS máximo | Bitrate máximo |
| --- | ---: | ---: | ---: |
| `economy` | 960×540 | 30 | 1,2 Mbps |
| `balanced` | 1280×720 | 30 | 2,5 Mbps |
| `high` | 1920×1080 | 60 | 6 Mbps |

`normalizeBroadcastQuality` mantém valores inválidos em `balanced`. O transmissor continua sendo a autoridade do perfil enviado aos espectadores; o contrato não altera a identidade visual nem permite ao espectador ultrapassar o limite do host.

ICE/STUN/TURN, sinalização e métricas RTC continuam em seus módulos próprios. O contrato compartilhado padroniza apenas os valores que precisam ser iguais entre backend e cliente.
