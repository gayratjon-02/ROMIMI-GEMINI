import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Part, EnhancedGenerateContentResponse } from '@google/generative-ai';
import { AIMessage } from '../libs/enums';

type GeminiImageResult = {
	mimeType: string;
	data?: string;
	text?: string;
};

@Injectable()
export class GeminiService {
	private client: GoogleGenerativeAI | null = null;
	private readonly defaultModel = 'gemini-1.5-flash';

	constructor(private readonly configService: ConfigService) {}

	async generateImage(prompt: string, modelName?: string): Promise<GeminiImageResult> {
		try {
			const model = this.getModel(modelName);
			const result = await model.generateContent(prompt);
			const response = result.response;
			const inlineData = this.extractInlineData(response);

			if (inlineData?.data) {
				return { mimeType: inlineData.mimeType, data: inlineData.data };
			}

			return { mimeType: 'text/plain', text: response.text() };
		} catch (error) {
			throw new InternalServerErrorException(AIMessage.GEMINI_API_ERROR);
		}
	}

	async generateBatch(prompts: string[], modelName?: string): Promise<GeminiImageResult[]> {
		const results: GeminiImageResult[] = [];
		for (const prompt of prompts) {
			results.push(await this.generateImage(prompt, modelName));
		}
		return results;
	}

	private getModel(modelName?: string) {
		const client = this.getClient();
		return client.getGenerativeModel({ model: modelName || this.defaultModel });
	}

	private getClient(): GoogleGenerativeAI {
		if (this.client) {
			return this.client;
		}

		const apiKey = this.configService.get<string>('GEMINI_API_KEY');
		if (!apiKey) {
			throw new InternalServerErrorException(AIMessage.API_KEY_MISSING);
		}

		this.client = new GoogleGenerativeAI(apiKey);
		return this.client;
	}

	private extractInlineData(
		response: EnhancedGenerateContentResponse,
	): { mimeType: string; data: string } | null {
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
