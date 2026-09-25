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
  "/users/search": pathItem("Social", { get: ["searchUsers", "Busca usuários"] }),
  "/social": pathItem("Social", { get: ["getSocialGraph", "Retorna amizades, solicitações e follows"] }),
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
  "/groups/{groupId}/messages": pathItem("Mensagens", { post: ["createGroupMessage", "Envia mensagem no grupo", { methods: ["201"] }] }),
  "/groups/{groupId}/messages/{messageId}": pathItem("Mensagens", {
    patch: ["editGroupMessage", "Edita uma mensagem do grupo"],
    delete: ["deleteGroupMessage", "Exclui uma mensagem do grupo"],
  }),
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
