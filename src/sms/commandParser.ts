/**
 * SMS Command Parser
 * Parses incoming SMS messages into structured commands.
 * Case-insensitive, whitespace-trimmed, with fuzzy matching for common typos.
 */

export type CommandType =
  | 'APPROVE'
  | 'EDIT'
  | 'IGNORE'
  | 'PAUSE'
  | 'RESUME'
  | 'STATUS'
  | 'BILLING'
  | 'CANCEL'
  | 'HELP'
  | 'STOP'
  | 'CANCEL_CONFIRM'        // "YES" after CANCEL prompt
  | 'CANCEL_DENY'           // "NO" after CANCEL prompt
  | 'CUSTOM_REPLY'          // Free-text reply in EDIT flow
  | 'COMPETITOR_SCAN'       // COMPETITOR SCAN
  | 'COMPETITOR_ADD'        // COMPETITOR ADD <name>
  | 'COMPETITOR_LIST'       // COMPETITOR LIST
  | 'COMPETITOR_REMOVE'     // COMPETITOR REMOVE <identifier>
  | 'UNKNOWN';

export interface ParsedCommand {
  type: CommandType;
  raw: string;
  body?: string;       // CUSTOM_REPLY text
  argument?: string;   // COMPETITOR ADD <name> or COMPETITOR REMOVE <identifier>
}

const EXACT_COMMANDS: Record<string, CommandType> = {
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
const FUZZY_MAP: Record<string, CommandType> = {
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
export function parseCommand(body: string, conversationState?: string): ParsedCommand {
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

  // COMPETITOR multi-word commands (checked before single-word exact match)
  if (normalized.startsWith('COMPETITOR')) {
    const rest = raw.slice('COMPETITOR'.length).trim();
    const restUpper = rest.toUpperCase();
    if (restUpper === 'SCAN' || restUpper === '') {
      return { type: 'COMPETITOR_SCAN', raw };
    }
    if (restUpper === 'LIST') {
      return { type: 'COMPETITOR_LIST', raw };
    }
    if (restUpper.startsWith('ADD')) {
      const name = rest.slice(3).trim();
      return { type: 'COMPETITOR_ADD', raw, argument: name || undefined };
    }
    if (restUpper.startsWith('REMOVE') || restUpper.startsWith('DELETE')) {
      const identifier = rest.replace(/^(REMOVE|DELETE)\s*/i, '').trim();
      return { type: 'COMPETITOR_REMOVE', raw, argument: identifier || undefined };
    }
    return { type: 'UNKNOWN', raw };
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
