export function createAvatarController({
  getState,
  setState,
} = {}) {
  const state = () => getState?.() || {};

  function readImage(event, { dataKey, errorKey, invalidMessage, sizeMessage, readError }) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setState?.({ [errorKey]: "" });
    if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type)) {
      setState?.({ [errorKey]: invalidMessage });
      event.currentTarget.value = "";
      return;
    }
    if (file.size > state().maxAvatarFileBytes) {
      setState?.({ [errorKey]: sizeMessage });
      event.currentTarget.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setState?.({ [dataKey]: String(reader.result || "") });
    reader.onerror = () => setState?.({ [errorKey]: readError });
    reader.readAsDataURL(file);
  }

  function clearInput(input) {
    if (input) input.value = "";
  }

  function handleAvatarChange(event) {
    readImage(event, {
      dataKey: "settingsAvatarData",
      errorKey: "avatarError",
      invalidMessage: "Escolha uma imagem PNG, JPG, WEBP ou GIF.",
      sizeMessage: "A foto precisa ter no máximo 5 MB.",
      readError: "Não foi possível ler essa foto.",
    });
  }

  function clearAvatar() {
    setState?.({ settingsAvatarData: "", avatarError: "" });
    clearInput(state().avatarFileInput);
  }

  function handleChannelAvatarChange(event) {
    readImage(event, {
      dataKey: "channelAvatarData",
      errorKey: "channelError",
      invalidMessage: "Escolha uma imagem PNG, JPG, WEBP ou GIF para o canal.",
      sizeMessage: "A foto do canal precisa ter no máximo 5 MB.",
      readError: "Não foi possível ler essa foto do canal.",
    });
  }

  function clearChannelAvatar() {
    setState?.({ channelAvatarData: "", channelError: "" });
    clearInput(state().channelAvatarFileInput);
  }

  function toggleChannelGame(game) {
    const games = state().channelGames || [];
    setState?.({ channelGames: games.includes(game) ? games.filter((item) => item !== game) : [...games, game].slice(0, 8) });
  }

  return {
    handleAvatarChange,
    clearAvatar,
    handleChannelAvatarChange,
    clearChannelAvatar,
    toggleChannelGame,
  };
}
