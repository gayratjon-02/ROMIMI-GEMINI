import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { GenerationsService } from './generations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateGenerationDto, GenerateDto, UpdateGenerationDto, MergePromptsDto, UpdateMergedPromptsDto } from '../libs/dto';
import { User } from '../database/entities/user.entity';
import { Generation } from '../database/entities/generation.entity';
import { MergedPrompts } from '../common/interfaces/merged-prompts.interface';

@Controller('generations')
@UseGuards(JwtAuthGuard)
export class GenerationsController {
	constructor(private readonly generationsService: GenerationsService) { }

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 3: SIMPLIFIED GENERATION API (Product + DAPreset → 6 Images)
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * POST /api/generations/create
	 *
	 * Creates a new generation linking Product + DAPreset.
	 * Returns generation.id with status PENDING.
	 *
	 * Body:
	 * - product_id (required): UUID of analyzed product
	 * - da_preset_id (required): UUID of DA preset
	 * - model_type (optional): 'adult' or 'kid' (default: 'adult')
	 */
	@Post('create')
	async createSimple(
		@CurrentUser() user: User,
		@Body() body: { product_id: string; da_preset_id: string; model_type?: 'adult' | 'kid' },
	): Promise<{
		success: boolean;
		generation: Generation;
		message: string;
		next_step: string;
	}> {
		if (!body.product_id) {
			throw new BadRequestException('product_id is required');
		}
		if (!body.da_preset_id) {
			throw new BadRequestException('da_preset_id is required');
		}

		const generation = await this.generationsService.createGenerationSimple(
			user.id,
			body.product_id,
			body.da_preset_id,
			body.model_type || 'adult',
		);

		return {
			success: true,
			generation,
			message: 'Generation created successfully',
			next_step: 'POST /api/generations/:id/execute to start image generation',
		};
	}

	/**
	 * POST /api/generations/:id/execute
	 *
	 * Executes the generation:
	 * 1. Builds 6 prompts from Product + DA
	 * 2. Calls Gemini API for each prompt
	 * 3. Saves results
	 *
	 * Returns generation with images array.
	 */
	// ═══════════════════════════════════════════════════════════════════════════
	// PHASE 4: SPLIT WORKFLOW (Build → Edit → Generate)
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * POST /api/generations/:id/build-prompts
	 * 
	 * Step 1: Build prompts from Product + DA (No generation yet)
	 */
	@Post(':id/build-prompts')
	async buildPrompts(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ success: boolean; generation_id: string; prompts: MergedPrompts; message: string }> {
		return this.generationsService.buildPrompts(id, user.id);
	}

	/**
	 * PUT /api/generations/:id/save-prompts
	 * 
	 * Step 2: Save user edits to the prompts
	 */
	@Post(':id/save-prompts') // Using POST to match REST pattern in this project, or PUT if prefer
	async savePrompts(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() body: { prompts: Partial<MergedPrompts> },
	): Promise<{ success: boolean; generation_id: string; prompts: MergedPrompts; message: string }> {
		if (!body.prompts) {
			throw new BadRequestException('prompts object is required');
		}
		return this.generationsService.savePrompts(id, user.id, body.prompts);
	}

	/**
	 * POST /api/generations/:id/generate-images
	 * 
	 * Step 3: Generate images (Partial or Full)
	 * Body: { selected_shots: ['duo', 'solo'] }
	 */
	@Post(':id/generate-images')
	async generateImages(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() body: { selected_shots?: string[] },
	): Promise<{ success: boolean; generation: Generation; message: string }> {
		const generation = await this.generationsService.generateVisuals(id, user.id, {
			selected_shots: body.selected_shots
		});

		const visuals = generation.visuals || [];
		const completed = visuals.filter((v: any) => v.status === 'completed').length;

		return {
			success: true,
			generation,
			message: `Started generation for ${body.selected_shots?.length || 6} shots. Completed so far: ${completed}.`
		};
	}

	/**
	 * POST /api/generations/:id/execute
	 * @deprecated Use split workflow instead
	 */
	@Post(':id/execute')
	async execute(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{
		success: boolean;
		generation: Generation;
		stats: {
			completed: number;
			failed: number;
			total: number;
		};
	}> {
		const generation = await this.generationsService.executeGeneration(id, user.id);

		const visuals = generation.visuals || [];
		const completed = visuals.filter((v: any) => v.status === 'completed').length;
		const failed = visuals.filter((v: any) => v.status === 'failed').length;

		return {
			success: true,
			generation,
			stats: {
				completed,
				failed,
				total: visuals.length,
			},
		};
	}

	/**
	 * GET /api/generations/:id/details
	 *
	 * Gets generation details including product and DA preset info.
	 */
	@Get(':id/details')
	async getDetails(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{
		generation: Generation;
		prompts: any;
		images: Record<string, string>;
	}> {
		const generation = await this.generationsService.getGenerationDetails(id, user.id);

		return {
			generation,
			prompts: generation.merged_prompts,
			images: generation.generated_images || {},
		};
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// LEGACY ENDPOINTS (for backward compatibility)
	// ═══════════════════════════════════════════════════════════════════════════

	@Post('createGeneration')
	async createGeneration(@CurrentUser() user: User, @Body() dto: CreateGenerationDto): Promise<Generation> {
		return this.generationsService.create(user.id, dto);
	}

	@Get('getAllGenerations')
	async getAllGenerations(
		@CurrentUser() user: User,
		@Query('product_id') productId?: string,
		@Query('collection_id') collectionId?: string,
		@Query('generation_type') generationType?: string,
		@Query('status') status?: string,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
	): Promise<{ items: Generation[]; total: number; page: number; limit: number }> {
		return this.generationsService.findAll(user.id, {
			product_id: productId,
			collection_id: collectionId,
			generation_type: generationType,
			status,
			page: page ? parseInt(page, 10) : undefined,
			limit: limit ? parseInt(limit, 10) : undefined,
		});
	}

	@Get('getGeneration/:id')
	async getGeneration(@Param('id') id: string, @CurrentUser() user: User): Promise<Generation> {
		return this.generationsService.getWithDetails(id, user.id);
	}

	/**
	 * STEP 3: Merge Product + DA (STEP 3)
	 * POST /api/generations/:id/merge
	 * 
	 * Supports:
	 * - Legacy: model_type applies to ALL shots
	 * - NEW: shot_options for granular per-shot control
	 */
	@Post(':id/merge')
	async mergePrompts(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() mergePromptsDto?: MergePromptsDto,
	): Promise<{ generation_id: string; merged_prompts: MergedPrompts; status: string; merged_at: string }> {
		const mergedPrompts = await this.generationsService.mergePrompts(id, user.id, {
			model_type: mergePromptsDto?.model_type,
			shot_options: mergePromptsDto?.shot_options,
		});
		return {
			generation_id: id,
			merged_prompts: mergedPrompts,
			status: 'merged',
			merged_at: new Date().toISOString(),
		};
	}

	/**
	 * STEP 6: Update Merged Prompts (User Edits)
	 * PUT /api/generations/:id/prompts
	 */
	@Post('updateMergedPrompts/:id')
	async updateMergedPrompts(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateMergedPromptsDto: UpdateMergedPromptsDto,
	): Promise<{ merged_prompts: MergedPrompts; updated_at: string }> {
		const mergedPrompts = await this.generationsService.updatePrompts(id, user.id, updateMergedPromptsDto.prompts);
		return {
			merged_prompts: mergedPrompts,
			updated_at: new Date().toISOString(),
		};
	}

	/**
	 * STEP 6: Preview Merged Prompts (Before Generation)
	 * GET /api/generations/:id/prompts
	 */
	@Get('getPrompts/:id')
	async getPrompts(@Param('id') id: string, @CurrentUser() user: User): Promise<{
		generation_id: string;
		merged_prompts: MergedPrompts;
		product_json: any;
		da_json: any;
		can_edit: boolean;
	}> {
		const generation = await this.generationsService.getWithDetails(id, user.id);
		if (!generation.merged_prompts) {
			throw new BadRequestException('Prompts must be merged first');
		}
		return {
			generation_id: id,
			merged_prompts: generation.merged_prompts as MergedPrompts,
			product_json: generation.product.final_product_json || generation.product.analyzed_product_json,
			da_json: generation.collection.analyzed_da_json,
			can_edit: true,
		};
	}

	@Post(':id/generate')
	async generate(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: GenerateDto): Promise<Generation> {
		return this.generationsService.generate(id, user.id, dto);
	}

	@Post('reset/:id')
	async resetGeneration(@Param('id') id: string, @CurrentUser() user: User): Promise<Generation> {
		return this.generationsService.resetGeneration(id, user.id);
	}

	@Get('debug/config')
	async debugConfig(@CurrentUser() user: User): Promise<{
		gemini_configured: boolean;
		model: string;
		redis_connected: boolean;
	}> {
		return this.generationsService.debugConfig();
	}

	@Post('debug/test-sse/:id')
	@Public() // Make this endpoint public for testing
	async testSSE(@Param('id') generationId: string): Promise<{ message: string }> {
		const testUserId = 'test-user-123'; // Use a test user ID
		console.log(`🧪 Testing SSE events for generation ${generationId}, user ${testUserId}`);

		// Simulate 6 images being generated with SSE events
		for (let i = 0; i < 6; i++) {
			setTimeout(() => {
				console.log(`🎯 Test: Emitting processing event for visual ${i}`);
				this.generationsService.emitVisualProcessing(generationId, testUserId, i, `test-type-${i}`);
			}, i * 1000); // Each event 1 second apart

			setTimeout(() => {
				console.log(`🎯 Test: Emitting completed event for visual ${i}`);
				this.generationsService.emitVisualCompleted(generationId, testUserId, i, {
					type: `test-type-${i}`,
					status: 'completed',
					image_url: `data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`,
					generated_at: new Date().toISOString(),
					prompt: `Test prompt for image ${i}`
				});
			}, (i * 1000) + 500); // Completion 500ms after processing
		}

		return { message: `Test SSE events started for generation ${generationId}` };
	}

	@Post('debug/test-job')
	async testJob(@CurrentUser() user: User): Promise<{ message: string }> {
		return this.generationsService.testJob();
	}

	@Post('debug/clear-queue')
	async clearQueue(@CurrentUser() user: User): Promise<{ message: string }> {
		return this.generationsService.clearQueue();
	}

	@Get('getProgress/:id')
	async getProgress(@Param('id') id: string, @CurrentUser() user: User) {
		return this.generationsService.getGenerationProgress(id, user.id);
	}

	@Get('download/:id')
	async download(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Res({ passthrough: true }) res: Response,
	): Promise<StreamableFile> {
		// Check if pre-generated ZIP exists
		const preGeneratedZip = await this.generationsService.getPreGeneratedZip(id, user.id);

		if (preGeneratedZip) {
			// Use pre-generated ZIP for instant download
			res.set({
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${preGeneratedZip.filename}"`,
			});
			return new StreamableFile(preGeneratedZip.fileStream);
		}

		// Fallback: generate on-demand (slower)
		const { archive, filename } = await this.generationsService.createDownloadArchive(id, user.id);

		res.set({
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
		});

		return new StreamableFile(archive);
	}

	@Post(':generationId/visual/:index/retry')
	async retryVisual(
		@Param('generationId') generationId: string,
		@Param('index') index: string,
		@CurrentUser() user: User,
		@Body() dto?: { model?: string },
	): Promise<Generation> {
		const visualIndex = parseInt(index, 10);
		if (isNaN(visualIndex) || visualIndex < 0) {
			throw new BadRequestException('Invalid visual index');
		}

		return this.generationsService.retryVisual(generationId, user.id, visualIndex, dto?.model);
	}
}
