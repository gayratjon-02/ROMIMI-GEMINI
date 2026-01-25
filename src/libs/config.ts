

// 🚀 Use Gemini 2.0 Flash Experimental for image generation
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';

export type GeminiImageResult = {
	mimeType: string;
	data?: string;
	text?: string;
};