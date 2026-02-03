import {
	Injectable,
	NotFoundException,
	ForbiddenException,
	BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';
import { Generation } from '../database/entities/generation.entity';
import { ClaudeService } from '../ai/claude.service';
import { CreateProductDto, UpdateProductDto } from '../libs/dto';
import {
	FileMessage,
	NotFoundMessage,
	PermissionMessage,
} from '../libs/enums';
import { AnalyzedProductJSON } from '../common/interfaces/product-json.interface';
import { AnalyzeProductDirectResponse } from '../libs/dto/analyze/analyze-product-direct.dto';

@Injectable()
export class ProductsService {
	constructor(
		@InjectRepository(Product)
		private productsRepository: Repository<Product>,
		@InjectRepository(Collection)
		private collectionsRepository: Repository<Collection>,
		@InjectRepository(Generation)
		private generationsRepository: Repository<Generation>,
		private readonly claudeService: ClaudeService,
	) { }


	// start****************************************************
	// create product
	async create(userId: string, createProductDto: CreateProductDto): Promise<Product> {


		// validate collection
		const collection = await this.collectionsRepository.findOne({
			where: { id: createProductDto.collection_id },
			relations: ['brand'],
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		if (!collection.brand || collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}
		const result = {
			name: createProductDto.name,
			collection_id: createProductDto.collection_id,
			brand_id: collection.brand.id,
			user_id: userId,
			front_image_url: createProductDto.front_image_url ?? null,
			back_image_url: createProductDto.back_image_url ?? null,
			reference_images: createProductDto.reference_images?.length
				? createProductDto.reference_images
				: null,
		}
		console.log("RESULT", result);

		const product = this.productsRepository.create(result);
		console.log("PRODUCT", product);

		return this.productsRepository.save(product);
	}


	
	async findAll(
		userId: string,
		filters: { collection_id?: string; page?: number; limit?: number },
	): Promise<{ items: Product[]; total: number; page: number; limit: number }> {
		const page = filters.page && filters.page > 0 ? filters.page : 1;
		const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
		const skip = (page - 1) * limit;

		const query = this.productsRepository
			.createQueryBuilder('product')
			.leftJoinAndSelect('product.collection', 'collection')
			.leftJoinAndSelect('collection.brand', 'brand')
			.where('brand.user_id = :userId', { userId })
			.orderBy('product.created_at', 'DESC')
			.skip(skip)
			.take(limit);

		if (filters.collection_id) {
			query.andWhere('product.collection_id = :collectionId', {
				collectionId: filters.collection_id,
			});
		}

		const [items, total] = await query.getManyAndCount();

		return { items, total, page, limit };
	}

	async findOne(id: string, userId: string): Promise<Product> {
		const product = await this.productsRepository.findOne({
			where: { id },
			relations: ['collection', 'collection.brand'],
		});

		if (!product) {
			throw new NotFoundException(NotFoundMessage.PRODUCT_NOT_FOUND);
		}

		// Check ownership: Either direct owner (user_id) OR via collection (brand.user_id)
		const isDirectOwner = product.user_id === userId;
		const isCollectionOwner = product.collection?.brand?.user_id === userId;

		if (!isDirectOwner && !isCollectionOwner) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return product;
	}

	async update(
		id: string,
		userId: string,
		updateProductDto: UpdateProductDto,
	): Promise<Product> {
		const product = await this.findOne(id, userId);

		if (
			updateProductDto.collection_id &&
			updateProductDto.collection_id !== product.collection_id
		) {
			const collection = await this.collectionsRepository.findOne({
				where: { id: updateProductDto.collection_id },
				relations: ['brand'],
			});

			if (!collection) {
				throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
			}

			if (!collection.brand || collection.brand.user_id !== userId) {
				throw new ForbiddenException(PermissionMessage.NOT_OWNER);
			}

			product.collection_id = updateProductDto.collection_id;
		}

		if (updateProductDto.name !== undefined) {
			product.name = updateProductDto.name;
		}

		if (updateProductDto.front_image_url !== undefined) {
			product.front_image_url = updateProductDto.front_image_url;
		}

		if (updateProductDto.back_image_url !== undefined) {
			product.back_image_url = updateProductDto.back_image_url;
		}

		if (updateProductDto.reference_images !== undefined) {
			product.reference_images = updateProductDto.reference_images;
		}

		if (updateProductDto.extracted_variables !== undefined) {
			product.extracted_variables = updateProductDto.extracted_variables;
		}

		if (updateProductDto.manual_overrides !== undefined) {
			product.manual_overrides = updateProductDto.manual_overrides;
		}

		if (updateProductDto.generated_images !== undefined) {
			product.generated_images = updateProductDto.generated_images;
		}

		// Handle new JSON fields
		if (updateProductDto.analyzed_product_json !== undefined) {
			product.analyzed_product_json = updateProductDto.analyzed_product_json;
		}

		if (updateProductDto.manual_product_overrides !== undefined) {
			product.manual_product_overrides = updateProductDto.manual_product_overrides;
			// Auto-merge to final_product_json
			product.final_product_json = this.mergeProductJSON(
				product.analyzed_product_json,
				updateProductDto.manual_product_overrides
			);
		}

		if (updateProductDto.final_product_json !== undefined) {
			product.final_product_json = updateProductDto.final_product_json;
		}

		return this.productsRepository.save(product);
	}

	/**
	 * STEP 1: Analyze product images with Claude AI
	 */
	async analyzeProduct(id: string, userId: string): Promise<AnalyzedProductJSON> {
		const product = await this.findOne(id, userId);

		const images = [
			product.front_image_url,
			product.back_image_url,
			...(product.reference_images || []),
		].filter(Boolean) as string[];

		if (!images.length) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		// PRIMARY: Analyze with Claude AI
		const rawAIResponse = await this.claudeService.analyzeProduct({
			images,
			productName: product.name,
		});

		// ═══════════════════════════════════════════════════════════
		// 🛡️ CRITICAL: Sanitize AI response BEFORE sending to frontend
		// ═══════════════════════════════════════════════════════════
		// This prevents:
		// 1. [object Object] errors from nested logo fields
		// 2. "Unknown" spam in color/material fields
		// 3. Crashes from malformed AI JSON
		// ═══════════════════════════════════════════════════════════
		const { normalizeProductData } = await import('./utils/normalize-product-data.util');
		const analyzedProductJSON = normalizeProductData(rawAIResponse);

		// Save to product
		product.analyzed_product_json = analyzedProductJSON;
		// Initialize final_product_json with analyzed data
		product.final_product_json = analyzedProductJSON;
		await this.productsRepository.save(product);

		return analyzedProductJSON;
	}

	/**
	 * STEP 2: Update Product JSON with user overrides
	 */
	async updateProductJSON(
		id: string,
		userId: string,
		overrides: Partial<AnalyzedProductJSON>
	): Promise<AnalyzedProductJSON> {
		const product = await this.findOne(id, userId);

		if (!product.analyzed_product_json) {
			throw new BadRequestException('Product must be analyzed first');
		}

		// Merge analyzed + overrides
		product.manual_product_overrides = overrides;
		product.final_product_json = this.mergeProductJSON(
			product.analyzed_product_json,
			overrides
		);

		await this.productsRepository.save(product);

		return product.final_product_json as AnalyzedProductJSON;
	}

	/**
	 * Get final product JSON (analyzed + overrides merged)
	 */
	async getFinalProductJSON(id: string, userId: string): Promise<AnalyzedProductJSON> {
		const product = await this.findOne(id, userId);

		if (product.final_product_json) {
			return product.final_product_json as AnalyzedProductJSON;
		}

		if (product.analyzed_product_json) {
			return product.analyzed_product_json as AnalyzedProductJSON;
		}

		throw new BadRequestException('Product has not been analyzed yet');
	}

	/**
	 * Reset Product JSON to Original Analysis
	 * Clears manual overrides and resets final_product_json to analyzed_product_json
	 */
	async resetProductJson(id: string, userId: string): Promise<Product> {
		const product = await this.findOne(id, userId);

		if (!product.analyzed_product_json) {
			throw new BadRequestException('Product has not been analyzed yet');
		}

		// Clear manual overrides and reset final to analyzed
		product.manual_product_overrides = null;
		product.final_product_json = product.analyzed_product_json;

		return this.productsRepository.save(product);
	}

	/**
	 * Update Product Analysis JSON (Persistent Edit)
	 * PUT /api/products/:id/analysis
	 *
	 * Allows direct editing of the analyzed_product_json.
	 * Changes are saved permanently and will be used in prompt generation.
	 * Also updates final_product_json to match.
	 */
	async updateProductAnalysis(
		id: string,
		userId: string,
		analysisData: AnalyzeProductDirectResponse
	): Promise<Product> {
		const product = await this.findOne(id, userId);

		// Update analyzed_product_json with new data
		product.analyzed_product_json = analysisData as unknown as Record<string, any>;

		// Also update final_product_json (if no manual overrides, they should match)
		if (!product.manual_product_overrides) {
			product.final_product_json = analysisData as unknown as Record<string, any>;
		} else {
			// Re-merge with existing manual overrides
			product.final_product_json = this.mergeProductJSON(
				analysisData as unknown as Record<string, any>,
				product.manual_product_overrides as Partial<AnalyzedProductJSON>
			);
		}

		// Update product name and category if provided in analysis
		if (analysisData.general_info?.product_name) {
			product.name = analysisData.general_info.product_name;
		}
		if (analysisData.general_info?.category) {
			product.category = analysisData.general_info.category;
		}

		return this.productsRepository.save(product);
	}

	/**
	 * Merge analyzed product JSON with user overrides
	 */
	private mergeProductJSON(
		analyzed: Record<string, any> | null,
		overrides: Partial<AnalyzedProductJSON>
	): AnalyzedProductJSON {
		if (!analyzed) {
			throw new BadRequestException('Analyzed product JSON is required');
		}

		// Deep merge
		const merged = { ...analyzed };

		// Merge top-level fields
		if (overrides.product_type) merged.product_type = overrides.product_type;
		if (overrides.product_name) merged.product_name = overrides.product_name;
		if (overrides.color_name) merged.color_name = overrides.color_name;
		if (overrides.color_hex) merged.color_hex = overrides.color_hex;
		if (overrides.material) merged.material = overrides.material;
		if (overrides.texture_description) merged.texture_description = overrides.texture_description;
		if (overrides.additional_details) merged.additional_details = overrides.additional_details;

		// Merge nested objects
		if (overrides.details) {
			merged.details = { ...(merged.details || {}), ...overrides.details };
		}
		if (overrides.logo_front) {
			merged.logo_front = { ...(merged.logo_front || {}), ...overrides.logo_front };
		}
		if (overrides.logo_back) {
			merged.logo_back = { ...(merged.logo_back || {}), ...overrides.logo_back };
		}

		return merged as AnalyzedProductJSON;
	}

	async remove(id: string, userId: string): Promise<{ message: string }> {
		const product = await this.findOne(id, userId);

		// First, delete all related generations to avoid foreign key constraint errors
		const relatedGenerations = await this.generationsRepository.find({
			where: { product_id: id },
		});

		if (relatedGenerations.length > 0) {
			await this.generationsRepository.remove(relatedGenerations);
		}

		// Now delete the product
		await this.productsRepository.remove(product);
		return { message: 'Product deleted successfully' };
	}

	async analyzeImages(
		images: string[],
		productName?: string,
		brandBrief?: string,
	): Promise<{ prompt: string; extracted_variables: Record<string, any> }> {
		if (!images.length) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const extractedVariables = await this.claudeService.analyzeProduct({
			images,
			productName,
		});

		const prompts = await this.claudeService.generatePrompts({
			productName,
			brandBrief,
			extractedVariables,
			count: 1,
		});

		return {
			prompt: prompts[0] || '',
			extracted_variables: extractedVariables,
		};
	}

	/**
	 * STEP 1: Direct product analysis from uploaded images
	 * POST /api/products/analyze
	 * Accepts front, back, and reference images directly without creating a product first
	 */
	async analyzeProductDirect(
		userId: string,
		frontImageUrls: string[],
		backImageUrls: string[],
		referenceImageUrls: string[],
		productName?: string,
	): Promise<{
		id: string;
		name: string;
		category: string;
		analysis: AnalyzeProductDirectResponse;
		imageUrl: string;
		front_image_url: string | null;
		back_image_url: string | null;
		reference_images: string[];
	}> {
		// At least one front OR back image is required
		if (!frontImageUrls.length && !backImageUrls.length) {
			throw new BadRequestException('At least one front or back image is required');
		}

		console.log('📸 Analyzing product images...');
		console.log('  Front images:', frontImageUrls.length);
		console.log('  Back images:', backImageUrls.length);
		console.log('  Reference images:', referenceImageUrls.length);

		// 1. Analyze with Claude
		const analysis = await this.claudeService.analyzeProductDirect({
			frontImages: frontImageUrls.length ? frontImageUrls : undefined,
			backImages: backImageUrls.length ? backImageUrls : undefined,
			referenceImages: referenceImageUrls.length ? referenceImageUrls : undefined,
			productName,
		});

		console.log('✅ Product Analysis Complete');

		// 2. 🛡️ Save to Database (Persistence)
		const product = this.productsRepository.create({
			user_id: userId,
			name: analysis.general_info.product_name, // Map from analysis
			category: analysis.general_info.category, // Map from analysis
			front_image_url: frontImageUrls[0] || null,
			back_image_url: backImageUrls[0] || null,
			reference_images: referenceImageUrls,
			analyzed_product_json: analysis as unknown as Record<string, any>, // Store full JSON
			final_product_json: analysis as unknown as Record<string, any>, // Init final with analyzed
		});

		const savedProduct = await this.productsRepository.save(product);
		console.log(`💾 Product saved to DB: ${savedProduct.id} (${savedProduct.name})`);

		// 3. Return formatted response for Frontend
		return {
			id: savedProduct.id,
			name: savedProduct.name,
			category: savedProduct.category,
			analysis: analysis,
			imageUrl: savedProduct.front_image_url || savedProduct.back_image_url,
			front_image_url: savedProduct.front_image_url,
			back_image_url: savedProduct.back_image_url,
			reference_images: savedProduct.reference_images || []
		};
	}
}
