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

	async generateImage(prompt: string, modelName?: string): Promise<GeminiImageResult> {
		try {
			const model = this.getModel(modelName);

			this.logger.log(`Starting image generation for prompt: ${prompt.substring(0, 100)}...`);

			const result = await model.generateContent({
				contents: [
					{
						role: 'user',
						parts: [
							{
								text: `Generate a high-quality, professional image: ${prompt}`,
							},
						],
					},
				],
				generationConfig: {
					temperature: 0.7,
					topK: 40,
					topP: 0.95,
					maxOutputTokens: 1024,
				},
			});

			const response = result.response;

			// Check for inline image data
			const inlineData = this.extractInlineData(response);

			if (inlineData?.data) {
				this.logger.log(`Successfully generated image (${inlineData.mimeType})`);
				return {
					mimeType: inlineData.mimeType,
					data: inlineData.data,
				};
			}

			// If no image data, return text response
			const text = response.text();
			this.logger.log(`Generated text response: ${text.substring(0, 100)}...`);

			return {
				mimeType: 'text/plain',
				text: text,
			};
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

		for (const part of parts) {
			const inlineData = (part as { inlineData?: { mimeType: string; data: string } }).inlineData;

			if (inlineData?.data) {
				return inlineData;
			}
		}

		return null;
	}
}
