
// 🚀 Use Gemini 2.5 Flash Image Preview for image generation
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image-preview';

export type GeminiImageResult = {
	mimeType: string;
	data?: string;
	text?: string;
};