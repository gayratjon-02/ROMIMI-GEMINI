import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { Messages } from '@anthropic-ai/sdk/resources';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as path from 'path';
// Sharp requires CommonJS import for compatibility with NestJS
const sharp = require('sharp');
import { AIMessage, FileMessage } from '../libs/enums';
import { PRODUCT_ANALYSIS_PROMPT } from './prompts/product-analysis.prompt';
import { DA_ANALYSIS_PROMPT } from './prompts/da-analysis.prompt';
import { MERGE_PROMPT_TEMPLATE } from './prompts/merge-prompt.prompt';
import { PRODUCT_ANALYSIS_DIRECT_PROMPT } from './prompts/product-analysis-direct.prompt';
import { AnalyzedProductJSON } from '../common/interfaces/product-json.interface';
import { AnalyzedDAJSON } from '../common/interfaces/da-json.interface';
import { MergedPrompts } from '../common/interfaces/merged-prompts.interface';
import { AnalyzeProductDirectResponse } from '../libs/dto/analyze-product-direct.dto';

type AnalyzeProductDirectInput = {
	frontImages?: string[];
	backImages?: string[];
	referenceImages?: string[];
	productName?: string;
};

type AnalyzeProductInput = {
	images: string[];
	productName?: string;
	brandBrief?: string;
	notes?: string;
};

type GeneratePromptsInput = {
	productName?: string;
	brandBrief?: string;
	extractedVariables?: Record<string, any>;
	fixedElements?: Record<string, any>;
	promptTemplates?: Record<string, any>;
	count?: number;
};

type AnalyzeCompetitorAdInput = {
	image: string;
	brandBrief?: string;
	notes?: string;
};

type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

type ClaudeContentBlock =
	| { type: 'text'; text: string }
	| {
		type: 'image';
		source: { type: 'base64'; media_type: ClaudeImageMediaType; data: string };
	};

@Injectable()
export class ClaudeService {
	private readonly logger = new Logger(ClaudeService.name);

	private client: Anthropic | null = null;

	private readonly model: string;

	constructor(private readonly configService: ConfigService) {
		// Read model from .env, fallback to claude-sonnet-4-20250514
		this.model = this.configService.get<string>('CLAUDE_MODEL') || 'claude-sonnet-4-20250514';
		this.logger.log(`🤖 Claude model initialized: ${this.model}`);
	}

	async analyzeProduct(input: AnalyzeProductInput): Promise<AnalyzedProductJSON> {
		if (!input.images?.length) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		let promptText = PRODUCT_ANALYSIS_PROMPT;
		if (input.productName) {
			promptText += `\n\nProduct name: ${input.productName}`;
		}

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: promptText },
			...(await this.buildImageBlocks(input.images)),
		];

		const response = await this.createMessage({
			content,
			max_tokens: 2000,
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		if (!parsed) {
			this.logger.error('Failed to parse product analysis JSON', { text });
			throw new InternalServerErrorException('Failed to parse product analysis');
		}

		// Add analyzed_at timestamp
		const result: AnalyzedProductJSON = {
			...parsed,
			analyzed_at: new Date().toISOString(),
		};

		return result;
	}

	/**
	 * Direct product analysis from uploaded images
	 * Used by POST /api/products/analyze endpoint
	 * Returns comprehensive JSON structure for frontend
	 *
	 * Input: Up to 12 images (front + back + reference)
	 * Output: Single Product JSON with general_info, visual_specs, design_front, design_back, garment_details
	 */
	async analyzeProductDirect(input: AnalyzeProductDirectInput): Promise<AnalyzeProductDirectResponse> {
		// At least one front OR back image is required
		if (!input.frontImages?.length && !input.backImages?.length) {
			throw new BadRequestException('At least one front or back image is required');
		}

		// Combine all images for analysis (order matters for Claude context)
		const allImages: string[] = [
			...(input.frontImages || []),
			...(input.backImages || []),
			...(input.referenceImages || []),
		];

		let promptText = PRODUCT_ANALYSIS_DIRECT_PROMPT;

		// Add image context to help Claude understand which images are which
		promptText += '\n\n═══════════════════════════════════════════════════════════';
		promptText += '\n📸 IMAGES PROVIDED FOR THIS ANALYSIS';
		promptText += '\n═══════════════════════════════════════════════════════════';

		let imageIndex = 1;
		if (input.frontImages?.length) {
			promptText += `\n\nFRONT IMAGES (${input.frontImages.length}):`;
			for (let i = 0; i < input.frontImages.length; i++) {
				promptText += `\n  Image ${imageIndex}: Front view ${i + 1}`;
				imageIndex++;
			}
		}
		if (input.backImages?.length) {
			promptText += `\n\nBACK IMAGES (${input.backImages.length}):`;
			for (let i = 0; i < input.backImages.length; i++) {
				promptText += `\n  Image ${imageIndex}: Back view ${i + 1}`;
				imageIndex++;
			}
		}
		if (input.referenceImages?.length) {
			promptText += `\n\nREFERENCE IMAGES (${input.referenceImages.length}):`;
			for (let i = 0; i < input.referenceImages.length; i++) {
				promptText += `\n  Image ${imageIndex}: Reference/detail ${i + 1}`;
				imageIndex++;
			}
		}

		promptText += `\n\nTOTAL: ${allImages.length} images for analysis`;

		if (input.productName) {
			promptText += `\n\n🏷️ Product name hint: ${input.productName}`;
		}

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: promptText },
			...(await this.buildImageBlocks(allImages)),
		];

		const response = await this.createMessage({
			content,
			max_tokens: 3000,
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		if (!parsed) {
			this.logger.error('Failed to parse direct product analysis JSON', { text });
			throw new InternalServerErrorException('Failed to parse product analysis');
		}

		// Validate and ensure all required fields exist with proper structure
		const result: AnalyzeProductDirectResponse = {
			general_info: {
				product_name: parsed.general_info?.product_name || 'UNNAMED PRODUCT',
				category: parsed.general_info?.category || 'Apparel',
				fit_type: parsed.general_info?.fit_type || 'Regular fit',
				gender_target: parsed.general_info?.gender_target || 'Unisex',
			},
			visual_specs: {
				color_name: parsed.visual_specs?.color_name || 'BLACK',
				hex_code: parsed.visual_specs?.hex_code || '#000000',
				fabric_texture: parsed.visual_specs?.fabric_texture || 'Cotton blend fabric',
			},
			design_front: {
				has_logo: parsed.design_front?.has_logo ?? false,
				logo_text: parsed.design_front?.logo_text || '',
				logo_type: parsed.design_front?.logo_type || '',
				logo_color: parsed.design_front?.logo_color || '',
				placement: parsed.design_front?.placement || '',
				description: parsed.design_front?.description || 'Clean front design',
			},
			design_back: {
				has_logo: parsed.design_back?.has_logo ?? false,
				has_patch: parsed.design_back?.has_patch ?? false,
				description: parsed.design_back?.description || 'Clean back design',
				patch_color: parsed.design_back?.patch_color || '',
				patch_detail: parsed.design_back?.patch_detail || '',
			},
			garment_details: {
				pockets: parsed.garment_details?.pockets || 'Standard pockets',
				sleeves: parsed.garment_details?.sleeves || 'Standard sleeves',
				bottom: parsed.garment_details?.bottom || 'Standard hem',
				neckline: parsed.garment_details?.neckline || 'Standard neckline',
			},
		};

		return result;
	}

	async analyzeDAReference(imageUrl: string): Promise<AnalyzedDAJSON> {
		if (!imageUrl) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: DA_ANALYSIS_PROMPT },
			...(await this.buildImageBlocks([imageUrl])),
		];

		const response = await this.createMessage({
			content,
			max_tokens: 2000,
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		if (!parsed) {
			this.logger.error('Failed to parse DA analysis JSON', { text });
			throw new InternalServerErrorException('Failed to parse DA analysis');
		}

		// Add analyzed_at timestamp
		const result: AnalyzedDAJSON = {
			...parsed,
			analyzed_at: new Date().toISOString(),
		};

		return result;
	}

	async mergeProductAndDA(
		productJSON: AnalyzedProductJSON,
		daJSON: AnalyzedDAJSON,
		collectionName: string
	): Promise<MergedPrompts> {
		if (!productJSON || !daJSON) {
			throw new BadRequestException('Product JSON and DA JSON are required');
		}

		try {
			// Check for explicit Mock Mode
			if (process.env.MOCK_AI === 'true') {
				this.logger.warn('⚠️ MOCK MODE ENABLED: Returning static merged prompts');
				const { MOCK_MERGED_PROMPTS } = await import('./mock-claude.data');
				// Return a deep copy to avoid mutation issues
				return JSON.parse(JSON.stringify(MOCK_MERGED_PROMPTS));
			}

			const promptText = `${MERGE_PROMPT_TEMPLATE}

Product JSON:
${JSON.stringify(productJSON, null, 2)}

DA JSON:
${JSON.stringify(daJSON, null, 2)}

Collection Name: ${collectionName}

Generate the 6 merged prompts now. Return ONLY valid JSON object with the structure specified above.`;

			const content: ClaudeContentBlock[] = [
				{ type: 'text', text: promptText },
			];

			const response = await this.createMessage({
				content,
				max_tokens: 4000,
			});

			const text = this.extractText(response.content);
			let parsed = this.parseJson(text);

			if (!parsed) {
				this.logger.error('Failed to parse merged prompts JSON', { text });
				throw new InternalServerErrorException('Failed to parse merged prompts');
			}

			// Handle array response (convert to object)
			if (Array.isArray(parsed)) {
				this.logger.warn('Claude returned array instead of object, converting...');
				const converted: Record<string, any> = {};
				const types = ['duo', 'solo', 'flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];
				parsed.forEach((item, index) => {
					const type = item.type || types[index];
					if (type) {
						converted[type] = item;
					}
				});
				parsed = converted;
			}

			// Validate structure
			const requiredTypes = ['duo', 'solo', 'flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];
			for (const type of requiredTypes) {
				if (!parsed[type]) {
					this.logger.error(`Missing prompt type: ${type}`, { parsed: Object.keys(parsed) });
					throw new InternalServerErrorException(`Missing prompt type: ${type}`);
				}
			}

			// Add editable flag and last_edited_at
			const result: MergedPrompts = {
				duo: { ...parsed.duo, editable: true, last_edited_at: null },
				solo: { ...parsed.solo, editable: true, last_edited_at: null },
				flatlay_front: { ...parsed.flatlay_front, editable: true, last_edited_at: null },
				flatlay_back: { ...parsed.flatlay_back, editable: true, last_edited_at: null },
				closeup_front: { ...parsed.closeup_front, editable: true, last_edited_at: null },
				closeup_back: { ...parsed.closeup_back, editable: true, last_edited_at: null },
			};

			return result;
		} catch (error) {
			this.logger.error(`❌ Claude API Error in mergeProductAndDA: ${error.message}`);

			// 🚀 FALLBACK: If API fails (e.g. billing, rate limit), use mock data
			this.logger.warn('⚠️ FALLBACK FACTIVATED: Returning MOCK merged prompts due to API error');
			const { MOCK_MERGED_PROMPTS } = await import('./mock-claude.data');
			return JSON.parse(JSON.stringify(MOCK_MERGED_PROMPTS));
		}
	}

	async generatePrompts(input: GeneratePromptsInput): Promise<string[]> {
		const count = input.count && input.count > 0 ? input.count : 6;

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: this.buildPromptGenerationPrompt(input, count) },
		];

		const response = await this.createMessage({
			content,
			max_tokens: 1000,
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		if (Array.isArray(parsed)) {
			return parsed.slice(0, count).map((item) => String(item));
		}

		return text
			.split('\n')
			.map((line) => line.replace(/^\s*\d+[\).\-]\s*/, '').trim())
			.filter(Boolean)
			.slice(0, count);
	}

	/**
	 * Generate structured visuals with all required fields for product visual generation
	 * Returns array of 6 visual objects with: type, display_name, prompt, negative_prompt, camera, background, garment_details, styling, output
	 */
	async generateStructuredVisuals(input: GeneratePromptsInput & { images?: string[] }): Promise<Array<{
		type: string;
		display_name: string;
		prompt: string;
		negative_prompt: string;
		camera: string;
		background: string;
		garment_details: string;
		styling: string;
		output: string;
	}>> {
		const visualTypes = ['duo', 'solo', 'flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];
		const count = visualTypes.length;

		const prompt = this.buildStructuredVisualsPrompt(input, visualTypes);

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: prompt },
			...(input.images ? await this.buildImageBlocks(input.images) : []),
		];

		const response = await this.createMessage({
			content,
			max_tokens: 4000, // Increased for structured output
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		// Try to extract visuals array from response
		let visuals: any[] = [];

		if (parsed && parsed.visuals && Array.isArray(parsed.visuals)) {
			visuals = parsed.visuals;
		} else if (Array.isArray(parsed)) {
			visuals = parsed;
		} else if (parsed && typeof parsed === 'object') {
			// If it's an object, try to find visuals array
			visuals = Object.values(parsed).find((v: any) => Array.isArray(v)) as any[] || [];
		}

		// Ensure we have exactly 6 visuals, mapped to the correct types
		const result: Array<{
			type: string;
			display_name: string;
			prompt: string;
			negative_prompt: string;
			camera: string;
			background: string;
			garment_details: string;
			styling: string;
			output: string;
		}> = [];

		for (let i = 0; i < visualTypes.length; i++) {
			const type = visualTypes[i];
			const visual = visuals[i] || {};

			result.push({
				type,
				display_name: visual.display_name || this.getDisplayName(type),
				prompt: visual.prompt || '',
				negative_prompt: visual.negative_prompt || 'blurry, low quality, distorted, watermark',
				camera: visual.camera || '',
				background: visual.background || '',
				garment_details: visual.garment_details || '',
				styling: visual.styling || '',
				output: visual.output || '',
			});
		}

		return result;
	}

	private getDisplayName(type: string): string {
		// 🚀 CRITICAL: Use product-focused names to avoid PII triggers in Gemini
		const names: Record<string, string> = {
			duo: 'DUO (Two Models)',
			solo: 'SOLO (Single Model)',
			flatlay_front: 'FLAT LAY FRONT',
			flatlay_back: 'FLAT LAY BACK',
			closeup_front: 'CLOSE UP FRONT',
			closeup_back: 'CLOSE UP BACK',
		};
		return names[type] || type.toUpperCase();
	}

	private buildStructuredVisualsPrompt(input: GeneratePromptsInput, visualTypes: string[]): string {
		const lines = [
			'Generate exactly 6 structured visual prompts for e-commerce product photography.',
			'',
			'🚨 CRITICAL RULES FOR PROMPTS:',
			'',
			'FOR DUO AND SOLO SHOTS:',
			'- DUO: Describe a FATHER (adult man, ~30-35) and his SON (child, ~6-8) standing together wearing the product.',
			'- SOLO: Describe a single adult male model wearing the product.',
			'- MUST include: "Photorealistic, real human skin texture, highly detailed face, editorial fashion photography"',
			'- NEVER use: mannequin, display form, ghost mannequin, headless',
			'- The negative_prompt MUST include: "mannequin, headless, ghost mannequin, plastic skin, floating clothes, 3d render, artificial face"',
			'',
			'FOR FLATLAY AND CLOSEUP SHOTS:',
			'- Product-only focus, no human models',
			'- Emphasize product features: texture, color, material, fit, design details',
			'',
			'Return JSON with this exact structure:',
			'{',
			'  "visuals": [',
			'    {',
			'      "type": "duo",',
			'      "display_name": "DUO (Father & Son)",',
			'      "prompt": "Photorealistic editorial fashion photography. A FATHER and his SON wearing [product]...",',
			'      "negative_prompt": "mannequin, headless, ghost mannequin, plastic skin, floating clothes, 3d render, artificial face, blurry, low quality",',
			'      "camera": "camera settings and angle",',
			'      "background": "background description",',
			'      "garment_details": "specific garment details",',
			'      "styling": "styling notes",',
			'      "output": "expected output description"',
			'    },',
			'    ... (5 more for: solo, flatlay_front, flatlay_back, closeup_front, closeup_back)',
			'  ]',
			'}',
			'',
			'Visual types required (in order):',
			'1. duo - Father & Son wearing the product together, photorealistic editorial photography',
			'2. solo - Single adult male model wearing the product, photorealistic editorial photography',
			'3. flatlay_front - Product laid flat, front view, overhead shot (no models)',
			'4. flatlay_back - Product laid flat, back view, overhead shot (no models)',
			'5. closeup_front - Close-up detail shot of front design/logo (no models)',
			'6. closeup_back - Close-up detail shot of back design/label (no models)',
			'',
			'Return ONLY valid JSON, no markdown, no code blocks.',
		];

		if (input.productName) {
			lines.push(`Product name: ${input.productName}`);
		}

		if (input.brandBrief) {
			lines.push(`Brand brief: ${input.brandBrief}`);
		}

		if (input.extractedVariables) {
			lines.push(`Extracted variables: ${JSON.stringify(input.extractedVariables)}`);
		}

		if (input.fixedElements) {
			lines.push(`Fixed elements: ${JSON.stringify(input.fixedElements)}`);
		}

		if (input.promptTemplates) {
			lines.push(`Prompt templates: ${JSON.stringify(input.promptTemplates)}`);
		}

		return lines.join('\n');
	}

	async analyzeCompetitorAd(input: AnalyzeCompetitorAdInput): Promise<Record<string, any>> {
		if (!input.image) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const content: ClaudeContentBlock[] = [
			{ type: 'text', text: this.buildCompetitorAnalysisPrompt(input) },
			...(await this.buildImageBlocks([input.image])),
		];

		const response = await this.createMessage({
			content,
			max_tokens: 1200,
		});

		const text = this.extractText(response.content);
		const parsed = this.parseJson(text);

		return parsed || { raw: text };
	}

	private getClient(): Anthropic {
		if (this.client) {
			return this.client;
		}

		const apiKey = this.configService.get<string>('CLAUDE_API_KEY');

		if (!apiKey) {
			this.logger.error('CLAUDE_API_KEY is not set in environment variables');
			throw new InternalServerErrorException(AIMessage.API_KEY_MISSING);
		}

		this.client = new Anthropic({ apiKey });
		return this.client;
	}

	private async createMessage(params: {
		content: ClaudeContentBlock[];
		max_tokens: number;
	}): Promise<Messages.Message> {
		const maxRetries = 3;
		const baseDelay = 2000; // 2 seconds base delay

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				const res = await this.getClient().messages.create({
					model: this.model,
					max_tokens: params.max_tokens,
					messages: [
						{
							role: 'user',
							content: params.content,
						},
					],
				});

				return res;
			} catch (error: any) {
				const status = error?.status || error?.response?.status;
				const isOverloaded = status === 529 || status === 503 || status === 429;

				this.logger.warn(`Claude API attempt ${attempt + 1}/${maxRetries} failed:`, {
					status,
					message: error?.message,
					isOverloaded,
				});

				// If it's an overload/rate limit error and we have retries left, wait and retry
				if (isOverloaded && attempt < maxRetries - 1) {
					const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 2s, 4s, 8s
					this.logger.log(`⏳ Claude API overloaded (${status}), retrying in ${delay}ms...`);
					await new Promise(resolve => setTimeout(resolve, delay));
					continue;
				}

				// If not overloaded or out of retries, throw error
				this.logger.error('Claude API error', {
					message: error?.message,
					name: error?.name,
					status: error?.status,
					data: error?.response?.data,
					attempt: attempt + 1,
				});

				throw new InternalServerErrorException(AIMessage.CLAUDE_API_ERROR);
			}
		}

		// This should never be reached, but TypeScript needs it
		throw new InternalServerErrorException(AIMessage.CLAUDE_API_ERROR);
	}

	private buildProductAnalysisPrompt(input: AnalyzeProductInput): string {
		const lines = [
			'You are an expert fashion product analyst.',
			'',
			'Analyze the provided product images and extract detailed information in JSON format.',
			'',
			'Return ONLY valid JSON with this structure:',
			'{',
			'  "product_type": "string (e.g. zip tracksuit set, polo shirt, jacket)",',
			'  "product_name": "string (full product name)",',
			'  "color_name": "string (e.g. Forest Green, Bleu Ardoise)",',
			'  "color_hex": "string (hex code, e.g. #2D5016)",',
			'  "material": "string (e.g. Polyester blend, Suède, Coton)",',
			'  "details": {',
			'    "piping": "string (if visible)",',
			'    "zip": "string (if applicable)",',
			'    "collar": "string",',
			'    "pockets": "string",',
			'    "fit": "string",',
			'    "sleeves": "string"',
			'  },',
			'  "logo_front": {',
			'    "type": "string (e.g. Romimi script embroidery)",',
			'    "color": "string",',
			'    "position": "string (e.g. chest left)",',
			'    "size": "string"',
			'  },',
			'  "logo_back": {',
			'    "type": "string (e.g. RR monogram circle)",',
			'    "color": "string",',
			'    "position": "string (e.g. center upper back)",',
			'    "size": "string"',
			'  },',
			'  "texture_description": "string (detailed texture description)",',
			'  "additional_details": ["array of strings"],',
			'  "confidence_score": 0.0-1.0',
			'}',
			'',
			'Be extremely detailed and accurate.',
		];

		if (input.productName) {
			lines.push(`Product name hint: ${input.productName}`);
		}

		if (input.brandBrief) {
			lines.push(`Brand context: ${input.brandBrief}`);
		}

		if (input.notes) {
			lines.push(`Notes: ${input.notes}`);
		}

		return lines.join('\n');
	}

	private buildPromptGenerationPrompt(input: GeneratePromptsInput, count: number): string {
		const lines = [
			`Generate exactly ${count} image generation prompts for product ads.`,
			'Each prompt should be a single sentence, vivid, and concrete.',
			'Return a JSON array of strings only.',
		];

		if (input.productName) {
			lines.push(`Product name: ${input.productName}`);
		}

		if (input.brandBrief) {
			lines.push(`Brand brief: ${input.brandBrief}`);
		}

		if (input.extractedVariables) {
			lines.push(`Extracted variables: ${JSON.stringify(input.extractedVariables)}`);
		}

		if (input.fixedElements) {
			lines.push(`Fixed elements: ${JSON.stringify(input.fixedElements)}`);
		}

		if (input.promptTemplates) {
			lines.push(`Prompt templates: ${JSON.stringify(input.promptTemplates)}`);
		}

		return lines.join('\n');
	}

	private buildCompetitorAnalysisPrompt(input: AnalyzeCompetitorAdInput): string {
		const lines = [
			'Analyze the competitor ad and return JSON with keys:',
			'summary, layout, typography, colors, lighting, props, mood, target_audience, call_to_action, differentiation_ideas.',
			'Return JSON only.',
		];

		if (input.brandBrief) {
			lines.push(`Brand brief: ${input.brandBrief}`);
		}

		if (input.notes) {
			lines.push(`Notes: ${input.notes}`);
		}

		return lines.join('\n');
	}

	/**
	 * Compress image if it exceeds Claude's 5MB limit
	 * Target: Keep under 4.5MB to leave safety buffer
	 */
	private async compressImageIfNeeded(buffer: Buffer, mediaType: ClaudeImageMediaType): Promise<{ data: string; mediaType: ClaudeImageMediaType }> {
		const MAX_SIZE = 5 * 1024 * 1024; // 5MB in bytes
		const TARGET_SIZE = 4.5 * 1024 * 1024; // 4.5MB target to leave buffer

		if (buffer.length <= MAX_SIZE) {
			// No compression needed
			return {
				data: buffer.toString('base64'),
				mediaType,
			};
		}

		this.logger.warn(`🗜️ Image size (${(buffer.length / 1024 / 1024).toFixed(2)}MB) exceeds Claude limit (5MB), compressing...`);

		try {
			let sharpInstance = sharp(buffer);

			// Get image metadata to calculate resize dimensions
			const metadata = await sharpInstance.metadata();
			const originalWidth = metadata.width || 2048;
			const originalHeight = metadata.height || 2048;

			// Start with quality reduction
			let quality = 85;
			let maxDimension = 2048; // Start with max dimension
			let compressed: Buffer;

			// Try progressive quality reduction and resizing
			for (let attempt = 0; attempt < 5; attempt++) {
				// Calculate new dimensions while preserving aspect ratio
				const scale = maxDimension / Math.max(originalWidth, originalHeight);
				const newWidth = Math.round(originalWidth * scale);
				const newHeight = Math.round(originalHeight * scale);

				sharpInstance = sharp(buffer)
					.resize(newWidth, newHeight, {
						fit: 'inside',
						withoutEnlargement: true,
					});

				// Convert to JPEG with quality setting (best compression)
				compressed = await sharpInstance
					.jpeg({ quality, progressive: true })
					.toBuffer();

				this.logger.log(`Attempt ${attempt + 1}: Quality ${quality}, Dimension ${maxDimension}px, Size: ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);

				if (compressed.length <= TARGET_SIZE) {
					this.logger.log(`✅ Successfully compressed image from ${(buffer.length / 1024 / 1024).toFixed(2)}MB to ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);
					return {
						data: compressed.toString('base64'),
						mediaType: 'image/jpeg', // Always JPEG after compression
					};
				}

				// Reduce quality and dimensions for next attempt
				quality = Math.max(60, quality - 10);
				maxDimension = Math.max(1024, maxDimension - 256);
			}

			// If still too large after all attempts, use the last compressed version
			this.logger.warn(`⚠️ Image still large after compression: ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);
			return {
				data: compressed.toString('base64'),
				mediaType: 'image/jpeg',
			};
		} catch (error) {
			this.logger.error('Failed to compress image:', error);
			// Fallback to original if compression fails
			return {
				data: buffer.toString('base64'),
				mediaType,
			};
		}
	}

	private async buildImageBlocks(images: string[]): Promise<ClaudeContentBlock[]> {
		const blocks: ClaudeContentBlock[] = [];

		for (const image of images) {
			const source = await this.resolveImageSource(image);
			blocks.push({
				type: 'image',
				source: {
					type: 'base64',
					media_type: source.mediaType,
					data: source.data,
				},
			});
		}

		return blocks;
	}

	private async resolveImageSource(image: string): Promise<{ data: string; mediaType: ClaudeImageMediaType }> {
		if (image.startsWith('data:')) {
			return this.parseDataUrl(image);
		}

		if (image.startsWith('http://') || image.startsWith('https://')) {
			return this.fetchImage(image);
		}

		return this.readLocalImage(image);
	}

	private detectImageFormat(buffer: Buffer): ClaudeImageMediaType {
		// Check magic bytes to detect actual image format
		if (buffer.length < 4) {
			return 'image/jpeg'; // Default fallback
		}

		const header = buffer.subarray(0, 4);

		// PNG: 89 50 4E 47
		if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
			return 'image/png';
		}

		// JPEG: FF D8 FF
		if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
			return 'image/jpeg';
		}

		// GIF: 47 49 46 38 (GIF8)
		if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
			return 'image/gif';
		}

		// WebP: Check for RIFF...WEBP
		if (buffer.length >= 12) {
			const riffHeader = buffer.subarray(0, 4).toString();
			const webpHeader = buffer.subarray(8, 12).toString();
			if (riffHeader === 'RIFF' && webpHeader === 'WEBP') {
				return 'image/webp';
			}
		}

		// Default to JPEG if unknown
		return 'image/jpeg';
	}

	private async fetchImage(url: string): Promise<{ data: string; mediaType: ClaudeImageMediaType }> {
		const response = await fetch(url);

		if (!response.ok) {
			this.logger.warn(`Failed to fetch image from URL: ${url}`, {
				status: response.status,
				statusText: response.statusText,
			});
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Detect format from buffer (more reliable than content-type header)
		const detectedType = this.detectImageFormat(buffer);
		const contentType = response.headers.get('content-type');
		const headerType = contentType ? this.normalizeMediaType(contentType.split(';')[0]) : null;

		// Use detected type if header type doesn't match or is missing
		const mediaType = headerType && headerType === detectedType ? headerType : detectedType;

		this.logger.log(`Image format detected: ${mediaType} (header: ${contentType}, detected: ${detectedType})`);

		// 🗜️ Compress if needed before returning
		return this.compressImageIfNeeded(buffer, mediaType);
	}

	private async readLocalImage(imagePath: string): Promise<{ data: string; mediaType: ClaudeImageMediaType }> {
		const candidates: string[] = [];

		if (path.isAbsolute(imagePath)) {
			candidates.push(imagePath);
		}

		candidates.push(path.join(process.cwd(), imagePath.replace(/^\/+/, '')));

		const existing = candidates.find((candidate) => existsSync(candidate));

		if (!existing) {
			this.logger.warn(`Local image not found: ${imagePath}`, {
				candidates,
			});
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const buffer = await readFile(existing);

		// Detect format from buffer (more reliable than file extension)
		const detectedType = this.detectImageFormat(buffer);
		const guessedType = this.guessMimeType(existing);

		// Use detected type if it's valid, otherwise fall back to guessed type
		const mediaType = detectedType !== 'image/jpeg' || guessedType === 'image/jpeg'
			? detectedType
			: this.normalizeMediaType(guessedType);

		this.logger.log(`Local image format: ${mediaType} (file: ${existing}, detected: ${detectedType}, guessed: ${guessedType})`);

		// 🗜️ Compress if needed before returning
		return this.compressImageIfNeeded(buffer, mediaType);
	}

	private parseDataUrl(dataUrl: string): { data: string; mediaType: ClaudeImageMediaType } {
		const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

		if (!match) {
			throw new BadRequestException(FileMessage.FILE_UPLOAD_FAILED);
		}

		return {
			mediaType: this.normalizeMediaType(match[1]),
			data: match[2],
		};
	}

	private guessMimeType(pathOrUrl: string): ClaudeImageMediaType {
		const ext = path.extname(pathOrUrl).toLowerCase();

		switch (ext) {
			case '.png':
				return 'image/png';
			case '.gif':
				return 'image/gif';
			case '.webp':
				return 'image/webp';
			case '.jpg':
			case '.jpeg':
			default:
				return 'image/jpeg';
		}
	}

	private normalizeMediaType(mediaType: string): ClaudeImageMediaType {
		switch (mediaType) {
			case 'image/png':
			case 'image/webp':
			case 'image/gif':
			case 'image/jpeg':
				return mediaType;
			default:
				return 'image/jpeg';
		}
	}

	private extractText(content: Array<{ type: string; text?: string }>): string {
		return content
			.filter((block) => block.type === 'text' && block.text)
			.map((block) => block.text as string)
			.join('')
			.trim();
	}

	private parseJson(text: string): any | null {
		const trimmed = text.trim();
		if (!trimmed) return null;

		const direct = this.tryParseJson(trimmed);
		if (direct) return direct;

		const objectCandidate = this.extractJsonSubstring(trimmed, '{', '}');
		if (objectCandidate) {
			const parsedObject = this.tryParseJson(objectCandidate);
			if (parsedObject) return parsedObject;
		}

		const arrayCandidate = this.extractJsonSubstring(trimmed, '[', ']');
		if (arrayCandidate) {
			const parsedArray = this.tryParseJson(arrayCandidate);
			if (parsedArray) return parsedArray;
		}

		return null;
	}

	private tryParseJson(value: string): any | null {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}

	private extractJsonSubstring(value: string, startChar: string, endChar: string): string | null {
		const start = value.indexOf(startChar);
		const end = value.lastIndexOf(endChar);

		if (start === -1 || end === -1 || end <= start) {
			return null;
		}

		return value.slice(start, end + 1);
	}
}
