"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldMapAssistantRoleToAi = shouldMapAssistantRoleToAi;
exports.rewriteAssistantRoleInRequestInit = rewriteAssistantRoleInRequestInit;
exports.wrapFetchAssistantRoleAsAi = wrapFetchAssistantRoleAsAi;
function mapAssistantToAiInJsonBody(bodyText) {
    try {
        const body = JSON.parse(bodyText);
        if (!Array.isArray(body.messages))
            return bodyText;
        let changed = false;
        const messages = body.messages.map((m) => {
            if (!m || typeof m !== 'object' || Array.isArray(m))
                return m;
            const msg = m;
            const role = msg.role;
            if (typeof role === 'string' && role.toLowerCase() === 'assistant') {
                changed = true;
                return { ...msg, role: 'ai' };
            }
            return m;
        });
        if (!changed)
            return bodyText;
        return JSON.stringify({ ...body, messages });
    }
    catch {
        return bodyText;
    }
}
function shouldMapAssistantRoleToAi(baseUrl) {
    const raw = process.env.LLM_ASSISTANT_ROLE_AS_AI?.trim().toLowerCase();
    if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off')
        return false;
    if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on')
        return true;
    return Boolean(baseUrl?.trim());
}
function rewriteAssistantRoleInRequestInit(init) {
    if (!init?.body || typeof init.body !== 'string')
        return init;
    const nextBody = mapAssistantToAiInJsonBody(init.body);
    if (nextBody === init.body)
        return init;
    return { ...init, body: nextBody };
}
function wrapFetchAssistantRoleAsAi(inner) {
    return (input, init) => inner(input, rewriteAssistantRoleInRequestInit(init));
}
//# sourceMappingURL=llm-assistant-role-map.js.map