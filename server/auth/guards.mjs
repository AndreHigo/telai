const DEFAULT_UNAUTHORIZED_MESSAGE = "Entre com sua conta para continuar.";

export function createRequireUser({ currentUser, json, unauthorizedMessage = DEFAULT_UNAUTHORIZED_MESSAGE } = {}) {
  if (typeof currentUser !== "function") throw new TypeError("currentUser is required");
  if (typeof json !== "function") throw new TypeError("json is required");

  return async function requireUser(request, response) {
    const user = await currentUser(request);
    if (!user) json(response, 401, { error: unauthorizedMessage });
    return user;
  };
}

