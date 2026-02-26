/**
 * SMS Command Parser
 * Parses incoming SMS messages into structured commands.
 * Case-insensitive, whitespace-trimmed, with fuzzy matching for common typos.
 */
const EXACT_COMMANDS = {
    'APPROVE': 'APPROVE',
    'EDIT': 'EDIT',
    'IGNORE': 'IGNORE',
    'PAUSE': 'PAUSE',
    'RESUME': 'RESUME',
    'STATUS': 'STATUS',
    'BILLING': 'BILLING',
    'CANCEL': 'CANCEL',
    'HELP': 'HELP',
    'STOP': 'STOP',
    'YES': 'CANCEL_CONFIRM',
    'NO': 'CANCEL_DENY',
};
// Fuzzy aliases for common typos
const FUZZY_MAP = {
    'APROVE': 'APPROVE',
    'APPROV': 'APPROVE',
    'APRROVE': 'APPROVE',
    'APORVE': 'APPROVE',
    'EDTI': 'EDIT',
    'IGNOR': 'IGNORE',
    'INGNORE': 'IGNORE',
    'PAUS': 'PAUSE',
    'PASUE': 'PAUSE',
    'RESUM': 'RESUME',
    'RSUME': 'RESUME',
    'STAUTS': 'STATUS',
    'STATS': 'STATUS',
    'STAUS': 'STATUS',
    'BILING': 'BILLING',
    'BILLIN': 'BILLING',
    'CANCLE': 'CANCEL',
    'CANEL': 'CANCEL',
    'HLEP': 'HELP',
    'HEPL': 'HELP',
    'STPO': 'STOP',
    'SOTP': 'STOP',
    'Y': 'CANCEL_CONFIRM',
    'YEP': 'CANCEL_CONFIRM',
    'YEAH': 'CANCEL_CONFIRM',
    'YA': 'CANCEL_CONFIRM',
    'NOPE': 'CANCEL_DENY',
    'NAH': 'CANCEL_DENY',
    'N': 'CANCEL_DENY',
};
/**
 * Parse an incoming SMS body into a command.
 * @param body - Raw SMS body text
 * @param conversationState - Current conversation state for context-aware parsing
 */
export function parseCommand(body, conversationState) {
    const raw = body.trim();
    const normalized = raw.toUpperCase().trim();
    // If in EDIT flow (waiting_for_custom_reply), treat any message as custom reply
    if (conversationState === 'waiting_for_custom_reply') {
        // Unless it's an explicit command override
        const override = EXACT_COMMANDS[normalized];
        if (override && override !== 'CANCEL_CONFIRM' && override !== 'CANCEL_DENY') {
            return { type: override, raw };
        }
        return { type: 'CUSTOM_REPLY', raw, body: raw };
    }
    // If in CANCEL flow (waiting_for_cancel_confirm), only accept YES/NO
    if (conversationState === 'waiting_for_cancel_confirm') {
        if (normalized === 'YES' || normalized === 'Y' || normalized === 'YEP' || normalized === 'YEAH' || normalized === 'YA') {
            return { type: 'CANCEL_CONFIRM', raw };
        }
        if (normalized === 'NO' || normalized === 'N' || normalized === 'NOPE' || normalized === 'NAH') {
            return { type: 'CANCEL_DENY', raw };
        }
        // Any other input in cancel flow → treat as cancel denied
        return { type: 'CANCEL_DENY', raw };
    }
    // Exact match
    const exact = EXACT_COMMANDS[normalized];
    if (exact) {
        // Don't interpret YES/NO as cancel confirm/deny outside cancel flow
        if (exact === 'CANCEL_CONFIRM' || exact === 'CANCEL_DENY') {
            return { type: 'UNKNOWN', raw };
        }
        return { type: exact, raw };
    }
    // Fuzzy match
    const fuzzy = FUZZY_MAP[normalized];
    if (fuzzy) {
        if (fuzzy === 'CANCEL_CONFIRM' || fuzzy === 'CANCEL_DENY') {
            return { type: 'UNKNOWN', raw };
        }
        return { type: fuzzy, raw };
    }
    return { type: 'UNKNOWN', raw };
}
