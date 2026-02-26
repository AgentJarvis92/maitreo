import type { GenerateReplyInput, GenerateReplyOutput } from '../types/models.js';
/**
 * Mock Reply Generator - Uses templates instead of OpenAI
 * Use this while waiting for OpenAI billing to activate
 */
export declare class MockReplyGeneratorService {
    /**
     * Detects escalation triggers in review text
     */
    private detectEscalations;
    /**
     * Generate mock reply based on rating
     */
    private generateMockReply;
    /**
     * Generate reply using mock templates
     */
    generateReply(input: GenerateReplyInput): Promise<GenerateReplyOutput>;
    /**
     * Batch generate replies
     */
    generateRepliesBatch(inputs: GenerateReplyInput[]): Promise<GenerateReplyOutput[]>;
}
export declare const mockReplyGenerator: MockReplyGeneratorService;
//# sourceMappingURL=mockReplyGenerator.d.ts.map