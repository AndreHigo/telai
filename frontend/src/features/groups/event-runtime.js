export function createGroupEventRuntime({
  createGateway,
  loadHandler,
  onNotification = () => {},
  onHandlerError = () => {},
  onGatewayError = () => {},
}) {
  let gateway = null;
  let handlerPromise = null;

  function getHandler() {
    if (!handlerPromise) handlerPromise = loadHandler();
    return handlerPromise;
  }

  function handleMessage(message) {
    if (message?.type === "notification-created") {
      onNotification(message.notification);
      return;
    }
    void getHandler()
      .then((handler) => handler(message))
      .catch(onHandlerError);
  }

  function ensure() {
    if (!gateway) {
      gateway = createGateway({
        onMessage: handleMessage,
        onError: onGatewayError,
      });
    }
    return gateway;
  }

  function close() {
    gateway?.close();
    gateway = null;
  }

  return { ensure, close, handleMessage };
}
