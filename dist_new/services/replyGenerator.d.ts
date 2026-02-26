import type { GenerateReplyInput, GenerateReplyOutput } from '../types/models.js';
export declare class ReplyGeneratorService {
    /**
     * Detects escalation triggers in review text
     */
    private detectEscalations;
    /**
     * Builds the system prompt for GPT-4 based on restaurant tone profile
     */
    private buildSystemPrompt;
    /**
     * Builds the user prompt with review details
     */
    private buildUserPrompt;
    /**
     * Generate reply drafts for a review using GPT-4
     */
    generateReply(input: GenerateReplyInput): Promise<GenerateReplyOutput>;
    /**
     * Batch generate replies for multiple reviews
     */
    generateRepliesBatch(inputs: GenerateReplyInput[]): Promise<GenerateReplyOutput[]>;
}
export declare const replyGenerator: ReplyGeneratorService;
