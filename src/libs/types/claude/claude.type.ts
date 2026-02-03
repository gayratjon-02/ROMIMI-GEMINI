
export type AnalyzeProductDirectInput = {
    frontImages?: string[];
    backImages?: string[];
    referenceImages?: string[];
    productName?: string;
};

export type AnalyzeProductInput = {
    images: string[];
    productName?: string;
    brandBrief?: string;
    notes?: string;
};

export type GeneratePromptsInput = {
    productName?: string;
    brandBrief?: string;
    extractedVariables?: Record<string, any>;
    fixedElements?: Record<string, any>;
    promptTemplates?: Record<string, any>;
    count?: number;
};

export type AnalyzeCompetitorAdInput = {
    image: string;
    brandBrief?: string;
    notes?: string;
};





export type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export type ClaudeContentBlock =
    | { type: 'text'; text: string }
    | {
        type: 'image';
        source: { type: 'base64'; media_type: ClaudeImageMediaType; data: string };
    };

