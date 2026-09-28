const sessionSecurity = [{ sessionCookie: [] }];

function operation(operationId, summary, { tag = "API", auth = true, methods = ["200"] } = {}) {
  const responses = Object.fromEntries(methods.map((status) => [status, { description: status === "200" ? "Sucesso" : `Resposta HTTP ${status}` }]));
  for (const status of ["400", "401", "403", "404", "409", "429"]) {
    if (!responses[status]) responses[status] = { $ref: "#/components/responses/HttpError" };
  }
  return {
    operationId,
    summary,
    tags: [tag],
    ...(auth ? { security: sessionSecurity } : {}),
    responses,
  };
}

function pathItem(tag, entries) {
  return Object.fromEntries(Object.entries(entries).map(([method, [operationId, summary, options = {}]]) => [
    method,
    operation(operationId, summary, { tag, ...options }),
  ]));
}

function withPathParameters(pathMap) {
  return Object.fromEntries(Object.entries(pathMap).map(([path, item]) => {
    const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    if (!parameters.length) return [path, item];
    return [path, Object.fromEntries(Object.entries(item).map(([method, operationDefinition]) => [
      method,
      { ...operationDefinition, parameters },
    ]))];
  }));
}

const paths = {
  "/auth/providers": pathItem("Autenticação", { get: ["listAuthProviders", "Lista provedores de autenticação", { auth: false }] }),
  "/auth/session": pathItem("Autenticação", { get: ["getSession", "Retorna a sessão atual", { auth: false }] }),
  "/auth/register": pathItem("Autenticação", { post: ["register", "Cria uma conta local", { auth: false, methods: ["201"] }] }),
  "/auth/login": pathItem("Autenticação", { post: ["login", "Inicia uma sessão local", { auth: false }] }),
  "/auth/logout": pathItem("Autenticação", { post: ["logout", "Encerra a sessão atual"] }),
  "/auth/consent": pathItem("Autenticação", { post: ["recordConsent", "Registra consentimentos legais"] }),
  "/auth/profile": pathItem("Conta", { patch: ["updateProfile", "Atualiza o perfil da conta"] }),
  "/auth/channel": pathItem("Conta", {
    get: ["getChannelProfile", "Retorna o perfil do canal"],
    patch: ["updateChannelProfile", "Atualiza o perfil do canal"],
  }),
  "/auth/preferences": pathItem("Conta", {
    get: ["getPreferences", "Retorna preferências do usuário"],
    patch: ["updatePreferences", "Atualiza preferências do usuário"],
  }),
  "/auth/voice-preferences": pathItem("Conta", {
    get: ["listVoicePreferences", "Lista preferências de voz por participante"],
    patch: ["saveVoicePreference", "Salva uma preferência de voz"],
    delete: ["deleteVoicePreferences", "Remove preferências de voz"],
  }),
  "/auth/{provider}": pathItem("OAuth", { get: ["startOAuth", "Inicia autenticação OAuth", { auth: false }] }),
  "/auth/{provider}/callback": pathItem("OAuth", { get: ["completeOAuth", "Conclui autenticação OAuth", { auth: false }] }),
  "/account/export": pathItem("Conta", { get: ["exportAccountData", "Exporta os dados da conta"] }),
  "/account/delete": pathItem("Conta", { post: ["deleteAccount", "Exclui a conta e seus dados"] }),
  "/applications": pathItem("Aplicações", {
    get: ["listApplications", "Lista as aplicações do usuário"],
    post: ["createApplication", "Cria uma aplicação com identidade de bot", { methods: ["201"] }],
  }),
  "/applications/{applicationId}": pathItem("Aplicações", {
    get: ["getApplication", "Retorna uma aplicação"],
    patch: ["updateApplication", "Atualiza nome e descrição da aplicação"],
    delete: ["deleteApplication", "Exclui uma aplicação"],
  }),
  "/applications/{applicationId}/tokens": pathItem("Aplicações", {
    get: ["listApplicationTokens", "Lista metadados dos tokens de uma aplicação"],
    post: ["createApplicationToken", "Cria um token de bot exibido uma única vez", { methods: ["201"] }],
  }),
  "/applications/{applicationId}/tokens/{tokenId}": pathItem("Aplicações", {
    delete: ["revokeApplicationToken", "Revoga um token de bot"],
  }),
  "/applications/{applicationId}/commands": pathItem("Aplicações", {
    get: ["listApplicationCommands", "Lista os comandos de uma aplicação"],
    post: ["createApplicationCommand", "Registra um comando de aplicação", { methods: ["201"] }],
  }),
  "/applications/{applicationId}/commands/{commandId}": pathItem("Aplicações", {
    patch: ["updateApplicationCommand", "Atualiza um comando de aplicação"],
    delete: ["deleteApplicationCommand", "Remove um comando de aplicação"],
  }),
  "/applications/{applicationId}/groups": pathItem("Aplicações", {
    get: ["listApplicationInstallations", "Lista grupos onde o bot foi instalado"],
  }),
  "/applications/{applicationId}/groups/{groupId}": pathItem("Aplicações", {
    post: ["installApplicationBot", "Instala o bot em um grupo", { methods: ["201"] }],
    patch: ["updateApplicationInstallationPermissions", "Atualiza permissões do bot neste grupo"],
    delete: ["uninstallApplicationBot", "Remove o bot de um grupo"],
  }),
  "/groups/{groupId}/applications/{applicationId}/interactions": pathItem("Aplicações", {
    post: ["createApplicationInteraction", "Cria uma interação de comando para o bot", { methods: ["202"] }],
  }),
  "/groups/{groupId}/applications/commands": pathItem("Aplicações", {
    get: ["listGroupApplicationCommands", "Lista comandos de aplicações instaladas no grupo"],
  }),
  "/interactions/{interactionId}/components": pathItem("Aplicações", {
    post: ["createComponentInteraction", "Envia uma interação de componente", { methods: ["202"] }],
  }),
  "/interactions/{interactionId}/modal": pathItem("Aplicações", {
    post: ["submitModalInteraction", "Envia o resultado de um modal", { methods: ["202"] }],
  }),
  "/bot/groups/{groupId}/messages": pathItem("Aplicações", {
    post: ["createBotMessage", "Publica mensagem autenticada por token de bot", { auth: false, methods: ["201"] }],
  }),
  "/bot/applications/commands": pathItem("Aplicações", {
    get: ["getBotCommandManifest", "Retorna o manifesto de comandos do bot", { auth: false }],
  }),
  "/bot/interactions": pathItem("Aplicações", {
    get: ["pollBotInteractions", "Obtém interações pendentes do bot", { auth: false }],
  }),
  "/bot/events": pathItem("Aplicações", {
    get: ["pollBotEvents", "Obtém eventos assinados pendentes do bot", { auth: false }],
  }),
  "/bot/interactions/{interactionId}/respond": pathItem("Aplicações", {
    post: ["respondBotInteraction", "Responde a uma interação de bot", { auth: false }],
  }),
  "/users/search": pathItem("Social", { get: ["searchUsers", "Busca usuários"] }),
  "/social": pathItem("Social", { get: ["getSocialGraph", "Retorna amizades, solicitações e follows"] }),
  "/users/{userId}/block": pathItem("Social", {
    post: ["blockUser", "Bloqueia um usuário"],
    delete: ["unblockUser", "Desbloqueia um usuário"],
  }),
  "/friends/{userId}": pathItem("Social", {
    post: ["sendFriendRequest", "Envia uma solicitação de amizade", { methods: ["201"] }],
    delete: ["removeFriend", "Remove uma amizade"],
  }),
  "/friends/requests/{requestId}": pathItem("Social", { delete: ["cancelFriendRequest", "Cancela uma solicitação de amizade"] }),
  "/friends/requests/{requestId}/{action}": pathItem("Social", { post: ["decideFriendRequest", "Aceita ou recusa uma solicitação"] }),
  "/users/{userId}/follow": pathItem("Social", {
    post: ["followUser", "Segue um canal"],
    delete: ["unfollowUser", "Deixa de seguir um canal"],
  }),
  "/groups": pathItem("Grupos", {
    get: ["listGroups", "Lista grupos do usuário"],
    post: ["createGroup", "Cria um grupo", { methods: ["201"] }],
  }),
  "/groups/search": pathItem("Grupos", { get: ["searchGroups", "Busca grupos"] }),
  "/groups/{groupId}": pathItem("Grupos", { patch: ["updateGroup", "Atualiza configurações do grupo"] }),
  "/groups/{groupId}/membership": pathItem("Grupos", { delete: ["leaveGroup", "Sai de um grupo"] }),
  "/groups/{groupId}/overview": pathItem("Grupos", { get: ["getGroupOverview", "Retorna visão completa do grupo"] }),
  "/groups/{groupId}/presence": pathItem("Grupos", {
    get: ["getGroupPresence", "Retorna presença do grupo"],
    post: ["updateGroupPresence", "Atualiza presença em uma sala"],
  }),
  "/groups/{groupId}/join-requests": pathItem("Grupos", {
    get: ["listJoinRequests", "Lista solicitações de entrada"],
    post: ["createJoinRequest", "Solicita entrada em um grupo", { methods: ["201"] }],
  }),
  "/groups/{groupId}/join-requests/{requestId}": pathItem("Grupos", { patch: ["decideJoinRequest", "Decide uma solicitação de entrada"] }),
  "/groups/{groupId}/admin": pathItem("Grupos", { get: ["getGroupAdmin", "Retorna dados administrativos do grupo"] }),
  "/groups/{groupId}/rooms": pathItem("Salas", { post: ["createRoom", "Cria uma sala", { methods: ["201"] }] }),
  "/groups/{groupId}/rooms/{roomId}": pathItem("Salas", {
    patch: ["updateRoom", "Atualiza uma sala"],
    delete: ["deleteRoom", "Exclui uma sala"],
  }),
  "/groups/{groupId}/rooms/{roomId}/read": pathItem("Mensagens", { post: ["markGroupRoomRead", "Marca o canal como lido"] }),
  "/groups/{groupId}/rooms/{roomId}/permissions": pathItem("Permissões", {
    get: ["listRoomPermissions", "Lista overrides de permissão do canal"],
    patch: ["updateRoomPermission", "Atualiza override de permissão do canal"],
    delete: ["resetRoomPermission", "Remove override de permissão do canal"],
  }),
  "/groups/{groupId}/audit-log": pathItem("Auditoria", { get: ["listGroupAuditLog", "Lista a auditoria administrativa do grupo"] }),
  "/groups/{groupId}/moderation": pathItem("Moderação", { post: ["moderateGroupMember", "Expulsa, bane ou silencia um membro"] }),
  "/groups/{groupId}/roles": pathItem("Permissões", { post: ["createRole", "Cria um cargo", { methods: ["201"] }] }),
  "/groups/{groupId}/roles/order": pathItem("Permissões", { patch: ["reorderRoles", "Ordena cargos"] }),
  "/groups/{groupId}/roles/{roleId}": pathItem("Permissões", {
    patch: ["updateRole", "Atualiza um cargo"],
    delete: ["deleteRole", "Exclui um cargo"],
  }),
  "/groups/{groupId}/members/{memberId}/role": pathItem("Permissões", { patch: ["assignMemberRole", "Atribui um cargo a um membro"] }),
  "/groups/{groupId}/permissions": pathItem("Permissões", { patch: ["updateMemberPermissions", "Atualiza permissões individuais"] }),
  "/groups/{groupId}/messages": pathItem("Mensagens", { post: ["createGroupMessage", "Envia mensagem no grupo, opcionalmente com anexos", { methods: ["201"] }] }),
  "/groups/{groupId}/messages/search": pathItem("Mensagens", { get: ["searchGroupMessages", "Busca mensagens do grupo"] }),
  "/groups/{groupId}/messages/{messageId}/thread": pathItem("Mensagens", { get: ["getGroupMessageThread", "Lista as respostas de uma mensagem"] }),
  "/groups/{groupId}/messages/{messageId}": pathItem("Mensagens", {
    patch: ["editGroupMessage", "Edita uma mensagem do grupo"],
    delete: ["deleteGroupMessage", "Exclui uma mensagem do grupo"],
  }),
  "/groups/{groupId}/webhooks": pathItem("Webhooks", {
    get: ["listGroupWebhooks", "Lista webhooks do grupo"],
    post: ["createGroupWebhook", "Cria um webhook de entrada", { methods: ["201"] }],
  }),
  "/groups/{groupId}/webhooks/{webhookId}": pathItem("Webhooks", { delete: ["deleteGroupWebhook", "Exclui um webhook do grupo"] }),
  "/webhooks/{webhookId}/{token}": pathItem("Webhooks", { post: ["executeWebhook", "Publica uma mensagem por webhook", { auth: false, methods: ["201"] }] }),
  "/groups/{groupId}/attachments/{attachmentId}": pathItem("Mensagens", { get: ["getGroupMessageAttachment", "Baixa um anexo protegido da mensagem"] }),
  "/direct/conversations": pathItem("Mensagens", {
    get: ["listDirectConversations", "Lista conversas diretas"],
    post: ["createDirectConversation", "Cria conversa direta", { methods: ["201"] }],
  }),
  "/direct/conversations/{conversationId}": pathItem("Mensagens", { get: ["getDirectConversation", "Retorna uma conversa direta"] }),
  "/direct/conversations/{conversationId}/messages": pathItem("Mensagens", {
    get: ["listDirectMessages", "Lista mensagens diretas"],
    post: ["createDirectMessage", "Envia mensagem direta", { methods: ["201"] }],
  }),
  "/direct/conversations/{conversationId}/read": pathItem("Mensagens", { post: ["markDirectConversationRead", "Marca conversa direta como lida"] }),
  "/notifications": pathItem("Notificações", { get: ["listNotifications", "Lista notificações"] }),
  "/notifications/read-all": pathItem("Notificações", { post: ["markAllNotificationsRead", "Marca todas as notificações como lidas"] }),
  "/notifications/{notificationId}": pathItem("Notificações", { patch: ["markNotificationRead", "Marca uma notificação como lida"] }),
  "/member-invites/pending": pathItem("Convites", { get: ["listMemberInvites", "Lista convites de membro pendentes"] }),
  "/member-invites/{inviteId}/{action}": pathItem("Convites", { post: ["decideMemberInvite", "Aceita ou recusa um convite"] }),
  "/invites/{token}/redeem": pathItem("Convites", { post: ["redeemGroupInvite", "Resgata um convite de grupo"] }),
  "/streams/resolve": pathItem("Transmissões", { get: ["resolveStream", "Resolve um caminho público de transmissão", { auth: false }] }),
  "/streams": pathItem("Transmissões", {
    get: ["listStreams", "Lista transmissões"],
    post: ["createStream", "Abre uma transmissão", { methods: ["201"] }],
  }),
  "/streams/{streamId}/end": pathItem("Transmissões", { post: ["endStream", "Encerra uma transmissão"] }),
  "/streams/{streamId}/follow": pathItem("Transmissões", {
    post: ["followStream", "Segue uma transmissão"],
    delete: ["unfollowStream", "Deixa de seguir uma transmissão"],
  }),
  "/client-errors": pathItem("Observabilidade", { post: ["reportClientError", "Registra diagnóstico sanitizado do cliente", { methods: ["202"] }] }),
};

export function createApiV1Document() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Telai API",
      version: "1.0.0",
      description: "Contrato HTTP versionado do Telai. O namespace /api/v1 reutiliza os handlers compatíveis do servidor modular.",
    },
    servers: [{ url: "/api/v1" }],
    paths: withPathParameters(paths),
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: "mirante_session" },
      },
      responses: {
        HttpError: {
          description: "Erro HTTP padronizado",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error", "code"],
          properties: {
            error: { type: "string" },
            code: { type: "string" },
            retryAfter: { type: "integer", minimum: 1 },
          },
        },
      },
    },
  };
}
