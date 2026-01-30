import {
	Injectable,
	NotFoundException,
	ForbiddenException,
	BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Collection } from '../database/entities/collection.entity';
import { Brand } from '../database/entities/brand.entity';
import {
	CreateCollectionDto,
	UpdateCollectionDto,
	FixedElementsDto,
	UpdatePromptTemplatesDto,
} from '../libs/dto';
import { NotFoundMessage, PermissionMessage, FileMessage } from '../libs/enums';
import { ClaudeService } from '../ai/claude.service';
import { GeminiService } from '../ai/gemini.service';
import { AnalyzedDAJSON, FixedElements } from '../common/interfaces/da-json.interface';
import { FilesService } from '../files/files.service';
import slugify from 'slugify';
import type { Express } from 'express';
import 'multer';

@Injectable()
export class CollectionsService {
	constructor(
		@InjectRepository(Collection)
		private collectionsRepository: Repository<Collection>,
		@InjectRepository(Brand)
		private brandsRepository: Repository<Brand>,
		private readonly claudeService: ClaudeService,
		private readonly geminiService: GeminiService,
		private readonly filesService: FilesService,
	) { }

	async create(
		userId: string,
		createCollectionDto: CreateCollectionDto,
	): Promise<Collection> {
		const brand = await this.brandsRepository.findOne({
			where: { id: createCollectionDto.brand_id },
		});

		if (!brand) {
			throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
		}

		if (brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		// Handle Code Generation
		let code = createCollectionDto.code;

		if (!code) {
			// Generate slug from name
			code = slugify(createCollectionDto.name, {
				lower: true,
				strict: true,
				trim: true,
			});
		}

		// Ensure uniqueness
		let uniqueCode = code;
		let counter = 1;

		while (true) {
			const existingCollection = await this.collectionsRepository.findOne({
				where: { code: uniqueCode },
			});

			if (!existingCollection) {
				break; // Unique found
			}

			// Append random string or simple counter to make unique
			// Using random string is safer for concurrency than just counter
			const uniqueSuffix = Math.random().toString(36).substring(2, 6);
			uniqueCode = `${code}-${uniqueSuffix}`;
			counter++;

			// Safety break to prevent infinite loops (though unlikely with random)
			if (counter > 10) {
				uniqueCode = `${code}-${Date.now()}`;
				break;
			}
		}

		const collection = this.collectionsRepository.create({
			name: createCollectionDto.name,
			code: uniqueCode,
			brand_id: createCollectionDto.brand_id,
			fixed_elements: createCollectionDto.fixed_elements || null,
			prompt_templates: createCollectionDto.prompt_templates || null,
		});

		return this.collectionsRepository.save(collection);
	}

	async findAll(userId: string): Promise<Collection[]> {
		return this.collectionsRepository.find({
			relations: ['brand'],
			where: { brand: { user_id: userId } },
			order: { created_at: 'DESC' },
		});
	}

	async findOne(id: string, userId: string): Promise<Collection> {
		const collection = await this.collectionsRepository.findOne({
			where: { id },
			relations: ['brand'],
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		if (!collection.brand || collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return collection;
	}

	async update(
		id: string,
		userId: string,
		updateCollectionDto: UpdateCollectionDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);

		if (
			updateCollectionDto.brand_id &&
			updateCollectionDto.brand_id !== collection.brand_id
		) {
			const brand = await this.brandsRepository.findOne({
				where: { id: updateCollectionDto.brand_id },
			});

			if (!brand) {
				throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
			}

			if (brand.user_id !== userId) {
				throw new ForbiddenException(PermissionMessage.NOT_OWNER);
			}

			collection.brand_id = updateCollectionDto.brand_id;
		}

		if (updateCollectionDto.name !== undefined) {
			collection.name = updateCollectionDto.name;
		}

		if (updateCollectionDto.da_reference_image_url !== undefined) {
			collection.da_reference_image_url = updateCollectionDto.da_reference_image_url;
		}

		if (updateCollectionDto.fixed_elements !== undefined) {
			collection.fixed_elements = updateCollectionDto.fixed_elements;
		}

		if (updateCollectionDto.prompt_templates !== undefined) {
			collection.prompt_templates = updateCollectionDto.prompt_templates;
		}

		return this.collectionsRepository.save(collection);
	}

	async updateFixedElements(
		id: string,
		userId: string,
		fixedElementsDto: FixedElementsDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);
		collection.fixed_elements = fixedElementsDto;
		return this.collectionsRepository.save(collection);
	}

	async updatePromptTemplates(
		id: string,
		userId: string,
		updatePromptTemplatesDto: UpdatePromptTemplatesDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);
		collection.prompt_templates = updatePromptTemplatesDto.prompt_templates;
		return this.collectionsRepository.save(collection);
	}

	async remove(id: string, userId: string): Promise<{ message: string }> {
		const collection = await this.findOne(id, userId);
		await this.collectionsRepository.remove(collection);
		return { message: 'Collection deleted successfully' };
	}

	/**
	 * STEP 2: Analyze DA reference image with Claude
	 */
	async analyzeDA(collectionId: string, userId: string, imageFile?: Express.Multer.File): Promise<AnalyzedDAJSON> {
		const collection = await this.findOne(collectionId, userId);

		// If image file provided, upload it and update da_reference_image_url first
		if (imageFile) {
			const uploadResult = await this.filesService.storeImage(imageFile);
			collection.da_reference_image_url = uploadResult.url;
			await this.collectionsRepository.save(collection);
		}

		if (!collection.da_reference_image_url) {
			throw new BadRequestException('DA reference image URL is required');
		}

		// PRIMARY: Analyze with Claude AI
		let analyzedDAJSON = await this.claudeService.analyzeDAReference(
			collection.da_reference_image_url
		);

		// 🛡️ CRITICAL: Apply brand rules normalization
		analyzedDAJSON = this.applyBrandRules(analyzedDAJSON);

		// Auto-generate fixed_elements from analyzed DA
		const fixedElements = this.generateFixedElementsFromDA(analyzedDAJSON);

		// Save to collection
		collection.analyzed_da_json = analyzedDAJSON;
		collection.fixed_elements = fixedElements;
		await this.collectionsRepository.save(collection);

		console.log('🔍 Final DA JSON being returned:', JSON.stringify(analyzedDAJSON, null, 2));

		return analyzedDAJSON;
	}

	/**
	 * 🛡️ AGGRESSIVE DATA NORMALIZATION
	 * 
	 * Ensures AI output conforms to strict schema and business rules.
	 * This is a forceful safety net that runs AFTER Claude returns JSON.
	 */
	private applyBrandRules(daJson: AnalyzedDAJSON): AnalyzedDAJSON {
		console.log('🛡️ CollectionsService: Running AGGRESSIVE Data Normalization...');

		// ═══════════════════════════════════════════════════════════
		// RULE 1: FORCE PROPS STRUCTURE (left_side / right_side)
		// ═══════════════════════════════════════════════════════════
		const rawProps = daJson.props as any;

		// Check if correct structure is missing
		const hasLeftSide = Array.isArray(rawProps?.left_side);
		const hasRightSide = Array.isArray(rawProps?.right_side);

		if (!hasLeftSide || !hasRightSide) {
			console.log('⚠️ AI returned incorrect props structure - FORCING normalization');

			// Try to salvage from 'items' array
			const items = rawProps?.items || [];
			const midpoint = Math.ceil(items.length / 2);

			(daJson as any).props = {
				left_side: hasLeftSide ? rawProps.left_side : items.slice(0, midpoint),
				right_side: hasRightSide ? rawProps.right_side : items.slice(midpoint),
			};
		}

		// CLEANUP: Remove any invalid keys that AI might have added
		const cleanProps = (daJson as any).props;
		delete cleanProps.items;
		delete cleanProps.placement;
		delete cleanProps.style;

		// ═══════════════════════════════════════════════════════════
		// RULE 2: FORCE BAREFOOT (Indoor Scene Detection)
		// ═══════════════════════════════════════════════════════════
		const backgroundStr = JSON.stringify(daJson.background || {}).toLowerCase();
		const moodStr = (daJson.mood || '').toLowerCase();
		const contextStr = backgroundStr + moodStr;

		// Expanded indoor detection keywords
		const indoorKeywords = /room|home|indoor|wall|floor|studio|bedroom|living|office|plaster|interior|apartment|wood|panel|shelf|grain|texture|parquet|laminate|tile|carpet|rug/i;
		const isIndoor = indoorKeywords.test(contextStr);

		// Defensive: Ensure styling object exists
		if (!daJson.styling) {
			(daJson as any).styling = { bottom: '', feet: '' };
		}

		if (isIndoor) {
			console.log(`⚠️ INDOOR DETECTED: Overriding footwear to BAREFOOT`);
			// FORCE BAREFOOT - overwrite ALL footwear-related keys
			(daJson.styling as any).feet = 'BAREFOOT';
			(daJson.styling as any).footwear = 'BAREFOOT';
			(daJson.styling as any).shoes = 'BAREFOOT';
		}

		// ═══════════════════════════════════════════════════════════
		// RULE 3: Default Pants (Brand Standard)
		// ═══════════════════════════════════════════════════════════
		if (!daJson.styling?.bottom) {
			(daJson.styling as any).bottom = 'Black chino pants (#1A1A1A)';
		}

		console.log('✅ CollectionsService: Normalization complete');
		console.log(`   Props: left_side=${(daJson as any).props.left_side?.length || 0}, right_side=${(daJson as any).props.right_side?.length || 0}`);
		console.log(`   Footwear: ${(daJson.styling as any).feet || (daJson.styling as any).footwear}`);

		return daJson;
	}

	/**
	 * Update DA JSON (user edits)
	 * Supports upsert behavior: creates new analyzed_da_json if it doesn't exist
	 * This enables test collections to be auto-repaired during generation flow
	 */
	async updateDAJSON(
		collectionId: string,
		userId: string,
		updates: Partial<AnalyzedDAJSON> | null,
		fixedElements?: Partial<FixedElements>
	): Promise<{ analyzed_da_json: AnalyzedDAJSON; fixed_elements: FixedElements }> {
		const collection = await this.findOne(collectionId, userId);

		// UPSERT: If no analyzed_da_json exists, create from updates (or defaults)
		if (!collection.analyzed_da_json) {
			if (!updates) {
				throw new BadRequestException('DA must be analyzed first or updates must be provided');
			}
			// Create new analyzed_da_json with defaults for missing fields
			const defaultDAJSON: AnalyzedDAJSON = {
				background: {
					color_hex: '#FFFFFF',
					color_name: 'White',
					description: 'Clean white studio background',
					texture: 'smooth',
				},
				props: {
					items: [],
					placement: 'minimal',
					style: 'modern',
				},
				mood: 'professional, clean, modern',
				lighting: {
					type: 'softbox',
					temperature: 'neutral',
					direction: 'front',
					intensity: 'medium',
				},
				composition: {
					layout: 'centered',
					poses: 'standard',
					framing: 'full body',
				},
				styling: {
					bottom: 'dark trousers',
					feet: 'white sneakers',
				},
				camera: {
					focal_length_mm: 85,
					aperture: 2.8,
					focus: 'subject',
				},
				quality: 'professional',
				analyzed_at: new Date().toISOString(),
			};
			// Merge updates into defaults
			collection.analyzed_da_json = { ...defaultDAJSON, ...updates } as AnalyzedDAJSON;

			// Auto-generate fixed_elements if not provided
			if (!fixedElements) {
				collection.fixed_elements = this.generateFixedElementsFromDA(collection.analyzed_da_json as AnalyzedDAJSON);
			}
		} else if (updates) {
			// Merge updates into existing analyzed_da_json
			collection.analyzed_da_json = {
				...collection.analyzed_da_json,
				...updates,
				// Deep merge nested objects
				background: updates.background
					? { ...collection.analyzed_da_json.background, ...updates.background }
					: collection.analyzed_da_json.background,
				props: updates.props
					? { ...collection.analyzed_da_json.props, ...updates.props }
					: collection.analyzed_da_json.props,
				lighting: updates.lighting
					? { ...collection.analyzed_da_json.lighting, ...updates.lighting }
					: collection.analyzed_da_json.lighting,
				composition: updates.composition
					? { ...collection.analyzed_da_json.composition, ...updates.composition }
					: collection.analyzed_da_json.composition,
				styling: updates.styling
					? { ...collection.analyzed_da_json.styling, ...updates.styling }
					: collection.analyzed_da_json.styling,
				camera: updates.camera
					? { ...collection.analyzed_da_json.camera, ...updates.camera }
					: collection.analyzed_da_json.camera,
			} as AnalyzedDAJSON;
		}

		// Update fixed_elements
		if (fixedElements) {
			collection.fixed_elements = {
				...(collection.fixed_elements || {}),
				...fixedElements,
			} as FixedElements;
		}

		await this.collectionsRepository.save(collection);

		return {
			analyzed_da_json: collection.analyzed_da_json as AnalyzedDAJSON,
			fixed_elements: collection.fixed_elements as FixedElements,
		};
	}

	/**
	 * Get collection with full DA data
	 */
	async getWithDA(collectionId: string, userId: string): Promise<Collection> {
		return this.findOne(collectionId, userId);
	}

	/**
	 * Get all collections for brand
	 */
	async findByBrand(brandId: string, userId: string): Promise<Collection[]> {
		const brand = await this.brandsRepository.findOne({
			where: { id: brandId },
		});

		if (!brand) {
			throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
		}

		if (brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return this.collectionsRepository.find({
			where: { brand_id: brandId },
			order: { created_at: 'DESC' },
		});
	}

	/**
	 * Generate fixed_elements from analyzed DA JSON
	 */
	private generateFixedElementsFromDA(daJSON: AnalyzedDAJSON): FixedElements {
		return {
			background: {
				wall_hex: daJSON.background.color_hex,
				wall_description: daJSON.background.description,
				floor_hex: daJSON.background.color_hex, // Default to same as wall, can be overridden
				floor_description: daJSON.background.description,
			},
			props: {
				left: daJSON.props.items.slice(0, Math.ceil(daJSON.props.items.length / 2)),
				right: daJSON.props.items.slice(Math.ceil(daJSON.props.items.length / 2)),
				center: [],
			},
			styling: {
				bottom: daJSON.styling.bottom,
				feet: daJSON.styling.feet,
			},
			lighting: daJSON.lighting.type,
			mood: daJSON.mood,
			composition_defaults: {
				duo: daJSON.composition.layout,
				solo: daJSON.composition.layout,
			},
		};
	}
}
