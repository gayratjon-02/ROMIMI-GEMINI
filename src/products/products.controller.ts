import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	UseGuards,
	UseInterceptors,
	UploadedFiles,
	Query,
	BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import 'multer';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProductDto, UpdateProductDto, UploadProductDto, AnalyzeImagesDto, UpdateProductJsonDto, AnalyzeProductDirectDto, AnalyzeProductDirectResponse } from '../libs/dto';
import { AnalyzedProductJSON } from '../common/interfaces/product-json.interface';
import { User } from '../database/entities/user.entity';
import { Product } from '../database/entities/product.entity';
import { FilesService } from '../files/files.service';
import { ProductAnalysisResponse, ProductJsonResponse, ProductListResponse, ProductResponse } from 'src/libs/types/product/product.type';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
	constructor(
		private readonly productsService: ProductsService,
		private readonly filesService: FilesService,
	) { }

	/**
	 * Create Product (client workflow step 3)
	 * POST /api/products
	 * FormData: name, collection_id, front_image (required), back_image (optional), reference_images[] (optional, up to 12).
	 * No analysis at create — use POST /api/products/:id/analyze after.
	 */
	@Post()
	@UseInterceptors(
		FileFieldsInterceptor(
			[
				{ name: 'front_image', maxCount: 1 },
				{ name: 'back_image', maxCount: 1 },
				{ name: 'reference_images', maxCount: 12 },
			],
			{
				limits: { fileSize: 30 * 1024 * 1024 }, // 30MB per file
			},
		),
	)
	async create(
		@CurrentUser() user: User,
		@Body() uploadProductDto: UploadProductDto,
		@UploadedFiles()
		files: {
			front_image?: Express.Multer.File[];
			back_image?: Express.Multer.File[];
			reference_images?: Express.Multer.File[];
		},
	): Promise<Product> {
		const frontImage = files?.front_image?.[0];
		const backImage = files?.back_image?.[0];
		const referenceImages = files?.reference_images || [];

		if (!frontImage) {
			throw new BadRequestException('Front image is required. Upload front packshot (product front view).');
		}

		const storedFront = await this.filesService.storeImage(frontImage);
		const storedBack = backImage ? await this.filesService.storeImage(backImage) : null;
		const storedRefs = referenceImages.length
			? await Promise.all(referenceImages.map((file) => this.filesService.storeImage(file)))
			: [];

		const createProductDto: CreateProductDto = {
			name: uploadProductDto.name,
			collection_id: uploadProductDto.collection_id,
			front_image_url: storedFront.url,
			back_image_url: storedBack?.url ?? null,
			reference_images: storedRefs.length ? storedRefs.map((r) => r.url) : null,
		};

		return this.productsService.create(user.id, createProductDto);
	}

	/**
	 * STEP 1: Analyze Product Images Directly
	 * POST /api/products/analyze
	 * FormData: front_images[] (required), back_images[] (optional), reference_images[] (optional, max 10)
	 * Creates product record and returns analyzed product JSON
	 */
	@Post('analyze')
	@UseInterceptors(
		FileFieldsInterceptor(
			[
				{ name: 'front_images', maxCount: 5 },
				{ name: 'back_images', maxCount: 5 },
				{ name: 'reference_images', maxCount: 10 },
			],
			{
				limits: { fileSize: 30 * 1024 * 1024 }, // 30MB per file
			},
		),
	)
	async analyzeProductDirect(
		@CurrentUser() user: User,
		@Body() analyzeProductDirectDto: AnalyzeProductDirectDto,
		@UploadedFiles()
		files: {
			front_images?: Express.Multer.File[];
			back_images?: Express.Multer.File[];
			reference_images?: Express.Multer.File[];
		},
	): Promise<ProductAnalysisResponse> {
		const frontImages = files?.front_images || [];
		const backImages = files?.back_images || [];
		const referenceImages = files?.reference_images || [];

		// At least one front OR back image is required
		if (!frontImages.length && !backImages.length) {
			throw new BadRequestException('At least one front or back image is required');
		}

		// Store uploaded files and get URLs
		const storedFrontImages = await Promise.all(
			frontImages.map((file) => this.filesService.storeImage(file)),
		);
		const storedBackImages = await Promise.all(
			backImages.map((file) => this.filesService.storeImage(file)),
		);
		const storedReferenceImages = await Promise.all(
			referenceImages.map((file) => this.filesService.storeImage(file)),
		);

		// Analyze with Claude and save to DB
		const result = await this.productsService.analyzeProductDirect(
			user.id,
			storedFrontImages.map((f) => f.url),
			storedBackImages.map((f) => f.url),
			storedReferenceImages.map((f) => f.url),
			analyzeProductDirectDto.product_name,
		);

		return {
			success: true,
			product_id: result.id,
			name: result.name,
			category: result.category,
			analysis: result.analysis,
			imageUrl: result.imageUrl,
			front_image_url: result.front_image_url,
			back_image_url: result.back_image_url,
			reference_images: result.reference_images,
			message: 'Product analyzed and saved successfully',
			next_step: 'POST /api/generations/create with product_id and da_preset_id',
		};
	}

	/**
	 * Get All Products
	 * GET /api/products/getAllProducts
	 * Query: collection_id (optional), page (optional), limit (optional)
	 */
	@Get('getAllProducts')
	async getAllProducts(
		@CurrentUser() user: User,
		@Query('collection_id') collectionId?: string,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
	): Promise<ProductListResponse> {
		const result = await this.productsService.findAll(user.id, {
			collection_id: collectionId,
			page: page ? parseInt(page, 10) : undefined,
			limit: limit ? parseInt(limit, 10) : undefined,
		});

		return {
			success: true,
			...result,
		};
	}

	/**
	 * Update Product
	 * PUT /api/products/:id
	 * Body: UpdateProductDto
	 */
	@Put(':id')
	async updateProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateProductDto: UpdateProductDto,
	): Promise<ProductResponse> {
		const product = await this.productsService.update(id, user.id, updateProductDto);
		return {
			success: true,
			product,
			message: 'Product updated successfully',
		};
	}

	/**
	 * Delete Product
	 * DELETE /api/products/:id
	 */
	@Delete(':id')
	async deleteProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ success: boolean; message: string }> {
		await this.productsService.remove(id, user.id);
		return {
			success: true,
			message: 'Product deleted successfully',
		};
	}

	@Post('analyze-images')
	async analyzeImages(
		@CurrentUser() user: User,
		@Body() analyzeImagesDto: AnalyzeImagesDto,
	): Promise<{ prompt: string; extracted_variables: Record<string, any> }> {
		return this.productsService.analyzeImages(
			analyzeImagesDto.images,
			analyzeImagesDto.productName,
			analyzeImagesDto.brandBrief,
		);
	}

	/**
	 * STEP 1: Analyze Product (STEP 1)
	 * POST /api/products/:id/analyze
	 */
	@Post(':id/analyze')
	async analyzeProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ product_id: string; analyzed_product_json: AnalyzedProductJSON; status: string; analyzed_at: string }> {
		const analyzedProductJSON = await this.productsService.analyzeProduct(id, user.id);
		return {
			product_id: id,
			analyzed_product_json: analyzedProductJSON,
			status: 'analyzed',
			analyzed_at: analyzedProductJSON.analyzed_at || new Date().toISOString(),
		};
	}

	/**
	 * STEP 2: Update Product JSON (User Edits)
	 * PUT /api/products/:id/product-json
	 */
	@Post('updateProductJson/:id')
	async updateProductJSON(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateProductJsonDto: UpdateProductJsonDto,
	): Promise<{ analyzed_product_json: AnalyzedProductJSON; final_product_json: AnalyzedProductJSON; updated_at: string }> {
		const product = await this.productsService.findOne(id, user.id);
		const finalProductJSON = await this.productsService.updateProductJSON(id, user.id, updateProductJsonDto.manual_overrides);
		return {
			analyzed_product_json: product.analyzed_product_json as AnalyzedProductJSON,
			final_product_json: finalProductJSON,
			updated_at: new Date().toISOString(),
		};
	}

	/**
	 * Get Product with JSONs
	 * GET /api/products/:id
	 */
	@Get(':id')
	async getProductWithJSONs(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<ProductResponse> {
		const product = await this.productsService.findOne(id, user.id);
		return {
			success: true,
			product,
		};
	}

	/**
	 * Get Product JSON (Analysis Results)
	 * GET /api/products/:id/json
	 * Returns analyzed and final product JSON for editing
	 */
	@Get(':id/json')
	async getProductJson(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<ProductJsonResponse> {
		const product = await this.productsService.findOne(id, user.id);

		return {
			success: true,
			product_id: id,
			analyzed_product_json: product.analyzed_product_json as AnalyzedProductJSON || null,
			final_product_json: product.final_product_json as AnalyzedProductJSON || null,
			has_manual_overrides: !!product.manual_product_overrides,
			message: product.analyzed_product_json
				? 'Product JSON retrieved successfully'
				: 'Product has not been analyzed yet',
		};
	}

	/**
	 * Update Product JSON (User Edits)
	 * PUT /api/products/:id/json
	 * Body: { manual_overrides: Partial<AnalyzedProductJSON> }
	 */
	@Put(':id/json')
	async updateProductJson(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateProductJsonDto: UpdateProductJsonDto,
	): Promise<ProductJsonResponse> {
		const product = await this.productsService.findOne(id, user.id);
		const finalProductJSON = await this.productsService.updateProductJSON(id, user.id, updateProductJsonDto.manual_overrides);

		return {
			success: true,
			product_id: id,
			analyzed_product_json: product.analyzed_product_json as AnalyzedProductJSON,
			final_product_json: finalProductJSON,
			has_manual_overrides: true,
			message: 'Product JSON updated successfully',
		};
	}

	/**
	 * Reset Product JSON to Original Analysis
	 * POST /api/products/:id/reset
	 * Clears manual overrides and resets final_product_json to analyzed_product_json
	 */
	@Post(':id/reset')
	async resetProductJson(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<ProductJsonResponse> {
		const result = await this.productsService.resetProductJson(id, user.id);

		return {
			success: true,
			product_id: id,
			analyzed_product_json: result.analyzed_product_json as AnalyzedProductJSON,
			final_product_json: result.final_product_json as AnalyzedProductJSON,
			has_manual_overrides: false,
			message: 'Product JSON reset to original analysis',
		};
	}

	/**
	 * Update Product Analysis JSON (Persistent Edit)
	 * PUT /api/products/:id/analysis
	 * Body: AnalyzeProductDirectResponse (full analysis JSON)
	 *
	 * This endpoint allows direct editing of the analyzed_product_json.
	 * Changes are saved permanently and will be used in prompt generation.
	 */
	@Put(':id/analysis')
	async updateProductAnalysis(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() analysisData: AnalyzeProductDirectResponse,
	): Promise<{
		success: boolean;
		product_id: string;
		analyzed_product_json: AnalyzeProductDirectResponse;
		message: string;
	}> {
		const product = await this.productsService.updateProductAnalysis(id, user.id, analysisData);

		return {
			success: true,
			product_id: id,
			analyzed_product_json: product.analyzed_product_json as AnalyzeProductDirectResponse,
			message: 'Product analysis updated successfully',
		};
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// LEGACY ENDPOINTS (for backward compatibility)
	// ═══════════════════════════════════════════════════════════════════════════

	/** @deprecated Use GET /api/products/:id instead */
	@Get('getProduct/:id')
	async getProductLegacy(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<Product> {
		return this.productsService.findOne(id, user.id);
	}

	/** @deprecated Use PUT /api/products/:id instead */
	@Post('updateProduct/:id')
	async updateProductLegacy(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateProductDto: UpdateProductDto,
	): Promise<Product> {
		return this.productsService.update(id, user.id, updateProductDto);
	}

	/** @deprecated Use DELETE /api/products/:id instead */
	@Post('deleteProduct/:id')
	async deleteProductLegacy(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ message: string }> {
		return this.productsService.remove(id, user.id);
	}

	/** @deprecated Use PUT /api/products/:id/json instead */
	@Post('updateProductJson/:id')
	async updateProductJsonLegacy(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateProductJsonDto: UpdateProductJsonDto,
	): Promise<{ analyzed_product_json: AnalyzedProductJSON; final_product_json: AnalyzedProductJSON; updated_at: string }> {
		const product = await this.productsService.findOne(id, user.id);
		const finalProductJSON = await this.productsService.updateProductJSON(id, user.id, updateProductJsonDto.manual_overrides);
		return {
			analyzed_product_json: product.analyzed_product_json as AnalyzedProductJSON,
			final_product_json: finalProductJSON,
			updated_at: new Date().toISOString(),
		};
	}
}
