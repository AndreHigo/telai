const RELEASE_NOTES_CONTENT = {
  title: "Notas da atualização",
  summary: "Uma rodada de melhorias para deixar o Telai mais claro, compacto e confiável durante transmissões e chamadas.",
  sections: [
    {
      title: "Transmissões públicas",
      items: [
        "Novo fluxo antes de iniciar a live: título, fonte, áudio, câmera, microfone e qualidade ficam definidos antes da publicação.",
        "A câmera pode ser incluída ou removida, trocada e posicionada sem interromper a transmissão.",
        "Melhorias na captura de tela, áudio do aplicativo escolhido e recuperação quando a captura é perdida.",
      ],
    },
    {
      title: "Áudio e chamadas",
      items: [
        "O perfil Isolamento de Voz usa os filtros nativos do WebRTC no app desktop e na web. Estúdio mantém o áudio cru.",
        "O teste de microfone voltou a exibir o indicador de nível e os controles de áudio ficaram mais consistentes.",
        "Os ícones do player agora refletem corretamente quando o áudio está mutado ou ativo.",
      ],
    },
    {
      title: "Interface e estabilidade",
      items: [
        "Cabeçalho, menu lateral e cartões de grupos receberam ajustes de espaçamento e responsividade.",
        "O painel de reconexão e o encerramento de transmissões ficaram mais previsíveis quando uma captura cai.",
      ],
    },
  ],
};

const RELEASE_NOTES = {
  desktop: { "0.2.68": { platformLabel: "app desktop", ...RELEASE_NOTES_CONTENT } },
  web: { "2026-09-22": { platformLabel: "versão web", ...RELEASE_NOTES_CONTENT } },
};

export function createReleaseNotesController({ getState, setState, setNotice, webVersion }) {
  function currentReleaseNotes() {
    const state = getState();
    const platform = state.isDesktop ? "desktop" : "web";
    const version = state.isDesktop ? state.desktopVersion : webVersion;
    const notes = RELEASE_NOTES[platform]?.[version];
    return notes ? { platform, version, ...notes } : null;
  }

  function releaseNotesStorageKey(account = getState().user) {
    const state = getState();
    const accountKey = account?.id || account?.username;
    const platform = state.isDesktop ? "desktop" : "web";
    return accountKey ? `mirante-release-notes-seen:${platform}:${accountKey}` : "";
  }

  function openReleaseNotes() {
    const notes = currentReleaseNotes();
    if (!notes) {
      setNotice("Ainda não há notas cadastradas para esta versão.");
      return;
    }
    setState({ releaseNotes: notes, showReleaseNotes: true, showUserMenu: false });
  }

  function maybeShowReleaseNotes(account) {
    const notes = currentReleaseNotes();
    const storageKey = releaseNotesStorageKey(account);
    if (!notes || !storageKey) return;
    try {
      if (localStorage.getItem(storageKey) !== notes.version) {
        setState({ releaseNotes: notes, showReleaseNotes: true });
      }
    } catch {}
  }

  function dismissReleaseNotes() {
    const state = getState();
    const storageKey = releaseNotesStorageKey();
    if (storageKey && state.releaseNotes?.version) {
      try { localStorage.setItem(storageKey, state.releaseNotes.version); } catch {}
    }
    setState({ showReleaseNotes: false });
  }

  return { dismissReleaseNotes, maybeShowReleaseNotes, openReleaseNotes };
}
