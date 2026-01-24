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
import * as archiver from 'archiver';

import { Generation } from '../database/entities/generation.entity';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';

import { CreateGenerationDto, GenerateDto, UpdateGenerationDto } from '../libs/dto';
import { ErrorMessage, GenerationMessage, GenerationStatus, NotFoundMessage, PermissionMessage } from '../libs/enums';
import { GenerationJobData } from './generation.processor';

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
	
	// SSE subscribers for real-time updates
	private sseSubscribers: Map<string, Array<(event: any) => void>> = new Map();;

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
	) {}

	async create(userId: string, dto: CreateGenerationDto): Promise<Generation> {
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

		if (product.collection_id !== dto.collection_id) {
			throw new BadRequestException(ErrorMessage.BAD_REQUEST);
		}

		const collection = await this.collectionsRepository.findOne({
			where: { id: dto.collection_id },
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		const generation = this.generationsRepository.create({
			product_id: dto.product_id,
			collection_id: dto.collection_id,
			user_id: userId,
			generation_type: dto.generation_type,
			aspect_ratio: dto.aspect_ratio || undefined,
			resolution: dto.resolution || undefined,
		});

		return this.generationsRepository.save(generation);
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

	async updatePrompts(id: string, userId: string, dto: UpdateGenerationDto): Promise<Generation> {
		const generation = await this.findOne(id, userId);

		if (!dto.prompts || dto.prompts.length === 0) {
			throw new BadRequestException(GenerationMessage.NO_VISUALS_FOUND);
		}

		generation.visuals = dto.prompts;
		generation.status = GenerationStatus.PENDING;
		generation.completed_at = null;

		return this.generationsRepository.save(generation);
	}

	async generate(id: string, userId: string, dto: GenerateDto): Promise<Generation> {
		const generation = await this.findOne(id, userId);

		if (generation.status === GenerationStatus.PROCESSING) {
			throw new BadRequestException(GenerationMessage.GENERATION_IN_PROGRESS);
		}

		const prompts = dto.prompts?.length ? dto.prompts : this.extractPrompts(generation.visuals || []);

		if (!prompts.length) {
			throw new BadRequestException(GenerationMessage.NO_VISUALS_FOUND);
		}

		// Add job to queue instead of processing synchronously
		const job = await this.generationQueue.add(
			{
				generationId: id,
				prompts,
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
		visuals: Array<{ index: number; status: string; error?: string }>;
	}> {
		const generation = await this.findOne(id, userId);

		const visuals = generation.visuals || [];
		const completed = visuals.filter((v: any) => v.status === 'completed').length;
		const failed = visuals.filter((v: any) => v.status === 'failed').length;
		const total = visuals.length || 0;
		const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

		return {
			status: generation.status,
			progress,
			completed,
			total,
			visuals: visuals.map((v: any, index: number) => ({
				index: v.index ?? index,
				status: v.status || 'pending',
				error: v.error,
			})),
		};
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

		const archive = archiver('zip', { zlib: { level: 9 } });

		// Create folder structure: Collection/Product/visuals
		const collectionName = collection?.name || 'Unknown';
		const productName = product?.name || 'Unknown';
		const sanitizedCollectionName = this.sanitizeFileName(collectionName);
		const sanitizedProductName = this.sanitizeFileName(productName);

		visuals.forEach((visual: any, index: number) => {
			if (!visual || visual.status !== 'completed') {
				return; // Skip failed or pending visuals
			}

			let buffer: Buffer;
			let ext: string;
			let fileName: string;

			// Handle different data formats
			if (visual.data) {
				// Base64 data
				buffer = Buffer.from(visual.data, 'base64');
				ext = this.extensionFromMime(visual.mimeType || 'image/png');
			} else if (visual.image_url) {
				// Data URL
				const dataUrlMatch = visual.image_url.match(/^data:([^;]+);base64,(.+)$/);
				if (dataUrlMatch) {
					buffer = Buffer.from(dataUrlMatch[2], 'base64');
					ext = this.extensionFromMime(dataUrlMatch[1]);
				} else {
					// Skip if not base64
					return;
				}
			} else {
				// Skip if no data
				return;
			}

			// Generate filename based on visual type
			const visualType = visual.type || `visual_${index + 1}`;
			const visualTypeMap: Record<string, string> = {
				duo: 'duo',
				solo: 'solo',
				flatlay_front: 'flatlay_front',
				flatlay_back: 'flatlay_back',
				closeup_front: 'closeup_front',
				closeup_back: 'closeup_back',
			};

			fileName = visualTypeMap[visualType] || `visual_${index + 1}`;
			const filePath = `${sanitizedCollectionName}/${sanitizedProductName}/${fileName}.${ext}`;

			archive.append(buffer, { name: filePath });
		});

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
	 * Subscribe to real-time generation updates via SSE
	 */
	subscribeToGenerationUpdates(generationId: string, callback: (event: any) => void): () => void {
		if (!this.sseSubscribers.has(generationId)) {
			this.sseSubscribers.set(generationId, []);
		}
		
		const subscribers = this.sseSubscribers.get(generationId)!;
		subscribers.push(callback);
		
		this.logger.log(`New SSE subscriber for generation ${generationId}. Total: ${subscribers.length}`);
		
		// Return cleanup function
		return () => {
			const index = subscribers.indexOf(callback);
			if (index > -1) {
				subscribers.splice(index, 1);
				this.logger.log(`SSE subscriber removed for generation ${generationId}. Remaining: ${subscribers.length}`);
				
				// Clean up empty subscriber lists
				if (subscribers.length === 0) {
					this.sseSubscribers.delete(generationId);
				}
			}
		};
	}

	/**
	 * Emit event to all SSE subscribers for a generation
	 */
	emitGenerationUpdate(generationId: string, event: any): void {
		const subscribers = this.sseSubscribers.get(generationId);
		if (subscribers && subscribers.length > 0) {
			this.logger.log(`Emitting SSE event to ${subscribers.length} subscribers for generation ${generationId}: ${event.type}`);
			
			subscribers.forEach(callback => {
				try {
					callback({
						...event,
						generationId,
						timestamp: new Date().toISOString()
					});
				} catch (error) {
					this.logger.error(`Failed to emit SSE event: ${error.message}`);
				}
			});
		}
	}

	/**
	 * Emit visual completion event
	 */
	emitVisualCompleted(generationId: string, visualIndex: number, visual: any): void {
		this.emitGenerationUpdate(generationId, {
			type: 'visual_completed',
			visualIndex,
			visual: {
				type: visual.type,
				status: visual.status,
				image_url: visual.image_url,
				generated_at: visual.generated_at,
				prompt: visual.prompt
			}
		});
	}

	/**
	 * Emit visual processing event
	 */
	emitVisualProcessing(generationId: string, visualIndex: number, visualType: string): void {
		this.emitGenerationUpdate(generationId, {
			type: 'visual_processing',
			visualIndex,
			visualType
		});
	}

	/**
	 * Emit visual failed event
	 */
	emitVisualFailed(generationId: string, visualIndex: number, error: string): void {
		this.emitGenerationUpdate(generationId, {
			type: 'visual_failed',
			visualIndex,
			error
		});
	}

	/**
	 * Emit generation completed event
	 */
	emitGenerationCompleted(generationId: string, completedCount: number, totalCount: number): void {
		this.emitGenerationUpdate(generationId, {
			type: 'generation_completed',
			completedCount,
			totalCount
		});
	}
}
