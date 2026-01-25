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
		const { generationId, prompts, model } = job.data;

		this.logger.log(`🚀 [PROCESSOR] Starting job ${job.id} for generation ${generationId}`);
		this.logger.log(`🚀 [PROCESSOR] Processing generation ${generationId} with ${prompts.length} prompts`);

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
			const visuals: any[] = prompts.map((prompt, index) => ({
				type: this.getVisualType(index),
				prompt,
				status: 'pending',
				index,
			}));

			generation.visuals = visuals;
			await this.generationsRepository.save(generation);

			// 🚀 CRITICAL: Process all prompts in PARALLEL for true real-time progressive rendering
			this.logger.log(`🚀 STARTING PARALLEL GENERATION: ${prompts.length} images for generation ${generationId}`);
			console.log('🔍 Generation Details:', {
				generationId,
				userId: generation.user_id,
				promptCount: prompts.length,
				visualTypes: visuals.map(v => v.type)
			});
			
			// Start all images processing simultaneously
			const imagePromises = prompts.map(async (prompt, i) => {
				console.log(`🎯 Starting image ${i + 1}: ${visuals[i]?.type || 'unknown'}`);
				
				// Emit processing event immediately when starting
				if (visuals[i]) {
					visuals[i].status = 'processing';
					generation.visuals = visuals;
					await this.generationsRepository.save(generation);
					
					console.log(`📡 Emitting PROCESSING event for visual ${i}`);
					this.generationsService.emitVisualProcessing(generationId, generation.user_id, i, visuals[i].type);
					this.logger.log(`🔥 Started generating image ${i + 1}/${prompts.length} (${visuals[i].type}) for generation ${generationId}`);
				}

				try {
					// Generate this image independently
					const result = await this.geminiService.generateImage(prompt, model);
					
					// Save base64 image as file and get URL
					let imageUrl: string | null = null;
					if (result.data) {
						try {
							const storedFile = await this.filesService.storeBase64Image(result.data, result.mimeType);
							imageUrl = storedFile.url;
							this.logger.log(`💾 Saved image ${i + 1} to file: ${storedFile.filename}, URL: ${imageUrl}`);
						} catch (fileError: any) {
							this.logger.error(`❌ Failed to save image ${i + 1} to file: ${fileError.message}`);
							// Fallback to base64 if file save fails
							imageUrl = `data:${result.mimeType};base64,${result.data}`;
						}
					}
					
					// Update this specific visual with result
					visuals[i] = {
						...visuals[i],
						prompt,
						mimeType: result.mimeType,
						data: result.data, // Keep base64 data in DB for backup
						text: result.text,
						status: 'completed',
						image_url: imageUrl,
						generated_at: new Date().toISOString(),
					};

					// Save progress immediately for this image
					generation.visuals = visuals;
					await this.generationsRepository.save(generation);
					
					// 🎯 Emit completion event immediately when THIS image is ready
					console.log(`🎉 IMAGE ${i + 1} COMPLETED! Emitting SSE event for visual ${i} (${visuals[i].type})`);
					console.log('📸 Image URL:', imageUrl ? `${imageUrl.substring(0, 50)}...` : 'NO IMAGE');
					
					// Emit with only URL (not base64 data)
					this.generationsService.emitVisualCompleted(generationId, generation.user_id, i, {
						...visuals[i],
						image_url: imageUrl, // Only URL, not base64
					});
					
					this.logger.log(`✅ Completed image ${i + 1}/${prompts.length} (${visuals[i].type}) for generation ${generationId}`);
					
					// Update job progress based on completed images
					const completedCount = visuals.filter(v => v.status === 'completed' || v.status === 'failed').length;
					job.progress(Math.round((completedCount / prompts.length) * 100));
					
					return result;
				} catch (error: any) {
					this.logger.error(`❌ Failed to generate image ${i + 1}/${prompts.length} (${visuals[i].type}): ${error?.message || error}`);
					
					// Mark this specific visual as failed
					visuals[i] = {
						...visuals[i],
						status: 'failed',
						error: error?.message || 'Unknown error',
					};
					
					generation.visuals = visuals;
					await this.generationsRepository.save(generation);
					
					// Emit failure event immediately
					this.generationsService.emitVisualFailed(generationId, generation.user_id, i, error?.message || 'Unknown error');
					
					return null;
				}
			});

			// Wait for ALL images to complete (but they process in parallel)
			this.logger.log(`⏳ Waiting for all ${prompts.length} images to complete in parallel...`);
			const results = await Promise.allSettled(imagePromises);

			// Check final results after all parallel processing is complete
			this.logger.log(`🏁 All parallel image generations finished for ${generationId}`);
			
			const allCompleted = visuals.every((v) => v.status === 'completed');
			const anyFailed = visuals.some((v) => v.status === 'failed');
			const completedCount = visuals.filter((v) => v.status === 'completed').length;
			const failedCount = visuals.filter((v) => v.status === 'failed').length;

			this.logger.log(`📊 Final results: ${completedCount} completed, ${failedCount} failed out of ${visuals.length} total`);

			if (allCompleted) {
				generation.status = GenerationStatus.COMPLETED;
				generation.completed_at = new Date();
				this.logger.log(`🎉 Generation ${generationId} completed successfully - all ${visuals.length} images generated!`);
				
				// Emit final completion event
				this.generationsService.emitGenerationCompleted(generationId, generation.user_id, GenerationStatus.COMPLETED);
			} else if (anyFailed) {
				generation.status = completedCount > 0 ? GenerationStatus.COMPLETED : GenerationStatus.FAILED;
				this.logger.error(`⚠️ Generation ${generationId} completed with ${failedCount} failures, ${completedCount} succeeded`);
				
				// Emit completion event (partial success is still completion)
				this.generationsService.emitGenerationCompleted(generationId, generation.user_id, generation.status);
			}

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
