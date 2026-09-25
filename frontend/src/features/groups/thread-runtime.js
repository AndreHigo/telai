export function createGroupThreadRuntime({ loadController }) {
  let controllerPromise = null;

  function getController() {
    if (!controllerPromise) controllerPromise = loadController();
    return controllerPromise;
  }

  async function openGroupThread(...args) {
    return (await getController()).openGroupThread(...args);
  }

  async function sendGroupThreadMessage(...args) {
    return (await getController()).sendGroupThreadMessage(...args);
  }

  return { getController, openGroupThread, sendGroupThreadMessage };
}
