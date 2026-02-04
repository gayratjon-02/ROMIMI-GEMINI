import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { AIMessage, FileMessage } from '../libs/enums';
import { GEMINI_MODEL, VALID_IMAGE_SIZES, GeminiImageResult } from '../libs/config';
import { AnalyzedProductJSON } from '../common/interfaces/product-json.interface';
import { AnalyzedDAJSON } from '../common/interfaces/da-json.interface';
import { PRODUCT_ANALYSIS_PROMPT } from './prompts/product-analysis.prompt';
import { DA_ANALYSIS_PROMPT } from './prompts/da-analysis.prompt';
import * as fs from 'fs';
import * as path from 'path';

// Custom error types for better error handling
export class GeminiTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GeminiTimeoutError';
	}
}

export class GeminiGenerationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GeminiGenerationError';
	}
}

@Injectable()
export class GeminiService {
	private client: GoogleGenAI | null = null;
	private readonly logger = new Logger(GeminiService.name);

	// QATIYAN: Faqat gemini-3-pro-image-preview modelidan foydalanish
	private readonly MODEL = GEMINI_MODEL;
	private readonly ANALYSIS_MODEL = 'gemini-2.0-flash'; // Optimized for multimodal analysis

	// ⏱️ Timeout: 3 daqiqa (180 sekund) - image generation can take longer
	private readonly TIMEOUT_MS = 180 * 1000; // 3 minutes in milliseconds

	/** DTO aspect_ratio -> Gemini generationConfig (1:1, 9:16, 4:5, 16:9) */
	private static readonly ASPECT_RATIO_MAP: Record<string, string> = {
		'1:1': '1:1',
		'9:16': '9:16',  // Portrait/Story
		'4:5': '4:5',
		'16:9': '16:9',
		'3:4': '3:4',
		'4:3': '4:3',
		'2:3': '2:3',
		'3:2': '3:2',
		'21:9': '21:9',
	};

	constructor(private readonly configService: ConfigService) { }

	/**
	 * Map DTO aspect_ratio to Gemini API config (1:1, 9:16, 4:5, 16:9).
	 */
	private mapAspectRatioToGemini(dtoRatio?: string): string {
		if (!dtoRatio || typeof dtoRatio !== 'string') return '4:5';
		const normalized = dtoRatio.trim();
		return GeminiService.ASPECT_RATIO_MAP[normalized] ?? '4:5';
	}

	/**
	 * Normalize resolution to Gemini imageSize (1K, 2K, 4K).
	 */
	private mapResolutionToGemini(resolution?: string): string {
		if (!resolution || typeof resolution !== 'string') return '1K';
		const upper = resolution.trim().toUpperCase();
		return VALID_IMAGE_SIZES.includes(upper as any) ? upper : '1K';
	}

	/**
	 * Promise with timeout wrapper
	 */
	private withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new GeminiTimeoutError(
					`⏱️ ${operationName} timed out after ${timeoutMs / 1000} seconds (${timeoutMs / 60000} minutes)`
				));
			}, timeoutMs);

			promise
				.then((result) => {
					clearTimeout(timeoutId);
					resolve(result);
				})
				.catch((error) => {
					clearTimeout(timeoutId);
					reject(error);
				});
		});
	}

	/**
	 * 🚀 PRODUCTION-READY: Generate images using Gemini 3 Pro Image Preview model
	 * Uses the correct @google/genai SDK format with responseModalities
	 * @param userApiKey - Optional user-specific API key
	 */
	async generateImages(prompt: string, aspectRatio?: string, resolution?: string, userApiKey?: string): Promise<{ images: GeminiImageResult[] }> {
		const client = this.getClient(userApiKey);
		const startTime = Date.now();

		// Default aspect_ratio to 4:5 if missing; then map to Gemini format (4:5 -> 3:4; 1:1, 9:16, 16:9 supported)
		const ratioText = this.mapAspectRatioToGemini(aspectRatio ?? '4:5');
		const resolutionText = this.mapResolutionToGemini(resolution);


		// 🚀 CRITICAL: Sanitize prompt to avoid PII policy violations
		// Defensive check for empty prompt
		if (!prompt) {
			this.logger.error('❌ CRITICAL: generateImages called with EMPTY/UNDEFINED prompt!');
			throw new GeminiGenerationError('Prompt string is required');
		}

		const sanitizedPrompt = this.sanitizePromptForImageGeneration(prompt);

		// Enhanced prompt: STRICT—render exactly as specified; models MUST be fully clothed
		const enhancedPrompt = `Render EXACTLY as specified. Do NOT add, remove, or change any element. 100% match to the product specification. No creative additions.
CRITICAL: Any human models must be FULLY CLOTHED. NEVER shirtless, bare-chested, or topless.

Professional e-commerce product photography: ${sanitizedPrompt}.
High quality studio lighting, sharp details, clean background.`;

		this.logger.log(`🎨 ========== GEMINI IMAGE GENERATION START ==========`);
		this.logger.log(`📋 Model: ${this.MODEL}`);
		this.logger.log(`📐 Aspect ratio (DTO: ${aspectRatio ?? 'default'} -> API: ${ratioText})`);
		this.logger.log(`📏 Resolution (DTO: ${resolution ?? 'default'} -> API: ${resolutionText})`);
		this.logger.log(`⏱️ Timeout: ${this.TIMEOUT_MS / 1000} seconds`);
		this.logger.log(`📝 Original prompt (first 200 chars): ${prompt.substring(0, 200)}...`);
		this.logger.log(`📝 Sanitized prompt (first 200 chars): ${sanitizedPrompt.substring(0, 200)}...`);
		this.logger.log(`📝 Enhanced prompt (first 300 chars): ${enhancedPrompt.substring(0, 300)}...`);

		try {
			const imageConfig = {
				aspectRatio: ratioText,
				imageSize: resolutionText,
			};
			this.logger.log(`📐 Final Gemini generation config: ${JSON.stringify(imageConfig)}`);

			// 🚀 CRITICAL: Use EXACT format from Google's official documentation
			// Reference: https://ai.google.dev/gemini-api/docs/image-generation
			const generatePromise = client.models.generateContent({
				model: this.MODEL,
				contents: enhancedPrompt, // Can be string directly
				config: {
					responseModalities: ['TEXT', 'IMAGE'], // CRITICAL: Force image generation
					imageConfig,
					safetySettings: [
						{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
					]
				}
			});

			// Wrap with timeout
			const response = await this.withTimeout(
				generatePromise,
				this.TIMEOUT_MS,
				'Gemini image generation'
			);

			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
			this.logger.log(`⏱️ Gemini response received in ${elapsedTime}s`);

			// 🔍 MANDATORY LOGGING: Debug response structure
			this.logger.log(`📊 Candidates count: ${response.candidates?.length || 0}`);

			if (!response.candidates || response.candidates.length === 0) {
				this.logger.error(`❌ CRITICAL: No candidates in Gemini response!`);
				this.logger.error(`Full response:`, JSON.stringify(response, null, 2));
				throw new GeminiGenerationError('Gemini returned no candidates');
			}

			const candidate = response.candidates[0];
			const parts = candidate.content?.parts || [];

			this.logger.log(`📊 Parts count: ${parts.length}`);

			if (parts.length === 0) {
				this.logger.error(`❌ CRITICAL: No parts in Gemini response!`);
				this.logger.error(`Candidate:`, JSON.stringify(candidate, null, 2));
				const finishReason = (candidate as any).finishReason || (candidate as any).finish_reason;
				if (finishReason === 'IMAGE_SAFETY' || finishReason === 'SAFETY') {
					throw new GeminiGenerationError(
						'Image generation was blocked by platform safety policy. For DUO (Father+Son) or child model shots, the platform may block generation. Try SOLO (Adult) or FLAT LAY shots instead.'
					);
				}
				throw new GeminiGenerationError('Gemini returned no parts');
			}

			// 🔍 MANDATORY: Parse response parts and log each one
			const images: GeminiImageResult[] = [];
			let textResponse = '';

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i] as any;
				const partKeys = Object.keys(part);
				this.logger.log(`🔍 Part ${i} keys: [${partKeys.join(', ')}]`);

				// Check for text part
				if (part.text) {
					textResponse = part.text;
					this.logger.log(`📝 Part ${i} is TEXT (first 200 chars): ${part.text.substring(0, 200)}`);

					// 🚀 CRITICAL: Check if model REFUSED to generate images
					const lowerText = part.text.toLowerCase();
					if (
						lowerText.includes('cannot generate') ||
						lowerText.includes('unable to generate') ||
						lowerText.includes('i cannot') ||
						lowerText.includes('i am unable') ||
						lowerText.includes('violates') ||
						lowerText.includes('policy')
					) {
						this.logger.error(`❌ CRITICAL: Model REFUSED to generate image!`);
						this.logger.error(`Refusal text: ${part.text}`);
						throw new GeminiGenerationError(`Model refused: ${part.text.substring(0, 300)}`);
					}
				}

				// 🚀 CRITICAL: Check for image part (inlineData)
				if (part.inlineData) {
					const mimeType = part.inlineData.mimeType || 'image/png';
					const data = part.inlineData.data;

					this.logger.log(`✅ Part ${i} is IMAGE!`);
					this.logger.log(`   - mimeType: ${mimeType}`);
					this.logger.log(`   - data length: ${data?.length || 0} characters`);

					if (data && data.length > 0) {
						images.push({
							mimeType: mimeType,
							data: data // base64 string
						});
						this.logger.log(`✅ Image ${images.length} added successfully!`);
					} else {
						this.logger.warn(`⚠️ Part ${i} has inlineData but no data content!`);
					}
				}


				// Check for thought parts (Gemini 3 Pro uses thinking)
				if (part.thought) {
					this.logger.log(`💭 Part ${i} is THOUGHT (thinking process)`);
				}
			}

			// 🚀 CRITICAL: Verify we got images
			if (images.length === 0) {
				this.logger.error(`❌ CRITICAL: Gemini returned NO IMAGES!`);
				this.logger.error(`📝 Text response was: ${textResponse}`);
				this.logger.error(`📊 Total parts: ${parts.length}`);

				// Try to provide helpful error message
				if (textResponse) {
					throw new GeminiGenerationError(
						`Gemini did not generate any images. Model response: ${textResponse.substring(0, 300)}`
					);
				} else {
					throw new GeminiGenerationError(
						'Gemini did not generate any images and provided no explanation.'
					);
				}
			}

			this.logger.log(`🎉 SUCCESS: Generated ${images.length} image(s) in ${elapsedTime}s`);
			this.logger.log(`🎨 ========== GEMINI IMAGE GENERATION COMPLETE ==========`);

			return { images };

		} catch (error: any) {
			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

			// ⏱️ Handle timeout error
			if (error instanceof GeminiTimeoutError) {
				this.logger.error(`⏱️ TIMEOUT: Image generation timed out after ${elapsedTime}s`);
				throw new InternalServerErrorException(
					`Image generation timed out after ${this.TIMEOUT_MS / 60000} minutes. Please try again.`
				);
			}

			// Handle generation error (model refused, etc.)
			if (error instanceof GeminiGenerationError) {
				this.logger.error(`❌ Generation error after ${elapsedTime}s: ${error.message}`);
				throw new InternalServerErrorException(error.message);
			}

			// Handle SDK errors
			const errorMessage = error?.message || String(error);
			this.logger.error(`❌ Gemini SDK error after ${elapsedTime}s: ${errorMessage}`);

			// Log full error for debugging
			if (error.stack) {
				this.logger.error(`Stack trace: ${error.stack}`);
			}

			if (error instanceof InternalServerErrorException) {
				throw error;
			}

			throw new InternalServerErrorException(`Gemini error: ${errorMessage.substring(0, 200)}`);
		}
	}

	/**
	 * 🚀 Generate single image - main entry point
	 * Includes retry logic for resilience
	 * @param userApiKey - Optional user-specific API key
	 */
	async generateImage(
		prompt: string,
		_modelName?: string, // ignored, we always use gemini-3-pro-image-preview
		aspectRatio?: string,
		resolution?: string,
		userApiKey?: string
	): Promise<GeminiImageResult> {
		const maxRetries = 2;
		const startTime = Date.now();

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				if (attempt > 0) {
					this.logger.log(`🔄 Retry attempt ${attempt + 1}/${maxRetries}...`);
					await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry
				}

				const result = await this.generateImages(prompt, aspectRatio, resolution, userApiKey);

				if (result.images.length > 0) {
					const image = result.images[0];
					this.logger.log(`✅ Image generated successfully!`);
					this.logger.log(`   - mimeType: ${image.mimeType}`);
					this.logger.log(`   - data length: ${image.data?.length || 0}`);
					return image;
				}

				throw new GeminiGenerationError('No images generated');

			} catch (error: any) {
				const isLastAttempt = attempt === maxRetries - 1;
				const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

				// Don't retry on timeout - it already waited long enough
				if (error instanceof InternalServerErrorException &&
					error.message.includes('timed out')) {
					this.logger.error(`⏱️ Timeout error - not retrying`);
					throw error;
				}

				// Don't retry on policy violations - they won't succeed
				if (error.message && (
					error.message.includes('violates') ||
					error.message.includes('policy') ||
					error.message.includes('refused')
				)) {
					this.logger.error(`🚫 Policy violation - not retrying`);
					throw error;
				}

				if (isLastAttempt) {
					this.logger.error(`❌ All ${maxRetries} attempts failed after ${elapsedTime}s`);
					throw error;
				}

				this.logger.warn(`⚠️ Attempt ${attempt + 1} failed after ${elapsedTime}s: ${error.message}`);
			}
		}

		throw new InternalServerErrorException(AIMessage.GEMINI_API_ERROR);
	}

	/**
	 * 🆕 Generate image WITH reference images
	 * 
	 * This method sends product reference images (front/back) to Gemini
	 * along with the text prompt, enabling accurate reproduction of:
	 * - Exact pocket count and positions
	 * - Button count and placement
	 * - Logo/branding details
	 * - Fabric texture and color
	 * 
	 * @param prompt - The text prompt describing the shot
	 * @param referenceImages - Array of image URLs (front/back product images)
	 * @param aspectRatio - Output aspect ratio
	 * @param resolution - Output resolution
	 * @param userApiKey - Optional user-specific API key
	 */
	async generateImageWithReference(
		prompt: string,
		referenceImages: string[],
		aspectRatio?: string,
		resolution?: string,
		userApiKey?: string
	): Promise<GeminiImageResult> {
		const client = this.getClient(userApiKey);
		const startTime = Date.now();

		// Filter valid images
		const validImages = (referenceImages || []).filter(img => img && img.trim() !== '');

		// ═══════════════════════════════════════════════════════════════════
		// 📊 DEBUG: LOG ALL INPUT DATA
		// ═══════════════════════════════════════════════════════════════════
		console.log('\n');
		console.log('╔══════════════════════════════════════════════════════════════════╗');
		console.log('║  🚀 GEMINI API CALL - WITH REFERENCE IMAGES                      ║');
		console.log('╚══════════════════════════════════════════════════════════════════╝');
		console.log('');
		console.log('📋 INPUT PARAMETERS:');
		console.log('─────────────────────────────────────────────────────────────────────');
		console.log(`   Model: ${this.MODEL}`);
		console.log(`   Aspect Ratio: ${aspectRatio || 'default (4:5)'}`);
		console.log(`   Resolution: ${resolution || 'default (1K)'}`);
		console.log('');
		console.log('🖼️  REFERENCE IMAGES:');
		console.log('─────────────────────────────────────────────────────────────────────');
		console.log(`   Total count: ${validImages.length}`);
		validImages.forEach((img, i) => {
			console.log(`   [${i + 1}] ${img}`);
		});
		console.log('');
		console.log('📝 ORIGINAL PROMPT (first 500 chars):');
		console.log('─────────────────────────────────────────────────────────────────────');
		console.log(prompt.substring(0, 500));
		if (prompt.length > 500) console.log(`   ... (${prompt.length - 500} more chars)`);
		console.log('');

		// If no valid reference images, fall back to regular generation
		if (validImages.length === 0) {
			console.log('⚠️  WARNING: No valid reference images provided!');
			console.log('   → Falling back to text-only generation');
			console.log('═════════════════════════════════════════════════════════════════════\n');
			return this.generateImage(prompt, undefined, aspectRatio, resolution, userApiKey);
		}

		// Build image parts from URLs
		const imageParts = await this.buildImageParts(validImages);

		console.log('📦 IMAGE PARTS BUILT:');
		console.log('─────────────────────────────────────────────────────────────────────');
		console.log(`   Successfully loaded: ${imageParts.length} images`);
		imageParts.forEach((part: any, i) => {
			const dataLen = part.inlineData?.data?.length || 0;
			console.log(`   [${i + 1}] Type: ${part.inlineData?.mimeType || 'unknown'}, Size: ${(dataLen / 1024).toFixed(1)} KB`);
		});
		console.log('');

		if (imageParts.length === 0) {
			console.log('⚠️  WARNING: Failed to load any reference images!');
			console.log('   → Falling back to text-only generation');
			console.log('═════════════════════════════════════════════════════════════════════\n');
			return this.generateImage(prompt, undefined, aspectRatio, resolution, userApiKey);
		}

		// Map aspect ratio and resolution
		const ratioText = this.mapAspectRatioToGemini(aspectRatio ?? '4:5');
		const resolutionText = this.mapResolutionToGemini(resolution);

		// Enhanced prompt with reference instruction
		const referencePrompt = `🎯 CRITICAL: Use the provided reference images as EXACT VISUAL GUIDE.
You MUST match ALL details from reference images precisely:
- EXACT pocket count and positions (count every pocket!)
- EXACT button count and placement
- EXACT color (sample HEX from reference)
- EXACT logo/branding details and positions
- EXACT fabric texture and material appearance
- EXACT collar/cuff/seam details

Generate a NEW professional product photography based on these references.
The generated image must be VISUALLY IDENTICAL to the reference product.

PHOTOGRAPHY REQUIREMENTS:
${this.sanitizePromptForImageGeneration(prompt)}

HIGH QUALITY OUTPUT: Professional e-commerce photography, studio lighting, sharp details.`;

		console.log('🔧 ENHANCED PROMPT (sent to Gemini):');
		console.log('─────────────────────────────────────────────────────────────────────');
		console.log(referencePrompt.substring(0, 800));
		if (referencePrompt.length > 800) console.log(`   ... (${referencePrompt.length - 800} more chars)`);
		console.log('');

		console.log('⚙️  GEMINI CONFIG:');
		console.log('─────────────────────────────────────────────────────────────────────');
		console.log(`   responseModalities: ['TEXT', 'IMAGE']`);
		console.log(`   imageConfig.aspectRatio: ${ratioText}`);
		console.log(`   imageConfig.imageSize: ${resolutionText}`);
		console.log(`   safetySettings: All set to BLOCK_NONE`);
		console.log('');
		console.log('📤 SENDING REQUEST TO GEMINI API...');
		console.log('─────────────────────────────────────────────────────────────────────');

		try {
			const imageConfig = {
				aspectRatio: ratioText,
				imageSize: resolutionText,
			};

			// 🚀 CRITICAL: Send text + reference images together
			const generatePromise = client.models.generateContent({
				model: this.MODEL,
				contents: [
					{
						role: 'user',
						parts: [
							{ text: referencePrompt },
							...imageParts  // Reference images as visual guide
						]
					}
				],
				config: {
					responseModalities: ['TEXT', 'IMAGE'],
					imageConfig,
					safetySettings: [
						{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
						{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
					]
				}
			});

			// Wrap with timeout
			const response = await this.withTimeout(
				generatePromise,
				this.TIMEOUT_MS,
				'Gemini image generation with reference'
			);

			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

			// ═══════════════════════════════════════════════════════════════════
			// 📊 DEBUG: LOG RESPONSE DATA
			// ═══════════════════════════════════════════════════════════════════
			console.log('');
			console.log('📥 GEMINI RESPONSE RECEIVED:');
			console.log('─────────────────────────────────────────────────────────────────────');
			console.log(`   ⏱️  Time elapsed: ${elapsedTime}s`);
			console.log(`   📦 Candidates count: ${response.candidates?.length || 0}`);

			// Parse response (same logic as generateImages)
			if (!response.candidates || response.candidates.length === 0) {
				console.log('   ❌ ERROR: No candidates in response!');
				console.log('═════════════════════════════════════════════════════════════════════\n');
				throw new GeminiGenerationError('Gemini returned no candidates');
			}

			const candidate = response.candidates[0];
			const parts = candidate.content?.parts || [];

			console.log(`   📄 Parts in first candidate: ${parts.length}`);
			console.log('');
			console.log('📋 RESPONSE PARTS BREAKDOWN:');
			console.log('─────────────────────────────────────────────────────────────────────');

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i] as any;
				console.log(`   [Part ${i + 1}]:`);

				if (part.inlineData) {
					const mimeType = part.inlineData.mimeType || 'image/png';
					const data = part.inlineData.data;
					const dataLen = data?.length || 0;

					console.log(`      Type: IMAGE`);
					console.log(`      MimeType: ${mimeType}`);
					console.log(`      Data size: ${(dataLen / 1024).toFixed(1)} KB (${dataLen} bytes)`);

					if (data && data.length > 0) {
						console.log('');
						console.log('╔══════════════════════════════════════════════════════════════════╗');
						console.log('║  🎉 SUCCESS! IMAGE GENERATED WITH REFERENCE                      ║');
						console.log('╚══════════════════════════════════════════════════════════════════╝');
						console.log(`   Total time: ${elapsedTime}s`);
						console.log(`   Output: ${mimeType}, ${(dataLen / 1024).toFixed(1)} KB`);
						console.log('═════════════════════════════════════════════════════════════════════\n');
						return { mimeType, data };
					}
				}

				if (part.text) {
					console.log(`      Type: TEXT`);
					console.log(`      Content: ${part.text.substring(0, 200)}${part.text.length > 200 ? '...' : ''}`);

					const lowerText = part.text.toLowerCase();
					if (lowerText.includes('cannot generate') || lowerText.includes('unable to')) {
						console.log('');
						console.log('❌ MODEL REFUSED TO GENERATE!');
						console.log(`   Reason: ${part.text.substring(0, 300)}`);
						console.log('═════════════════════════════════════════════════════════════════════\n');
						throw new GeminiGenerationError(`Model refused: ${part.text.substring(0, 200)}`);
					}
				}
			}

			console.log('');
			console.log('❌ ERROR: No image data found in response parts!');
			console.log('═════════════════════════════════════════════════════════════════════\n');
			throw new GeminiGenerationError('Gemini did not generate any images with reference');

		} catch (error: any) {
			const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

			console.log('');
			console.log('╔══════════════════════════════════════════════════════════════════╗');
			console.log('║  ❌ GEMINI GENERATION FAILED                                     ║');
			console.log('╚══════════════════════════════════════════════════════════════════╝');
			console.log(`   Time elapsed: ${elapsedTime}s`);
			console.log(`   Error: ${error.message}`);
			console.log('');
			console.log('🔄 Falling back to text-only generation...');
			console.log('═════════════════════════════════════════════════════════════════════\n');

			return this.generateImage(prompt, undefined, aspectRatio, resolution, userApiKey);
		}
	}

	/**
	 * Generate batch of images sequentially
	 */
	async generateBatch(prompts: string[], aspectRatio?: string, resolution?: string): Promise<GeminiImageResult[]> {
		const results: GeminiImageResult[] = [];

		for (const prompt of prompts) {
			try {
				const result = await this.generateImage(prompt, undefined, aspectRatio, resolution);
				results.push(result);
			} catch (error: any) {
				this.logger.error(`Batch generation failed for prompt: ${prompt.substring(0, 100)}...`);
				// Continue with next prompt
			}
		}

		return results;
	}

	/**
	 * 🚀 CRITICAL: Sanitize prompt to avoid PII policy violations
	 * This is essential for generating product images with models
	 */
	private sanitizePromptForImageGeneration(prompt: string): string {
		if (!prompt) return '';
		const lowerPrompt = prompt.toLowerCase();

		// If the prompt contains specific human markers (injected by PromptBuilder
		// for duo/solo shots), SKIP aggressive sanitization to preserve human descriptions.
		// These prompts intentionally describe real humans, not mannequins.
		const isPhotorealisticHumanShot =
			lowerPrompt.includes('photorealistic') ||
			lowerPrompt.includes('real human skin') ||
			lowerPrompt.includes('editorial fashion photography') ||
			lowerPrompt.includes('single child model') ||
			lowerPrompt.includes('single adult male model') ||
			lowerPrompt.includes('father and son');

		if (isPhotorealisticHumanShot) {
			// Only strip specific demographics for PII compliance, keep everything else
			let sanitized = prompt;

			// Remove demographic descriptors only
			const demographicPatterns = [
				/\b(asian|african|european|american|caucasian|hispanic)\s+(man|woman|person|model)\b/gi,
			];
			for (const pattern of demographicPatterns) {
				sanitized = sanitized.replace(pattern, 'model');
			}

			this.logger.log('Photorealistic human shot detected — skipping mannequin sanitization');
			return sanitized;
		}

		// Standard sanitization for non-human shots (flatlay, closeup, etc.)
		let sanitized = prompt;

		// Remove specific person descriptions that trigger PII
		const piiPatterns = [
			// Person descriptors
			/\b(young|old|middle-aged|elderly|teenage)\s+(man|woman|person|model|guy|girl|boy|lady|gentleman)\b/gi,
			/\b(confident|smiling|happy|serious|professional|attractive)\s+(young|old|middle-aged)?\s*(man|woman|person|model)\b/gi,
			/\b(man|woman|person|guy|girl|boy|lady)\s+(with|wearing|in)\b/gi,

			// Family relationships
			/\bfather\s+and\s+son\b/gi,
			/\bmother\s+and\s+daughter\b/gi,
			/\bparent\s+and\s+child\b/gi,
			/\bfamily\s+members?\b/gi,

			// Specific demographics
			/\b(asian|african|european|american|caucasian|hispanic)\s+(man|woman|person|model)\b/gi,

			// Age-specific
			/\b(\d+)\s*-?\s*year\s*-?\s*old\b/gi,
		];

		// Apply patterns
		for (const pattern of piiPatterns) {
			sanitized = sanitized.replace(pattern, 'professional model');
		}

		// General replacements for non-human shots
		sanitized = sanitized
			.replace(/\bperson\b/gi, 'mannequin')
			.replace(/\bpeople\b/gi, 'mannequins')
			.replace(/\bmodel wearing\b/gi, 'product shown on')
			.replace(/\bworn by\b/gi, 'displayed on')
			.replace(/\bTwo models\b/gi, 'Two mannequins')
			.replace(/\bmodels\b/gi, 'mannequins');

		// Add product-focused language if not present
		if (!sanitized.toLowerCase().includes('product') &&
			!sanitized.toLowerCase().includes('clothing') &&
			!sanitized.toLowerCase().includes('garment')) {
			sanitized = `Product photography: ${sanitized}`;
		}

		return sanitized;
	}

	/**
	 * 🆕 Analyze product images using Gemini
	 * Returns structured JSON with product details
	 */
	async analyzeProduct(input: { images: string[]; productName?: string }): Promise<AnalyzedProductJSON> {
		if (!input.images || input.images.length === 0) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		this.logger.log(`🔍 Analyzing product with ${input.images.length} images`);

		const client = this.getClient();

		// Build prompt
		let promptText = PRODUCT_ANALYSIS_PROMPT;
		if (input.productName) {
			promptText += `\n\nProduct name: ${input.productName}`;
		}

		// Build image parts
		const imageParts = await this.buildImageParts(input.images);

		try {
			// Generate content with text + images
			const response = await client.models.generateContent({
				model: this.MODEL,
				contents: [
					{
						role: 'user',
						parts: [
							{ text: promptText },
							...imageParts
						]
					}
				]
			});

			// Extract text response
			const candidate = response.candidates?.[0];
			if (!candidate || !candidate.content?.parts) {
				throw new InternalServerErrorException('No response from Gemini');
			}

			let textResponse = '';
			for (const part of candidate.content.parts) {
				if ((part as any).text) {
					textResponse += (part as any).text;
				}
			}

			// Parse JSON from response
			const parsed = this.parseJson(textResponse);
			if (!parsed) {
				this.logger.error('Failed to parse product analysis JSON', { textResponse });
				throw new InternalServerErrorException('Failed to parse product analysis');
			}

			// Add analyzed_at timestamp
			const result: AnalyzedProductJSON = {
				...parsed,
				analyzed_at: new Date().toISOString(),
			};

			this.logger.log(`✅ Product analysis complete`);
			return result;

		} catch (error: any) {
			this.logger.error(`❌ Product analysis failed: ${error.message}`);
			throw new InternalServerErrorException(`Gemini analysis error: ${error.message}`);
		}
	}

	/**
	 * Build image parts for Gemini API from URLs or file paths
	 */
	private async buildImageParts(images: string[]): Promise<any[]> {
		const parts: any[] = [];

		for (const image of images) {
			try {
				let base64Data: string;
				let mimeType = 'image/jpeg';

				// Check if it's a URL or file path
				if (image.startsWith('http://') || image.startsWith('https://')) {
					// 🔧 Check if this is our own backend URL - read locally instead of HTTP fetch
					// This fixes Docker container networking issues where container can't reach its own external IP
					const uploadBaseUrl = process.env.UPLOAD_BASE_URL || '';
					if (uploadBaseUrl && image.startsWith(uploadBaseUrl)) {
						// Extract the path after the base URL and read locally
						const relativePath = image.replace(uploadBaseUrl, '').replace(/^\/+/, '');
						const localPath = path.join(process.cwd(), relativePath);
						this.logger.log(`📂 Reading local file instead of fetch: ${localPath}`);

						if (fs.existsSync(localPath)) {
							const buffer = fs.readFileSync(localPath);
							base64Data = buffer.toString('base64');
							// Detect mime type from extension
							if (localPath.endsWith('.png')) mimeType = 'image/png';
							else if (localPath.endsWith('.webp')) mimeType = 'image/webp';
							else if (localPath.endsWith('.jpg') || localPath.endsWith('.jpeg')) mimeType = 'image/jpeg';
						} else {
							this.logger.warn(`Local file not found: ${localPath}`);
							continue;
						}
					} else {
						// Fetch from external URL
						const response = await fetch(image);
						if (!response.ok) {
							this.logger.warn(`Failed to fetch image: ${image}`);
							continue;
						}
						const buffer = Buffer.from(await response.arrayBuffer());
						base64Data = buffer.toString('base64');
						mimeType = response.headers.get('content-type') || 'image/jpeg';
					}
				} else if (image.startsWith('data:')) {
					// Base64 data URL
					const matches = image.match(/^data:([^;]+);base64,(.+)$/);
					if (matches) {
						mimeType = matches[1];
						base64Data = matches[2];
					} else {
						this.logger.warn(`Invalid data URL: ${image}`);
						continue;
					}
				} else {
					// Local file path
					if (!fs.existsSync(image)) {
						this.logger.warn(`File not found: ${image}`);
						continue;
					}
					const buffer = fs.readFileSync(image);
					base64Data = buffer.toString('base64');

					// Detect mime type from extension
					if (image.endsWith('.png')) mimeType = 'image/png';
					else if (image.endsWith('.webp')) mimeType = 'image/webp';
					else if (image.endsWith('.jpg') || image.endsWith('.jpeg')) mimeType = 'image/jpeg';
				}

				parts.push({
					inlineData: {
						mimeType,
						data: base64Data
					}
				});

				this.logger.log(`✅ Image loaded: ${image.substring(0, 100)}...`);

			} catch (error: any) {
				this.logger.error(`Failed to load image ${image}: ${error.message}`);
			}
		}

		if (parts.length === 0) {
			throw new BadRequestException('No valid images could be loaded');
		}

		return parts;
	}

	/**
	 * Parse JSON from text response (handles markdown code blocks)
	 */
	private parseJson(text: string): any {
		if (!text) return null;

		try {
			// Try direct parse first
			return JSON.parse(text);
		} catch {
			// Try to extract JSON from markdown code blocks
			const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
			if (jsonMatch) {
				try {
					return JSON.parse(jsonMatch[1]);
				} catch {
					return null;
				}
			}

			// Try to find JSON object in text
			const objectMatch = text.match(/\{[\s\S]*\}/);
			if (objectMatch) {
				try {
					return JSON.parse(objectMatch[0]);
				} catch {
					return null;
				}
			}

			return null;
		}
	}

	/**
	 * 🆕 Analyze DA Reference Image using Gemini (Fallback for Claude)
	 * Returns structured DA JSON
	 */
	async analyzeDAReference(imageUrl: string): Promise<AnalyzedDAJSON> {
		this.logger.log(`🔍 Analyzing DA Reference with Gemini (${this.ANALYSIS_MODEL})`);

		const client = this.getClient();
		const parts = await this.buildImageParts([imageUrl]);

		try {
			const response = await client.models.generateContent({
				model: this.ANALYSIS_MODEL,
				contents: [
					{
						role: 'user',
						parts: [
							{ text: DA_ANALYSIS_PROMPT },
							...parts
						]
					}
				]
			});

			const candidate = response.candidates?.[0];
			if (!candidate || !candidate.content?.parts) {
				throw new InternalServerErrorException('No response from Gemini');
			}

			let textResponse = '';
			for (const part of candidate.content.parts) {
				if ((part as any).text) {
					textResponse += (part as any).text;
				}
			}

			const parsed = this.parseJson(textResponse);
			if (!parsed) {
				this.logger.error('Failed to parse DA analysis JSON', { textResponse });
				throw new InternalServerErrorException('Failed to parse DA analysis');
			}

			// Validate structure (minimal check)
			if (!parsed.background || !parsed.lighting || !parsed.mood) {
				this.logger.warn('Parsed JSON missing required DA fields', parsed);
			}

			return {
				...parsed,
				analyzed_at: new Date().toISOString(),
			};
		} catch (error: any) {
			this.logger.error(`❌ DA Analysis failed: ${error.message}`);
			throw new InternalServerErrorException(`Gemini DA analysis error: ${error.message}`);
		}
	}

	/**
	 * Get or create Gemini client
	 * @param userApiKey - Optional user-specific API key (takes precedence over env var)
	 */
	private getClient(userApiKey?: string): GoogleGenAI {
		// If user has their own API key, create a fresh client (not cached)
		if (userApiKey && userApiKey.trim() && !userApiKey.includes('****')) {
			this.logger.log(`🔑 Using user-provided Gemini API key`);
			return new GoogleGenAI({ apiKey: userApiKey });
		}

		// Use cached default client
		if (this.client) {
			return this.client;
		}

		const apiKey = this.configService.get<string>('gemini.apiKey') || process.env.GEMINI_API_KEY;

		if (!apiKey) {
			this.logger.error('❌ GEMINI_API_KEY is missing in environment variables');
			throw new InternalServerErrorException(AIMessage.API_KEY_MISSING);
		}

		this.logger.log(`🔑 Using system Gemini API key`);
		this.logger.log(`   - Model: ${this.MODEL}`);
		this.logger.log(`   - API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);

		this.client = new GoogleGenAI({ apiKey });
		return this.client;
	}

	/**
	 * Get current API key status (masked for security)
	 */
	getApiKeyStatus(): { hasSystemKey: boolean; systemKeyMasked: string | null } {
		const apiKey = this.configService.get<string>('gemini.apiKey') || process.env.GEMINI_API_KEY;
		return {
			hasSystemKey: !!apiKey,
			systemKeyMasked: apiKey ? `${apiKey.substring(0, 10)}****${apiKey.substring(apiKey.length - 4)}` : null,
		};
	}

	/** Current Gemini model (image generation) */
	getModel(): string {
		return this.MODEL;
	}
}
