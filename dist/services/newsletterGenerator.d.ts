import type { GenerateNewsletterInput, GenerateNewsletterOutput } from '../types/models.js';
export declare class NewsletterGeneratorService {
    /**
     * Analyze competitor reviews and generate insights
     */
    private analyzeCompetitorData;
    /**
     * Build the analysis prompt
     */
    private buildNewsletterPrompt;
    /**
     * Generate newsletter HTML
     */
    private generateNewsletterHTML;
    /**
     * Generate complete newsletter
     */
    generateNewsletter(input: GenerateNewsletterInput): Promise<GenerateNewsletterOutput>;
}
export declare const newsletterGenerator: NewsletterGeneratorService;
//# sourceMappingURL=newsletterGenerator.d.ts.map