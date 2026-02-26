/**
 * SMS Command Parser
 * Parses incoming SMS messages into structured commands.
 * Case-insensitive, whitespace-trimmed, with fuzzy matching for common typos.
 */
export type CommandType = 'APPROVE' | 'EDIT' | 'IGNORE' | 'PAUSE' | 'RESUME' | 'STATUS' | 'BILLING' | 'CANCEL' | 'HELP' | 'STOP' | 'CANCEL_CONFIRM' | 'CANCEL_DENY' | 'CUSTOM_REPLY' | 'UNKNOWN';
export interface ParsedCommand {
    type: CommandType;
    raw: string;
    body?: string;
}
/**
 * Parse an incoming SMS body into a command.
 * @param body - Raw SMS body text
 * @param conversationState - Current conversation state for context-aware parsing
 */
export declare function parseCommand(body: string, conversationState?: string): ParsedCommand;
//# sourceMappingURL=commandParser.d.ts.map