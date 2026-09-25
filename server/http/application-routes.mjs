import { createApplicationBotRoutes } from "./application-bot-routes.mjs";
import { createApplicationOwnerRoutes } from "./application-owner-routes.mjs";

/**
 * Composes the two application HTTP surfaces without changing their public
 * routes: owner management stays separate from bot and interaction traffic.
 */
export function createApplicationRoutes(dependencies) {
  const botRoutes = createApplicationBotRoutes(dependencies);
  const ownerRoutes = createApplicationOwnerRoutes(dependencies);

  return async function handleApplicationRoutes(request, response, requestUrl) {
    if (await botRoutes(request, response, requestUrl)) return true;
    return ownerRoutes(request, response, requestUrl);
  };
}
