import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { GeminiService, GeminiGenerationError, GeminiTimeoutError } from './gemini.service';
import { GeminiImageResult } from '../libs/config';

/** Same shape as Gemini for drop-in replacement */
export type VertexImagenResult = GeminiImageResult;

// Re-export error types for backward compatibility
export { GeminiTimeoutError as VertexImagenTimeoutError };
export { GeminiGenerationError as VertexImagenGenerationError };

/**
 * VertexImagenService - Now a wrapper around GeminiService
 * 
 * This service previously used Vertex AI Imagen 3 REST API.
 * Now it delegates all image generation to GeminiService which uses
 * the Gemini API (@google/genai SDK).
 * 
 * This wrapper is kept for backward compatibility with existing code
 * that imports VertexImagenService.
 */
@Injectable()
export class VertexImagenService {
	private readonly logger = new Logger(VertexImagenService.name);

	constructor(private readonly geminiService: GeminiService) {
		this.logger.log('🔄 VertexImagenService initialized - using GeminiService for image generation');
	}

	/**
	 * Generate one image via Gemini API (previously Vertex AI Imagen).
	 * Delegates to GeminiService.generateImage()
	 */
	async generateImage(
		prompt: string,
		modelName?: string,
		aspectRatio?: string,
		resolution?: string,
		userApiKey?: string
	): Promise<VertexImagenResult> {
		this.logger.log(`🎨 [Gemini API] Generating image via GeminiService`);
		this.logger.log(`📐 aspect=${aspectRatio ?? 'default'} resolution=${resolution ?? 'default'}`);

		try {
			const result = await this.geminiService.generateImage(
				prompt,
				modelName,
				aspectRatio,
				resolution,
				userApiKey
			);

			this.logger.log('✅ [Gemini API] Image generated successfully');
			return result;
		} catch (error: any) {
			this.logger.error(`❌ [Gemini API] Image generation failed: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Generate multiple images (same interface as before for compatibility).
	 */
	async generateImages(
		prompt: string,
		aspectRatio?: string,
		resolution?: string,
		userApiKey?: string
	): Promise<{ images: VertexImagenResult[] }> {
		const one = await this.generateImage(prompt, undefined, aspectRatio, resolution, userApiKey);
		return { images: [one] };
	}

	/**
	 * Get current model name from GeminiService
	 */
	getModelName(): string {
		return this.geminiService.getModel();
	}

	/**
	 * Check if Gemini API is configured (has API key)
	 */
	isConfigured(): boolean {
		const status = this.geminiService.getApiKeyStatus();
		return status.hasSystemKey;
	}
}
