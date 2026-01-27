import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Subject } from 'rxjs';
import * as archiver from 'archiver';

import { Generation } from '../database/entities/generation.entity';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';

import { CreateGenerationDto, GenerateDto, UpdateGenerationDto } from '../libs/dto';
import { ErrorMessage, GenerationMessage, GenerationStatus, NotFoundMessage, PermissionMessage } from '../libs/enums';
import { GenerationJobData } from './generation.processor';
import { GeminiService } from '../ai/gemini.service';
import { ClaudeService } from '../ai/claude.service';
import { FilesService } from '../files/files.service';
import { MergedPrompts } from '../common/interfaces/merged-prompts.interface';
import { AnalyzedProductJSON } from '../common/interfaces/product-json.interface';
import { AnalyzedDAJSON } from '../common/interfaces/da-json.interface';

type GenerationFilters = {
	product_id?: string;
	collection_id?: string;
	generation_type?: string;
	status?: string;
	page?: number;
	limit?: number;
};

@Injectable()
export class GenerationsService {
	private readonly logger = new Logger(GenerationsService.name);

	// SSE Subject for real-time updates
	private readonly generationEvents = new Subject<any>();

	// ZIP cache: generationId -> { filePath, createdAt, timeout }
	private readonly zipCache = new Map<string, { filePath: string; createdAt: Date; timeout: NodeJS.Timeout }>();

	constructor(
		@InjectRepository(Generation)
		private readonly generationsRepository: Repository<Generation>,

		@InjectRepository(Product)
		private readonly productsRepository: Repository<Product>,

		@InjectRepository(Collection)
		private readonly collectionsRepository: Repository<Collection>,

		@InjectQueue('generation')
		private readonly generationQueue: Queue<GenerationJobData>,

		private readonly configService: ConfigService,
		private readonly geminiService: GeminiService,
		private readonly claudeService: ClaudeService,
		private readonly filesService: FilesService,
	) { }

	async create(userId: string, dto: CreateGenerationDto): Promise<Generation> {
		// 🔍 Validate product exists and belongs to user
		const product = await this.productsRepository.findOne({
			where: { id: dto.product_id },
			relations: ['collection', 'collection.brand'],
		});

		if (!product) {
			throw new NotFoundException(NotFoundMessage.PRODUCT_NOT_FOUND);
		}

		if (product.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		// 🔍 Validate collection matches product's collection
		if (product.collection_id !== dto.collection_id) {
			throw new BadRequestException('Collection ID does not match product\'s collection');
		}

		const collection = await this.collectionsRepository.findOne({
			where: { id: dto.collection_id },
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		// ✅ No need to check collection ownership since product already belongs to user
		// and product.collection_id matches dto.collection_id

		// 🎨 Set default values for aspect_ratio and resolution if not provided
		const aspectRatio = dto.aspect_ratio || '4:5'; // Default to 4:5 portrait
		const resolution = dto.resolution || '4K'; // Default to 4K quality

		this.logger.log(`📋 Creating generation for user ${userId}: product=${dto.product_id}, collection=${dto.collection_id}, aspect_ratio=${aspectRatio}, resolution=${resolution}`);

		const generation = this.generationsRepository.create({
			product_id: dto.product_id,
			collection_id: dto.collection_id,
			user_id: userId,
			generation_type: dto.generation_type,
			aspect_ratio: aspectRatio,
			resolution: resolution,
		});

		// 💾 Save generation
		const savedGeneration = await this.generationsRepository.save(generation);

		// 🔄 Load with relations for enriched response
		const enrichedGeneration = await this.generationsRepository.findOne({
			where: { id: savedGeneration.id },
			relations: ['product', 'collection'],
		});

		this.logger.log(`✅ Generation created successfully: ${savedGeneration.id}`);

		return enrichedGeneration || savedGeneration;
	}

	/**
	 * STEP 3: Merge Product + DA → 6 prompts
	 */
	async mergePrompts(generationId: string, userId: string): Promise<MergedPrompts> {
		const generation = await this.generationsRepository.findOne({
			where: { id: generationId },
			relations: ['product', 'collection'],
		});

		if (!generation) {
			throw new NotFoundException(NotFoundMessage.GENERATION_NOT_FOUND);
		}

		if (generation.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		// Fetch final product JSON
		if (!generation.product.final_product_json && !generation.product.analyzed_product_json) {
			throw new BadRequestException('Product must be analyzed first');
		}

		const productJSON = generation.product.final_product_json || generation.product.analyzed_product_json;

		// Fetch DA JSON
		if (!generation.collection.analyzed_da_json) {
			throw new BadRequestException('Collection DA must be analyzed first');
		}

		const daJSON = generation.collection.analyzed_da_json;

		// Merge with Claude
		const mergedPrompts = await this.claudeService.mergeProductAndDA(
			productJSON as AnalyzedProductJSON,
			daJSON as AnalyzedDAJSON,
			generation.collection.name
		);

		// Save to generation
		generation.merged_prompts = mergedPrompts;
		generation.status = GenerationStatus.PENDING; // Set to PENDING so generate() can be called
		generation.current_step = 'merged';
		await this.generationsRepository.save(generation);

		this.logger.log(`✅ Merged prompts for generation ${generationId} - Status set to PENDING`);
		this.logger.debug(`Merged prompts content: ${JSON.stringify(mergedPrompts).substring(0, 200)}...`);

		return mergedPrompts;
	}

	/**
	 * Update merged prompts (user edits)
	 */
	async updatePrompts(
		generationId: string,
		userId: string,
		prompts: Partial<MergedPrompts>
	): Promise<MergedPrompts> {
		const generation = await this.generationsRepository.findOne({
			where: { id: generationId },
		});

		if (!generation) {
			throw new NotFoundException(NotFoundMessage.GENERATION_NOT_FOUND);
		}

		if (generation.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		if (!generation.merged_prompts) {
			throw new BadRequestException('Prompts must be merged first');
		}

		// Merge updates
		const currentPrompts = generation.merged_prompts as MergedPrompts;
		const updatedPrompts: MergedPrompts = {
			duo: prompts.duo ? { ...currentPrompts.duo, ...prompts.duo, last_edited_at: new Date().toISOString() } : currentPrompts.duo,
			solo: prompts.solo ? { ...currentPrompts.solo, ...prompts.solo, last_edited_at: new Date().toISOString() } : currentPrompts.solo,
			flatlay_front: prompts.flatlay_front ? { ...currentPrompts.flatlay_front, ...prompts.flatlay_front, last_edited_at: new Date().toISOString() } : currentPrompts.flatlay_front,
			flatlay_back: prompts.flatlay_back ? { ...currentPrompts.flatlay_back, ...prompts.flatlay_back, last_edited_at: new Date().toISOString() } : currentPrompts.flatlay_back,
			closeup_front: prompts.closeup_front ? { ...currentPrompts.closeup_front, ...prompts.closeup_front, last_edited_at: new Date().toISOString() } : currentPrompts.closeup_front,
			closeup_back: prompts.closeup_back ? { ...currentPrompts.closeup_back, ...prompts.closeup_back, last_edited_at: new Date().toISOString() } : currentPrompts.closeup_back,
		};

		generation.merged_prompts = updatedPrompts;
		await this.generationsRepository.save(generation);

		return updatedPrompts;
	}

	/**
	 * Get generation with all data
	 */
	async getWithDetails(generationId: string, userId: string): Promise<Generation & { elapsed_seconds?: number; estimated_remaining_seconds?: number }> {
		const generation = await this.generationsRepository.findOne({
			where: { id: generationId },
			relations: ['product', 'collection', 'collection.brand'],
		});

		if (!generation) {
			throw new NotFoundException(NotFoundMessage.GENERATION_NOT_FOUND);
		}

		if (generation.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		// Calculate elapsed and remaining time
		let elapsedSeconds = 0;
		let estimatedRemainingSeconds: number | undefined = undefined;

		if (generation.started_at) {
			const now = new Date();
			const started = new Date(generation.started_at);
			elapsedSeconds = Math.floor((now.getTime() - started.getTime()) / 1000);

			// Estimate remaining time based on progress
			const progress = generation.progress_percent || 0;
			if (progress > 0 && progress < 100) {
				const avgTimePerPercent = elapsedSeconds / progress;
				estimatedRemainingSeconds = Math.ceil(avgTimePerPercent * (100 - progress));
			}
		}

		return {
			...generation,
			elapsed_seconds: elapsedSeconds,
			estimated_remaining_seconds: estimatedRemainingSeconds,
		} as Generation & { elapsed_seconds?: number; estimated_remaining_seconds?: number };
	}

	async findAll(
		userId: string,
		filters: GenerationFilters,
	): Promise<{ items: Generation[]; total: number; page: number; limit: number }> {
		const page = filters.page && filters.page > 0 ? filters.page : 1;
		const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
		const skip = (page - 1) * limit;

		const query = this.generationsRepository
			.createQueryBuilder('generation')
			.where('generation.user_id = :userId', { userId })
			.orderBy('generation.created_at', 'DESC')
			.skip(skip)
			.take(limit);

		if (filters.product_id) {
			query.andWhere('generation.product_id = :productId', {
				productId: filters.product_id,
			});
		}

		if (filters.collection_id) {
			query.andWhere('generation.collection_id = :collectionId', {
				collectionId: filters.collection_id,
			});
		}

		if (filters.generation_type) {
			query.andWhere('generation.generation_type = :generationType', {
				generationType: filters.generation_type,
			});
		}

		if (filters.status) {
			query.andWhere('generation.status = :status', {
				status: filters.status,
			});
		}

		const [items, total] = await query.getManyAndCount();
		return { items, total, page, limit };
	}

	async findOne(id: string, userId: string): Promise<Generation> {
		const generation = await this.generationsRepository.findOne({
			where: { id, user_id: userId },
		});

		if (!generation) {
			throw new NotFoundException(NotFoundMessage.GENERATION_NOT_FOUND);
		}

		return generation;
	}

	async previewPrompts(id: string, userId: string): Promise<{ prompts: string[] }> {
		const generation = await this.findOne(id, userId);
		const prompts = this.extractPrompts(generation.visuals || []);
		return { prompts };
	}

	async updateLegacyPrompts(id: string, userId: string, dto: UpdateGenerationDto): Promise<Generation> {
		const generation = await this.findOne(id, userId);

		if (!dto.prompts || dto.prompts.length === 0) {
			throw new BadRequestException(GenerationMessage.NO_VISUALS_FOUND);
		}

		// If visualTypes are provided, use them; otherwise use index-based or existing types
		const visualTypes = dto.visualTypes && dto.visualTypes.length === dto.prompts.length
			? dto.visualTypes
			: null;

		// If prompts are provided, update visuals with prompts and preserve types if they exist
		// Otherwise, create new visuals array from prompts
		if (generation.visuals && Array.isArray(generation.visuals) && generation.visuals.length > 0) {
			// Update existing visuals with new prompts, using provided types or preserving existing types
			generation.visuals = generation.visuals.map((visual: any, index: number) => ({
				...visual,
				type: visualTypes ? (visualTypes[index] || visual.type) : visual.type,
				prompt: dto.prompts[index] || visual.prompt,
				status: 'pending',
				index,
			}));
		} else {
			// Create new visuals array from prompts
			generation.visuals = dto.prompts.map((prompt: string, index: number) => ({
				type: visualTypes ? visualTypes[index] : this.getVisualTypeFromIndex(index),
				prompt,
				status: 'pending',
				index,
			}));
		}

		generation.status = GenerationStatus.PENDING;
		generation.completed_at = null;

		return this.generationsRepository.save(generation);
	}

	private getVisualTypeFromIndex(index: number): string {
		const types = ['duo', 'solo', 'flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];
		return types[index] || `visual_${index + 1}`;
	}

	async generate(id: string, userId: string, dto: GenerateDto): Promise<Generation> {
		const generation = await this.findOne(id, userId);

		if (generation.status === GenerationStatus.PROCESSING) {
			throw new BadRequestException(GenerationMessage.GENERATION_IN_PROGRESS);
		}

		// Daily generation limit removed - no restrictions



		// Extract prompts: prefer dto.prompts, then extract from merged_prompts based on visualTypes, then visuals
		this.logger.log(`📥 Generate request for ${id}: dto=${JSON.stringify(dto)}`);
		this.logger.log(`🔍 Generation state: status=${generation.status}, hasMergedPrompts=${!!generation.merged_prompts}`);

		let prompts: string[] = [];
		let visualTypes: string[] | undefined;

		if (dto.prompts?.length) {
			prompts = dto.prompts;
		} else if (dto.visualTypes?.length && generation.merged_prompts) {
			// Extract prompts from merged_prompts based on requested visual types
			this.logger.log(`🔍 Extracting prompts from merged_prompts for types: ${dto.visualTypes.join(', ')}`);

			// Normalize visual type keys (handle both old uppercase and new lowercase formats)
			const typeNormalizer: Record<string, string> = {
				'DUO': 'duo',
				'SOLO': 'solo',
				'FLAT_F': 'flatlay_front',
				'FLAT_B': 'flatlay_back',
				'CLOSE_F': 'closeup_front',
				'CLOSE_B': 'closeup_back',
			};

			const validItems = dto.visualTypes.map(type => {
				// Normalize type key
				const normalizedType = typeNormalizer[type] || type;
				const promptData = (generation.merged_prompts as any)[normalizedType];
				if (!promptData || !promptData.prompt) {
					this.logger.warn(`⚠️ No prompt found for visual type: ${type} (normalized: ${normalizedType})`);
					return null;
				}
				return { type: normalizedType, prompt: promptData.prompt };
			}).filter(item => item !== null) as { type: string, prompt: string }[];

			prompts = validItems.map(item => item.prompt);
			visualTypes = validItems.map(item => item.type);

			this.logger.log(`📋 Using filtered visual types: ${visualTypes.join(', ')}`);
		} else {
			prompts = this.extractPrompts(generation.visuals || []);
			// visualTypes will be undefined or derived from generation.visuals later if needed
		}

		if (!prompts.length) {
			this.logger.error(`❌ No prompts found. visuals=${generation.visuals?.length}, merged_prompts=${!!generation.merged_prompts}, visualTypes=${dto.visualTypes?.length}`);
			throw new BadRequestException(GenerationMessage.NO_VISUALS_FOUND);
		}

		// Use visual types from generation.visuals as fallback if not set above
		if (!visualTypes && generation.visuals && Array.isArray(generation.visuals) && generation.visuals.length === prompts.length) {
			visualTypes = generation.visuals.map((v: any) => v.type).filter(Boolean);
			this.logger.log(`📋 Using visual types from generation.visuals: ${visualTypes.join(', ')}`);
		}

		this.logger.log(`🚀 Starting generation job for ${id} with ${prompts.length} prompts`);
		this.logger.debug(`Visual types: ${visualTypes?.join(', ') || 'index-based'}`);

		// Add job to queue instead of processing synchronously
		const job = await this.generationQueue.add(
			{
				generationId: id,
				prompts,
				visualTypes: visualTypes && visualTypes.length === prompts.length ? visualTypes : undefined,
				model: dto.model,
			},
			{
				jobId: `generation-${id}`,
				removeOnComplete: false,
				removeOnFail: false,
			},
		);

		// Update generation status to processing
		generation.status = GenerationStatus.PROCESSING;
		generation.completed_at = null;
		await this.generationsRepository.save(generation);

		// Return generation with job info
		return {
			...generation,
			job_id: job.id.toString(),
		} as Generation & { job_id: string };
	}

	async resetGeneration(id: string, userId: string): Promise<Generation> {
		const generation = await this.findOne(id, userId);

		// Reset generation status
		generation.status = GenerationStatus.PENDING;
		generation.completed_at = null;

		// Clear any existing visuals progress
		if (generation.visuals) {
			generation.visuals = generation.visuals.map((visual: any) => ({
				...visual,
				status: 'pending',
				image_url: null,
				error: null,
			}));
		}

		await this.generationsRepository.save(generation);

		this.logger.log(`Generation ${id} has been reset to pending status`);
		return generation;
	}

	async debugConfig(): Promise<{
		gemini_configured: boolean;
		model: string;
		redis_connected: boolean;
		queue_status: any;
		active_jobs: any[];
		failed_jobs: any[];
	}> {
		const geminiApiKey = this.configService.get<string>('gemini.apiKey');

		this.logger.log(`Debug - Gemini API Key configured: ${!!geminiApiKey}`);

		let redisConnected = false;
		let jobCounts = {};
		let activeJobs = [];
		let failedJobs = [];

		try {
			jobCounts = await this.generationQueue.getJobCounts();
			redisConnected = true;

			// Get active jobs
			activeJobs = await this.generationQueue.getActive();

			// Get failed jobs
			failedJobs = await this.generationQueue.getFailed();

			this.logger.log(`Debug - Redis connected. Job counts: ${JSON.stringify(jobCounts)}`);
			this.logger.log(`Debug - Active jobs: ${activeJobs.length}`);
			this.logger.log(`Debug - Failed jobs: ${failedJobs.length}`);

		} catch (error) {
			this.logger.error(`Debug - Redis/Queue error: ${error.message}`);
		}

		return {
			gemini_configured: !!geminiApiKey,
			model: 'gemini-2.5-flash-image',
			redis_connected: redisConnected,
			queue_status: jobCounts,
			active_jobs: activeJobs.map(job => ({
				id: job.id,
				name: job.name,
				data: job.data,
				processedOn: job.processedOn,
				finishedOn: job.finishedOn
			})),
			failed_jobs: failedJobs.map(job => ({
				id: job.id,
				name: job.name,
				failedReason: job.failedReason,
				data: job.data
			}))
		};
	}

	async testJob(): Promise<{ message: string }> {
		this.logger.log('🧪 Adding test job to queue...');

		const job = await this.generationQueue.add(
			{
				generationId: 'test-job-' + Date.now(),
				prompts: ['Test prompt for debugging'],
				model: 'test-model',
			},
			{
				jobId: `test-${Date.now()}`,
				removeOnComplete: false,
				removeOnFail: false,
			},
		);

		this.logger.log(`🧪 Test job added with ID: ${job.id}`);

		return {
			message: `Test job added with ID: ${job.id}. Check logs for processing.`,
		};
	}

	async clearQueue(): Promise<{ message: string }> {
		this.logger.log('🧹 Clearing all jobs from queue...');

		try {
			// Clean failed jobs
			await this.generationQueue.clean(0, 'failed');

			// Clean active jobs  
			await this.generationQueue.clean(0, 'active');

			// Clean completed jobs
			await this.generationQueue.clean(0, 'completed');

			const jobCounts = await this.generationQueue.getJobCounts();
			this.logger.log(`🧹 Queue cleared. New counts: ${JSON.stringify(jobCounts)}`);

			return {
				message: `Queue cleared successfully. New job counts: ${JSON.stringify(jobCounts)}`,
			};
		} catch (error) {
			this.logger.error(`Failed to clear queue: ${error.message}`);
			return {
				message: `Failed to clear queue: ${error.message}`,
			};
		}
	}

	async getGenerationProgress(id: string, userId: string): Promise<{
		status: string;
		progress: number;
		completed: number;
		total: number;
		elapsed_seconds?: number;
		estimated_remaining_seconds?: number;
		visuals: Array<{ index: number; status: string; error?: string }>;
	}> {
		const generation = await this.findOne(id, userId);

		const visuals = generation.visuals || [];
		const completed = visuals.filter((v: any) => v.status === 'completed').length;
		const failed = visuals.filter((v: any) => v.status === 'failed').length;
		const total = visuals.length || 0;
		const progress = generation.progress_percent || (total > 0 ? Math.round((completed / total) * 100) : 0);

		// Calculate elapsed and remaining time
		let elapsedSeconds = 0;
		let estimatedRemainingSeconds: number | undefined = undefined;

		if (generation.started_at) {
			const now = new Date();
			const started = new Date(generation.started_at);
			elapsedSeconds = Math.floor((now.getTime() - started.getTime()) / 1000);

			// Estimate remaining time based on progress
			if (progress > 0 && progress < 100) {
				const avgTimePerPercent = elapsedSeconds / progress;
				estimatedRemainingSeconds = Math.ceil(avgTimePerPercent * (100 - progress));
			}
		}

		return {
			status: generation.status,
			progress,
			completed,
			total,
			elapsed_seconds: elapsedSeconds,
			estimated_remaining_seconds: estimatedRemainingSeconds,
			visuals: visuals.map((v: any, index: number) => ({
				index: v.index ?? index,
				status: v.status || 'pending',
				error: v.error,
			})),
		};
	}

	/**
	 * Pre-generate ZIP archive when images are ready (background process)
	 */
	async preGenerateZipArchive(generationId: string): Promise<void> {
		try {
			const generation = await this.generationsRepository.findOne({
				where: { id: generationId },
				relations: ['product', 'product.collection'],
			});

			if (!generation || !generation.visuals || generation.visuals.length === 0) {
				return;
			}

			// Check if all visuals are completed
			const allCompleted = generation.visuals.every((v: any) => v.status === 'completed');
			if (!allCompleted) {
				return; // Wait for all images
			}

			// Check if ZIP already exists
			if (this.zipCache.has(generationId)) {
				return; // Already generating or generated
			}

			this.logger.log(`📦 Pre-generating ZIP for generation ${generationId}...`);

			// Create ZIP in background (non-blocking)
			this.createZipFile(generationId, generation).catch((error) => {
				this.logger.error(`Failed to pre-generate ZIP for ${generationId}:`, error);
			});
		} catch (error) {
			this.logger.error(`Error in preGenerateZipArchive for ${generationId}:`, error);
		}
	}

	/**
	 * Create ZIP file and save to temp directory
	 */
	private async createZipFile(generationId: string, generation: Generation): Promise<void> {
		const fs = await import('fs/promises');
		const path = await import('path');
		const os = await import('os');

		const tempDir = path.join(os.tmpdir(), 'romimi-zips');
		await fs.mkdir(tempDir, { recursive: true });

		const zipFilePath = path.join(tempDir, `${generationId}.zip`);
		const output = require('fs').createWriteStream(zipFilePath);
		const archive = archiver('zip', { zlib: { level: 1 } });

		return new Promise((resolve, reject) => {
			output.on('close', async () => {
				this.logger.log(`✅ ZIP pre-generated: ${zipFilePath}`);

				// Save to cache with 1 hour timeout
				const timeout = setTimeout(() => {
					this.cleanupZip(generationId);
				}, 3600000); // 1 hour

				this.zipCache.set(generationId, {
					filePath: zipFilePath,
					createdAt: new Date(),
					timeout,
				});

				resolve();
			});

			archive.on('error', (err) => {
				this.logger.error(`ZIP creation error for ${generationId}:`, err);
				reject(err);
			});

			archive.pipe(output);

			// Add images to archive (same logic as createDownloadArchive)
			const visuals = generation.visuals || [];
			const product = generation.product;
			const collection = product?.collection;

			const collectionName = collection?.name || 'Unknown';
			const productName = product?.name || 'Unknown';
			const sanitizedCollectionName = this.sanitizeFileName(collectionName);
			const sanitizedProductName = this.sanitizeFileName(productName);

			const visualTypeMap: Record<string, string> = {
				duo: 'duo',
				solo: 'solo',
				flatlay_front: 'flatlay_front',
				flatlay_back: 'flatlay_back',
				closeup_front: 'closeup_front',
				closeup_back: 'closeup_back',
			};

			// Process visuals in parallel
			Promise.all(
				visuals.map(async (visual: any, index: number) => {
					if (!visual || visual.status !== 'completed') return null;

					let buffer: Buffer;
					let ext: string;

					if (visual.image_filename) {
						try {
							const uploadDir = process.env.UPLOAD_DIR || './uploads';
							const localPath = `${uploadDir}/${visual.image_filename}`;
							buffer = await fs.readFile(localPath);
							ext = visual.image_filename.split('.').pop() || 'jpg';
						} catch (err) {
							return null;
						}
					} else if (visual.image_url) {
						const dataUrlMatch = visual.image_url.match(/^data:([^;]+);base64,(.+)$/);
						if (dataUrlMatch) {
							buffer = Buffer.from(dataUrlMatch[2], 'base64');
							ext = this.extensionFromMime(dataUrlMatch[1]);
						} else if (visual.image_url.startsWith('http://') || visual.image_url.startsWith('https://')) {
							try {
								const response = await fetch(visual.image_url);
								if (response.ok) {
									const arrayBuffer = await response.arrayBuffer();
									buffer = Buffer.from(arrayBuffer);
									const contentType = response.headers.get('content-type') || 'image/jpeg';
									ext = this.extensionFromMime(contentType);
								} else {
									return null;
								}
							} catch (error) {
								return null;
							}
						} else {
							return null;
						}
					} else {
						return null;
					}

					const visualType = visual.type || `visual_${index + 1}`;
					const fileName = visualTypeMap[visualType] || `visual_${index + 1}`;
					const filePath = `ROMIMI/${sanitizedCollectionName}/${sanitizedProductName}/${fileName}.${ext}`;

					archive.append(buffer, { name: filePath });
				})
			).then(() => {
				archive.finalize();
			});
		});
	}

	/**
	 * Get pre-generated ZIP if available
	 */
	async getPreGeneratedZip(generationId: string, userId: string): Promise<{ fileStream: any; filename: string } | null> {
		const cached = this.zipCache.get(generationId);
		if (!cached) {
			return null;
		}

		// Verify user has access
		const generation = await this.findOne(generationId, userId);

		const fs = require('fs');
		if (!fs.existsSync(cached.filePath)) {
			this.zipCache.delete(generationId);
			return null;
		}

		// Get product and collection for filename
		const product = await this.productsRepository.findOne({
			where: { id: generation.product_id },
			relations: ['collection'],
		});

		const collection = product?.collection;
		const collectionName = collection?.name || 'Unknown';
		const productName = product?.name || 'Unknown';
		const sanitizedCollectionName = this.sanitizeFileName(collectionName);
		const sanitizedProductName = this.sanitizeFileName(productName);
		const filename = `ROMIMI_${sanitizedCollectionName}_${sanitizedProductName}_${generationId.slice(0, 8)}.zip`;

		const fileStream = fs.createReadStream(cached.filePath);

		// Clear timeout and delete from cache after download
		clearTimeout(cached.timeout);
		this.zipCache.delete(generationId);

		// Delete file after streaming
		fileStream.on('end', () => {
			setTimeout(() => {
				if (fs.existsSync(cached.filePath)) {
					fs.unlinkSync(cached.filePath);
				}
			}, 1000);
		});

		this.logger.log(`⚡ Using pre-generated ZIP for instant download: ${generationId}`);
		return { fileStream, filename };
	}

	/**
	 * Cleanup ZIP file from cache and filesystem
	 */
	private cleanupZip(generationId: string): void {
		const cached = this.zipCache.get(generationId);
		if (cached) {
			clearTimeout(cached.timeout);
			const fs = require('fs');
			if (fs.existsSync(cached.filePath)) {
				fs.unlinkSync(cached.filePath);
				this.logger.log(`🗑️ Cleaned up ZIP: ${cached.filePath}`);
			}
			this.zipCache.delete(generationId);
		}
	}

	async createDownloadArchive(id: string, userId: string): Promise<{ archive: archiver.Archiver; filename: string }> {
		const generation = await this.findOne(id, userId);
		const visuals = generation.visuals || [];

		if (!visuals.length) {
			throw new BadRequestException(GenerationMessage.NO_VISUALS_FOUND);
		}

		// Get product and collection for folder structure
		const product = await this.productsRepository.findOne({
			where: { id: generation.product_id },
			relations: ['collection'],
		});

		const collection = product?.collection;

		// Use level 1 for fastest compression (still good compression ratio for images)
		const archive = archiver('zip', { zlib: { level: 1 } });

		// Create folder structure: Collection/Product/visuals
		const collectionName = collection?.name || 'Unknown';
		const productName = product?.name || 'Unknown';
		const sanitizedCollectionName = this.sanitizeFileName(collectionName);
		const sanitizedProductName = this.sanitizeFileName(productName);

		// Visual type mapping
		const visualTypeMap: Record<string, string> = {
			duo: 'duo',
			solo: 'solo',
			flatlay_front: 'flatlay_front',
			flatlay_back: 'flatlay_back',
			closeup_front: 'closeup_front',
			closeup_back: 'closeup_back',
		};

		// Process visuals in PARALLEL for faster download
		const processVisual = async (visual: any, index: number): Promise<{ buffer: Buffer; filePath: string } | null> => {
			if (!visual || visual.status !== 'completed') {
				return null;
			}

			let buffer: Buffer;
			let ext: string;

			// FAST PATH: Try to read from local file system first (if image_filename exists)
			if (visual.image_filename) {
				try {
					const uploadDir = process.env.UPLOAD_DIR || './uploads';
					const localPath = `${uploadDir}/${visual.image_filename}`;
					const fs = await import('fs/promises');
					buffer = await fs.readFile(localPath);
					ext = visual.image_filename.split('.').pop() || 'jpg';

					const visualType = visual.type || `visual_${index + 1}`;
					const fileName = visualTypeMap[visualType] || `visual_${index + 1}`;
					const filePath = `ROMIMI/${sanitizedCollectionName}/${sanitizedProductName}/${fileName}.${ext}`;

					return { buffer, filePath };
				} catch (err) {
					// File not found locally, fall back to URL fetch
					this.logger.warn(`Local file not found: ${visual.image_filename}, falling back to URL`);
				}
			}

			// Handle different data formats
			if (visual.data) {
				// Base64 data
				buffer = Buffer.from(visual.data, 'base64');
				ext = this.extensionFromMime(visual.mimeType || 'image/png');
			} else if (visual.image_url) {
				// Data URL or HTTP URL
				const dataUrlMatch = visual.image_url.match(/^data:([^;]+);base64,(.+)$/);
				if (dataUrlMatch) {
					buffer = Buffer.from(dataUrlMatch[2], 'base64');
					ext = this.extensionFromMime(dataUrlMatch[1]);
				} else if (visual.image_url.startsWith('http://') || visual.image_url.startsWith('https://')) {
					// Fetch from URL (S3 or local server)
					try {
						const response = await fetch(visual.image_url);
						if (response.ok) {
							const arrayBuffer = await response.arrayBuffer();
							buffer = Buffer.from(arrayBuffer);
							const contentType = response.headers.get('content-type') || 'image/jpeg';
							ext = this.extensionFromMime(contentType);
						} else {
							this.logger.warn(`Failed to fetch image from URL: ${visual.image_url}`);
							return null;
						}
					} catch (error) {
						this.logger.error(`Error fetching image from URL: ${visual.image_url}`, error);
						return null;
					}
				} else {
					return null;
				}
			} else {
				return null;
			}

			// Generate filename based on visual type
			const visualType = visual.type || `visual_${index + 1}`;
			const fileName = visualTypeMap[visualType] || `visual_${index + 1}`;
			const filePath = `ROMIMI/${sanitizedCollectionName}/${sanitizedProductName}/${fileName}.${ext}`;

			return { buffer, filePath };
		};

		// Fetch all images in parallel
		const results = await Promise.all(
			visuals.map((visual, index) => processVisual(visual, index))
		);

		// Add all successfully fetched images to archive
		for (const result of results) {
			if (result) {
				archive.append(result.buffer, { name: result.filePath });
			}
		}

		archive.finalize();

		return {
			archive,
			filename: `ROMIMI_${sanitizedCollectionName}_${sanitizedProductName}_${generation.id.slice(0, 8)}.zip`,
		};
	}

	private sanitizeFileName(name: string): string {
		return name
			.replace(/[^a-zA-Z0-9_-]/g, '_')
			.replace(/_{2,}/g, '_')
			.replace(/^_|_$/g, '')
			.slice(0, 50);
	}

	private extractPrompts(visuals: any[]): string[] {
		return visuals
			.map((item) => {
				if (typeof item === 'string') {
					return item;
				}

				if (item && typeof item === 'object') {
					return item.prompt || item.text || item.description || null;
				}

				return null;
			})
			.filter(Boolean) as string[];
	}


	private extensionFromMime(mimeType: string): string {
		switch (mimeType) {
			case 'image/png':
				return 'png';
			case 'image/webp':
				return 'webp';
			case 'image/gif':
				return 'gif';
			case 'image/jpeg':
			default:
				return 'jpg';
		}
	}


	/**
	 * Emit event to all SSE subscribers for a generation
	 */
	/**
	 * Get the generation event stream for SSE
	 */
	getGenerationEventStream(): Subject<any> {
		return this.generationEvents;
	}

	emitGenerationUpdate(generationId: string, event: any): void {
		const eventData = {
			...event,
			generationId,
			timestamp: new Date().toISOString()
		};

		this.logger.log(`🎯 SSE: Emitting event for generation ${generationId}: ${event.type} (visualIndex: ${event.visualIndex})`);
		console.log('📡 SSE Event Data:', JSON.stringify(eventData, null, 2));

		this.generationEvents.next(eventData);

		// Verify the event was emitted
		this.logger.log(`✅ SSE: Event emitted successfully to ${this.generationEvents.observers?.length || 0} observers`);
	}

	/**
	 * Emit visual completion event
	 */
	emitVisualCompleted(generationId: string, userId: string, visualIndex: number, visual: any): void {
		// 🚀 CRITICAL: Debug image_url before emitting
		this.logger.log(`📡 emitVisualCompleted called for visual ${visualIndex}:`, {
			generationId,
			visualIndex,
			visualType: visual.type,
			hasImageUrl: !!visual.image_url,
			imageUrl: visual.image_url ? visual.image_url.substring(0, 100) : 'NULL',
		});

		if (!visual.image_url) {
			this.logger.error(`❌ CRITICAL: visual.image_url is NULL in emitVisualCompleted!`);
			this.logger.error(`Visual object:`, JSON.stringify(visual, null, 2));
		}

		const eventData = {
			type: 'visual_completed',
			userId,
			visualIndex,
			visual: {
				type: visual.type,
				status: visual.status,
				image_url: visual.image_url, // This MUST NOT be null
				generated_at: visual.generated_at,
				prompt: visual.prompt
			}
		};

		// 🚀 CRITICAL: Verify image_url in event data
		if (!eventData.visual.image_url) {
			this.logger.error(`❌ CRITICAL ERROR: eventData.visual.image_url is NULL before emitGenerationUpdate!`);
			this.logger.error(`Event data:`, JSON.stringify(eventData, null, 2));
		}

		this.emitGenerationUpdate(generationId, eventData);
	}

	/**
	 * Emit visual processing event
	 */
	emitVisualProcessing(generationId: string, userId: string, visualIndex: number, visualType: string): void {
		this.emitGenerationUpdate(generationId, {
			type: 'visual_processing',
			userId,
			visualIndex,
			visual: {
				type: visualType,
				status: 'processing'
			}
		});
	}

	/**
	 * Emit visual failed event
	 */
	emitVisualFailed(generationId: string, userId: string, visualIndex: number, error: string): void {
		this.emitGenerationUpdate(generationId, {
			type: 'visual_failed',
			userId,
			visualIndex,
			error
		});
	}

	/**
	 * Emit generation completed event
	 */
	emitGenerationCompleted(generationId: string, userId: string, status: string): void {
		this.emitGenerationUpdate(generationId, {
			type: 'generation_completed',
			userId,
			status
		});
	}

	/**
	 * Emit generation_done event when all visuals are processed
	 */
	emitGenerationDone(generationId: string, userId: string, stats: { completed: number; failed: number; total: number; status: string }): void {
		this.emitGenerationUpdate(generationId, {
			type: 'generation_done',
			userId,
			completed: stats.completed,
			failed: stats.failed,
			total: stats.total,
			status: stats.status,
		});
	}

	/**
	 * Retry generating a single visual
	 */
	async retryVisual(generationId: string, userId: string, visualIndex: number, model?: string): Promise<Generation> {
		const generation = await this.findOne(generationId, userId);

		if (!generation.visuals || !generation.visuals[visualIndex]) {
			throw new BadRequestException(`Visual at index ${visualIndex} not found`);
		}

		const visual = generation.visuals[visualIndex];
		const prompt = visual.prompt || this.extractPrompts([visual])[0];

		if (!prompt) {
			throw new BadRequestException(`No prompt found for visual at index ${visualIndex}`);
		}

		this.logger.log(`🔄 Retrying visual ${visualIndex} for generation ${generationId}`);

		// Emit processing event
		this.emitVisualProcessing(generationId, userId, visualIndex, visual.type || `visual_${visualIndex}`);

		try {
			// Generate image
			const result = await this.geminiService.generateImage(prompt, model);

			// Save to storage
			let imageUrl: string | null = null;
			if (result.data) {
				try {
					const storedFile = await this.filesService.storeBase64Image(result.data, result.mimeType);
					imageUrl = storedFile.url;
					this.logger.log(`💾 Saved retry image to: ${imageUrl}`);
				} catch (fileError: any) {
					this.logger.error(`❌ Failed to save retry image: ${fileError.message}`);
					throw fileError;
				}
			}

			// Update visual
			generation.visuals[visualIndex] = {
				...visual,
				prompt,
				mimeType: result.mimeType,
				data: result.data, // Keep base64 for backup
				status: 'completed',
				image_url: imageUrl,
				generated_at: new Date().toISOString(),
				error: undefined, // Clear any previous error
			};

			await this.generationsRepository.save(generation);

			// Emit completion event
			this.emitVisualCompleted(generationId, userId, visualIndex, generation.visuals[visualIndex]);

			this.logger.log(`✅ Successfully retried visual ${visualIndex} for generation ${generationId}`);

			return generation;
		} catch (error: any) {
			this.logger.error(`❌ Retry failed for visual ${visualIndex}: ${error.message}`);

			// Mark as failed
			generation.visuals[visualIndex] = {
				...visual,
				status: 'failed',
				error: error?.message || 'Unknown error',
			};

			await this.generationsRepository.save(generation);

			// Emit failure event
			this.emitVisualFailed(generationId, userId, visualIndex, error?.message || 'Unknown error');

			throw error;
		}
	}
}
