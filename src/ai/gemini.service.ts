import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type Part, type EnhancedGenerateContentResponse } from '@google/generative-ai';
import { AIMessage } from '../libs/enums';
import { GEMINI_MODEL, GeminiImageResult } from 'src/libs/config';



@Injectable()
export class GeminiService {
	private client: GoogleGenerativeAI | null = null;
	private readonly logger = new Logger(GeminiService.name);

	private readonly defaultModel = GEMINI_MODEL;

	constructor(private readonly configService: ConfigService) { }

	async generateImage(
		prompt: string, 
		modelName?: string,
		aspectRatio?: string,
		resolution?: string
	): Promise<GeminiImageResult> {
		try {
			// 🚀 CRITICAL: Use Gemini 2.5 Flash Image Preview for image generation
			const modelId = modelName || this.defaultModel;
			const model = this.getModel(modelId);

			this.logger.log(`🎨 Starting Gemini image generation (${modelId}) for prompt: ${prompt.substring(0, 100)}...`);
			if (aspectRatio) {
				this.logger.log(`Aspect ratio: ${aspectRatio}`);
			}
			if (resolution) {
				this.logger.log(`Resolution: ${resolution}`);
			}

			// 🎨 Sanitize prompt to avoid PII policy violations
			let sanitizedPrompt = prompt
				.replace(/\b(young|old|middle-aged)\s+(man|woman|person|model)\b/gi, 'professional model')
				.replace(/\b(confident|smiling|happy)\s+(young|old|middle-aged)?\s*(man|woman|person|model)\b/gi, 'professional model')
				.replace(/\bfather\s+and\s+son\b/gi, 'two professional models')
				.replace(/\bperson\b/gi, 'professional model')
				.replace(/\bpeople\b/gi, 'professional models');
			
			// 🎨 Build enhanced prompt for product photography
			const ratioText = aspectRatio || '1:1';
			const resolutionText = resolution ? `${resolution} resolution` : 'high resolution';
			let enhancedPrompt = `Professional product photography: ${sanitizedPrompt}. Aspect ratio: ${ratioText}. ${resolutionText}. High quality, sharp details, perfect lighting.`;

			this.logger.log(`📐 Using aspect ratio: ${ratioText}`);
			this.logger.log(`📝 Final prompt: ${enhancedPrompt.substring(0, 200)}...`);

			// 🚀 CRITICAL: Call Gemini image generation model
			const result = await model.generateContent({
				contents: [
					{
						role: 'user',
						parts: [
							{
								text: enhancedPrompt,
							},
						],
					},
				],
				generationConfig: {
					responseMimeType: 'image/png', // Request image output
				},
			});

			const response = result.response;

			// 🚀 CRITICAL: Check for inline image data FIRST
			const inlineData = this.extractInlineData(response);

			if (inlineData?.data) {
				this.logger.log(`✅ Successfully generated image (${inlineData.mimeType}), data length: ${inlineData.data.length}`);
				return {
					mimeType: inlineData.mimeType,
					data: inlineData.data,
				};
			}

			// 🚀 CRITICAL: If no image data, log error and throw exception
			const text = response.text();
			this.logger.error(`❌ Gemini API returned text instead of image!`);
			this.logger.error(`Response text: ${text.substring(0, 200)}...`);
			this.logger.error(`Response candidates:`, JSON.stringify(response.candidates, null, 2));
			
			// Throw error instead of returning text
			throw new InternalServerErrorException(
				`Gemini API did not generate an image. Response: ${text.substring(0, 100)}`
			);
		} catch (error: any) {
			const errorMessage = error?.response?.error ? JSON.stringify(error.response.error) : error?.message || String(error);
			this.logger.error(`Gemini generateImage failed: ${errorMessage}`);

			throw new InternalServerErrorException(AIMessage.GEMINI_API_ERROR);
		}
	}

	async generateBatch(prompts: string[], modelName?: string): Promise<GeminiImageResult[]> {
		const results: GeminiImageResult[] = [];

		for (const prompt of prompts) {
			const result = await this.generateImage(prompt, modelName);
			results.push(result);
		}

		return results;
	}

	private getModel(modelName?: string) {
		const client = this.getClient();

		return client.getGenerativeModel({
			model: modelName || this.defaultModel,
		});
	}

	private getClient(): GoogleGenerativeAI {
		if (this.client) {
			return this.client;
		}

		const apiKey = this.configService.get<string>('gemini.apiKey');

		if (!apiKey) {
			this.logger.error('GEMINI_API_KEY is missing in environment variables');
			throw new InternalServerErrorException(AIMessage.API_KEY_MISSING);
		}

		this.logger.log('Gemini client initialized successfully');
		this.client = new GoogleGenerativeAI(apiKey);
		return this.client;
	}

	private extractInlineData(response: EnhancedGenerateContentResponse): { mimeType: string; data: string } | null {
		const parts: Part[] = response.candidates?.[0]?.content?.parts || [];

		this.logger.log(`🔍 Extracting inline data from ${parts.length} parts`);

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			this.logger.log(`🔍 Part ${i} type:`, (part as any).inlineData ? 'inlineData' : 'text');
			
			const inlineData = (part as { inlineData?: { mimeType: string; data: string } }).inlineData;

			if (inlineData?.data) {
				this.logger.log(`✅ Found inline data: mimeType=${inlineData.mimeType}, dataLength=${inlineData.data.length}`);
				return inlineData;
			}
		}

		this.logger.warn(`⚠️ No inline data found in response parts`);
		return null;
	}
}
