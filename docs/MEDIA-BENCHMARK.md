# Benchmark de mídia do Telai

Este documento separa a validação funcional atual do benchmark de capacidade. O resultado abaixo é local, executado nesta branch, e não representa a VPS nem produção.

## Baseline funcional atual

O transporte padrão continua P2P (`MEDIA_MODE=p2p`) com TURN disponível como fallback. A validação Electron executada em 26/09/2026 cobriu:

- captura real de câmera, tela, janela e caminho legado de captura;
- tela em até 1280×720 a 30 FPS no fluxo testado;
- publicação de áudio do microfone junto com vídeo;
- troca de fonte durante a transmissão sem encerrar a live;
- remoção e reativação de câmera e microfone;
- recepção de vídeo no espectador, dois viewers simultâneos e multistream;
- chat do transmissor e do espectador;
- encerramento limpo da transmissão;
- reconexão automática da sala de voz após queda controlada do WebSocket.

Comandos reproduzíveis:

```text
npm run test:media
npm run test:voice-reconnect
```

`npm run test:media` também coleta duas amostras RTC do espectador no fluxo de
transmissão pública. A coleta é ativada somente pelo parâmetro interno
`qaStats=1` usado pelo harness e não cria telemetria adicional para usuários
normais.

O harness aceita `TELAI_MEDIA_VIEWER_COUNT` entre 1 e 20. O padrão continua
sendo 2 viewers para manter a regressão rápida. Em PowerShell, por exemplo:

```powershell
$env:TELAI_MEDIA_VIEWER_COUNT = "5"
npm run test:media
Remove-Item Env:TELAI_MEDIA_VIEWER_COUNT
```

O resultado inclui tempo de carregamento, CPU e RSS do processo Electron que
executou o teste durante a abertura dos viewers. É uma comparação local do
harness, não uma medição isolada do servidor.

Na última execução local com 5 viewers, o segundo sample do viewer sintético
registrou RTT de 1 ms, jitter de 0 ms, perda de 0 pacotes, 2 streams de mídia
e aproximadamente 106,35 kbps recebidos. O carregamento dos 5 viewers levou
782 ms, com aproximadamente 60% de CPU e 145 MB de RSS no processo Electron do
harness. Isso confirma que a medição funciona; não é uma meta de produção nem
uma medição da VPS.

## O que ainda não está medido

A suíte atual confirma fluxo e regressão e agora coleta métricas de múltiplos
viewers sintéticos, mas ainda não é um teste de capacidade da VPS. Antes de
trocar P2P por SFU, o benchmark deve registrar, por cenário:

- CPU e memória do servidor e do Electron;
- RTT, jitter, perda de pacotes e bitrate por peer;
- tempo até o primeiro frame e tempo de recuperação após queda;
- custo do transmissor com 1, 5, 10 e 20 viewers;
- comportamento com TURN forçado;
- qualidade em 720p30 e 1080p60, quando o hardware suportar;
- voz com 2, 5 e 10 participantes.

## Critério para a próxima decisão

Manter P2P enquanto a VPS suportar os cenários-alvo sem crescimento linear de CPU, instabilidade ou degradação perceptível. Avaliar LiveKit ou mediasoup somente com uma execução controlada desses cenários. A interface do Telai não deve depender da tecnologia escolhida.

Redis/event bus e uma SFU continuam fora do runtime padrão até existir uma necessidade comprovada de escala ou fila distribuída.
