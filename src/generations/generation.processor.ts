import { Processor, Process, OnQueueEvent, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Generation } from '../database/entities/generation.entity';
import { GeminiService } from '../ai/gemini.service';
import { GenerationStatus } from '../libs/enums';
import { GenerationsService } from './generations.service';
import { FilesService } from '../files/files.service';

export interface GenerationJobData {
	generationId: string;
	prompts: string[];
	visualTypes?: string[]; // Optional: if provided, use these types instead of index-based
	model?: string;
}

@Processor('generation')
export class GenerationProcessor {
	private readonly logger = new Logger(GenerationProcessor.name);

	constructor(
		@InjectRepository(Generation)
		private readonly generationsRepository: Repository<Generation>,
		private readonly geminiService: GeminiService,
		private readonly generationsService: GenerationsService,
		private readonly filesService: FilesService,
	) {}

	@Process()
	async processGeneration(job: Job<GenerationJobData>): Promise<void> {
		const { generationId, prompts, visualTypes, model } = job.data;

		this.logger.log(`🚀 [PROCESSOR] Starting job ${job.id} for generation ${generationId}`);
		this.logger.log(`🚀 [PROCESSOR] Processing generation ${generationId} with ${prompts.length} prompts`);
		if (visualTypes) {
			this.logger.log(`🚀 [PROCESSOR] Visual types provided: ${visualTypes.join(', ')}`);
		}

		try {
			// Update status to processing
			const generation = await this.generationsRepository.findOne({
				where: { id: generationId },
			});

			if (!generation) {
				throw new Error(`Generation ${generationId} not found`);
			}

			generation.status = GenerationStatus.PROCESSING;
			await this.generationsRepository.save(generation);

			// Initialize visuals array with structure
			// Use provided visualTypes if available, otherwise fall back to index-based
			const visuals: any[] = prompts.map((prompt, index) => ({
				type: visualTypes && visualTypes[index] ? visualTypes[index] : this.getVisualType(index),
				prompt,
				status: 'pending',
				index,
			}));

			generation.visuals = visuals;
			await this.generationsRepository.save(generation);

			// 📝 Process images SEQUENTIALLY to avoid stall issues and simplify flow
			this.logger.log(`🚀 STARTING SEQUENTIAL GENERATION: ${prompts.length} images for generation ${generationId}`);
			
			// Process each image one by one
			for (let i = 0; i < prompts.length; i++) {
				const prompt = prompts[i];
				this.logger.log(`🎯 Processing image ${i + 1}/${prompts.length}: ${visuals[i]?.type || 'unknown'}`);
				
				// Update status to processing
				visuals[i].status = 'processing';
				generation.visuals = visuals;
				await this.generationsRepository.save(generation);
				
				// Update job progress
				job.progress(Math.round((i / prompts.length) * 100));

				try {
					const geminiModel = model || process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';
					this.logger.log(`🎨 Generating image ${i + 1} using Gemini model: ${geminiModel}...`);
					
					const result = await this.geminiService.generateImage(
						prompt, 
						geminiModel,
						generation.aspect_ratio,
						generation.resolution
					);
					
					// Save base64 image as file and get URL
					let imageUrl: string | null = null;
					if (result.data) {
						try {
							const storedFile = await this.filesService.storeBase64Image(result.data, result.mimeType);
							imageUrl = storedFile.url;
							this.logger.log(`✅ Saved image ${i + 1}: ${imageUrl}`);
						} catch (fileError: any) {
							this.logger.error(`❌ Failed to save image ${i + 1}: ${fileError.message}`);
							imageUrl = `data:${result.mimeType};base64,${result.data}`;
						}
					}
					
					// Update visual with result
					visuals[i] = {
						...visuals[i],
						prompt,
						mimeType: result.mimeType,
						status: 'completed',
						image_url: imageUrl,
						generated_at: new Date().toISOString(),
					};
					
					this.logger.log(`✅ Image ${i + 1}/${prompts.length} completed (${visuals[i].type})`);
					
				} catch (error: any) {
					this.logger.error(`❌ Failed image ${i + 1}: ${error?.message || error}`);
					
					visuals[i] = {
						...visuals[i],
						status: 'failed',
						error: error?.message || 'Unknown error',
					};
				}
				
				// Save progress after each image
				generation.visuals = visuals;
				await this.generationsRepository.save(generation);
			}
			
			// Final progress
			job.progress(100);

			// Check final results after sequential processing is complete
			this.logger.log(`🏁 All image generations finished for ${generationId}`);
			
			const allCompleted = visuals.every((v) => v.status === 'completed');
			const allFailed = visuals.every((v) => v.status === 'failed');
			const anyFailed = visuals.some((v) => v.status === 'failed');
			const completedCount = visuals.filter((v) => v.status === 'completed').length;
			const failedCount = visuals.filter((v) => v.status === 'failed').length;

			this.logger.log(`📊 Final results: ${completedCount} completed, ${failedCount} failed out of ${visuals.length} total`);

			// Status logic per spec:
			// if all failed → failed
			// if partial → completed (partial success is still completion)
			// if all success → completed
			if (allFailed) {
				generation.status = GenerationStatus.FAILED;
				this.logger.error(`❌ Generation ${generationId} failed - all ${visuals.length} images failed`);
			} else if (allCompleted) {
				generation.status = GenerationStatus.COMPLETED;
				generation.completed_at = new Date();
				this.logger.log(`🎉 Generation ${generationId} completed successfully - all ${visuals.length} images generated!`);
			} else if (anyFailed) {
				// Partial success - mark as completed but with errors
				generation.status = GenerationStatus.COMPLETED;
				generation.completed_at = new Date();
				this.logger.warn(`⚠️ Generation ${generationId} completed with ${failedCount} failures, ${completedCount} succeeded`);
			}
			
			this.logger.log(`📊 Generation ${generationId} finished: ${completedCount} completed, ${failedCount} failed`);

			await this.generationsRepository.save(generation);
		} catch (error) {
			this.logger.error(`Generation ${generationId} failed: ${error.message}`, error.stack);
			
			// Update generation status to failed
			const generation = await this.generationsRepository.findOne({
				where: { id: generationId },
			});
			
			if (generation) {
				generation.status = GenerationStatus.FAILED;
				await this.generationsRepository.save(generation);
			}
			
			throw error;
		}
	}

	@OnQueueActive()
	onActive(job: Job) {
		this.logger.log(`Processing job ${job.id} of type ${job.name}`);
	}

	@OnQueueCompleted()
	onCompleted(job: Job) {
		this.logger.log(`Job ${job.id} completed`);
	}

	@OnQueueFailed()
	onFailed(job: Job, error: Error) {
		this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
	}

	private getVisualType(index: number): string {
		const types = ['duo', 'solo', 'flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];
		return types[index] || `visual_${index + 1}`;
	}

	private calculateProgress(visuals: any[]): number {
		if (!visuals || visuals.length === 0) return 0;
		const completed = visuals.filter((v: any) => v.status === 'completed').length;
		return Math.round((completed / visuals.length) * 100);
	}
}
