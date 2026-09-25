import { randomUUID } from "node:crypto";
import {
  applicationPayload,
  normalizeApplicationInstallationPermissions,
  normalizeCommandName,
  normalizeCommandOptions,
  normalizeText,
} from "../domain/applications/normalization.mjs";

export function createApplicationOwnerRoutes({
  json,
  readJson,
  requireUser,
  applicationRepository,
  groupSettingsRepository,
  hashToken,
  createToken,
  createPasswordHash,
}) {
  async function ownedApplication(request, response, applicationId) {
    const user = await requireUser(request, response);
    if (!user) return null;
    const application = await applicationRepository.findOwned(user.id, applicationId);
    if (!application) {
      json(response, 404, { error: "Aplicação não encontrada." });
      return null;
    }
    return { user, application };
  }

  async function handleApplicationCollection(request, response, requestUrl) {
    if (requestUrl.pathname !== "/api/applications" || !["GET", "POST"].includes(request.method)) return false;
    const user = await requireUser(request, response);
    if (!user) return true;
    if (request.method === "GET") {
      json(response, 200, { applications: (await applicationRepository.listOwned(user.id)).map(applicationPayload) });
      return true;
    }
    try {
      const body = await readJson(request, 16 * 1024);
      const name = normalizeText(body.name, 64);
      const description = normalizeText(body.description, 280);
      if (name.length < 2) {
        json(response, 400, { error: "Informe um nome de aplicação com pelo menos 2 caracteres." });
        return true;
      }
      const id = randomUUID();
      const botUserId = randomUUID();
      const botUsername = `bot-${id.replaceAll("-", "").slice(0, 16)}`;
      const botDisplayName = `${name} Bot`.slice(0, 48);
      const application = await applicationRepository.createApplication({
        id,
        ownerId: user.id,
        botUserId,
        botUsername,
        botDisplayName,
        botPasswordHash: createPasswordHash(),
        name,
        description,
      });
      json(response, 201, { application: applicationPayload(application) });
    } catch {
      json(response, 400, { error: "Não foi possível criar a aplicação." });
    }
    return true;
  }

  async function handleApplicationResource(request, response, requestUrl) {
    const match = requestUrl.pathname.match(/^\/api\/applications\/([A-Za-z0-9-]{16,64})(?:\/([^/]+)(?:\/([^/]+))?)?$/);
    if (!match || !["GET", "POST", "PATCH", "DELETE"].includes(request.method)) return false;
    const [, applicationId, segment, childId] = match;
    const context = await ownedApplication(request, response, applicationId);
    if (!context) return true;

    if (!segment && request.method === "GET") {
      json(response, 200, { application: applicationPayload(context.application) });
      return true;
    }
    if (!segment && request.method === "DELETE") {
      await applicationRepository.deleteApplication(context.user.id, applicationId);
      json(response, 200, { ok: true, applicationId });
      return true;
    }

    if (segment === "tokens") {
      if (request.method === "GET" && !childId) {
        json(response, 200, { tokens: await applicationRepository.listTokens(applicationId) });
        return true;
      }
      if (request.method === "POST" && !childId) {
        try {
          const body = await readJson(request, 8 * 1024);
          const label = normalizeText(body.label || "Token principal", 64) || "Token principal";
          const token = createToken();
          const created = await applicationRepository.createToken({ applicationId, label, tokenHash: hashToken(token) });
          json(response, 201, { token, tokenInfo: created });
        } catch {
          json(response, 400, { error: "Não foi possível criar o token." });
        }
        return true;
      }
      if (request.method === "DELETE" && childId) {
        if (!await applicationRepository.revokeToken(applicationId, childId)) {
          json(response, 404, { error: "Token não encontrado ou já revogado." });
          return true;
        }
        json(response, 200, { ok: true, tokenId: childId });
        return true;
      }
    }

    if (segment === "commands") {
      if (request.method === "GET" && !childId) {
        json(response, 200, { commands: await applicationRepository.listCommands(applicationId) });
        return true;
      }
      if (request.method === "POST" && !childId) {
        try {
          const body = await readJson(request, 32 * 1024);
          const name = normalizeCommandName(body.name);
          const description = normalizeText(body.description, 100);
          const options = normalizeCommandOptions(body.options);
          if (!name || !description || (options !== undefined && !options)) {
            json(response, 400, { error: "Comando, descrição e opções precisam seguir o contrato da aplicação." });
            return true;
          }
          const command = await applicationRepository.createCommand({ applicationId, name, description, options });
          json(response, 201, { command });
        } catch {
          json(response, 409, { error: "Não foi possível criar o comando; o nome pode já estar em uso." });
        }
        return true;
      }
      if (request.method === "PATCH" && childId) {
        try {
          const body = await readJson(request, 32 * 1024);
          const name = body.name === undefined ? undefined : normalizeCommandName(body.name);
          const description = body.description === undefined ? undefined : normalizeText(body.description, 100);
          const options = normalizeCommandOptions(body.options);
          if ((body.name !== undefined && !name) || (body.description !== undefined && !description) || (options !== undefined && !options)) {
            json(response, 400, { error: "Comando, descrição e opções precisam seguir o contrato da aplicação." });
            return true;
          }
          const command = await applicationRepository.updateCommand({ applicationId, commandId: childId, name, description, options });
          if (!command) {
            json(response, 404, { error: "Comando não encontrado." });
            return true;
          }
          json(response, 200, { command });
        } catch {
          json(response, 409, { error: "Não foi possível atualizar o comando; o nome pode já estar em uso." });
        }
        return true;
      }
      if (request.method === "DELETE" && childId) {
        if (!await applicationRepository.deleteCommand(applicationId, childId)) {
          json(response, 404, { error: "Comando não encontrado." });
          return true;
        }
        json(response, 200, { ok: true, commandId: childId });
        return true;
      }
    }

    if (segment === "groups") {
      if (request.method === "GET" && !childId) {
        json(response, 200, { installations: await applicationRepository.listInstallations(applicationId) });
        return true;
      }
      if (childId && ["POST", "PATCH", "DELETE"].includes(request.method)) {
        const group = await groupSettingsRepository.findGroup(childId);
        if (!group) {
          json(response, 404, { error: "Grupo não encontrado." });
          return true;
        }
        if (group.ownerId !== context.user.id) {
          json(response, 403, { error: "Somente o dono do grupo pode instalar aplicações." });
          return true;
        }
        if (request.method === "POST") {
          const installation = await applicationRepository.installGroup({ applicationId, groupId: childId, installedBy: context.user.id });
          json(response, 201, { installation });
        } else if (request.method === "PATCH") {
          try {
            const body = await readJson(request, 8 * 1024);
            const permissions = normalizeApplicationInstallationPermissions(body.permissions);
            if (!permissions) {
              json(response, 400, { error: "As permissões da instalação precisam ser booleanas." });
              return true;
            }
            const installation = await applicationRepository.updateInstallation({ applicationId, groupId: childId, permissions });
            if (!installation) {
              json(response, 404, { error: "Instalação não encontrada." });
              return true;
            }
            json(response, 200, { installation });
          } catch {
            json(response, 400, { error: "Não foi possível atualizar as permissões da instalação." });
          }
        } else {
          json(response, 200, { ok: await applicationRepository.uninstallGroup(applicationId, childId), groupId: childId });
        }
        return true;
      }
    }

    json(response, 405, { error: "Método ou subrota de aplicação não permitido." });
    return true;
  }

  return async function handleApplicationOwnerRoutes(request, response, requestUrl) {
    if (await handleApplicationCollection(request, response, requestUrl)) return true;
    return handleApplicationResource(request, response, requestUrl);
  };
}
