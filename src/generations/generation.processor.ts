import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Generation } from '../database/entities/generation.entity';
import { Product } from '../database/entities/product.entity';
import { GeminiService } from '../ai/gemini.service';
import { GenerationStatus } from '../libs/enums';
import { GenerationsService } from './generations.service';
import { FilesService } from '../files/files.service';

export interface GenerationJobData {
	generationId: string;
	prompts: string[];
	visualTypes?: string[];
	model?: string;
}

@Processor('generation')
export class GenerationProcessor {
	private readonly logger = new Logger(GenerationProcessor.name);

	constructor(
		@InjectRepository(Generation)
		private readonly generationsRepository: Repository<Generation>,
		@InjectRepository(Product)
		private readonly productsRepository: Repository<Product>,
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

		// Set started_at when generation begins processing
		if (!generation.started_at) {
			generation.started_at = new Date();
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

			// 🚀 PARALLEL GENERATION: All images at once for maximum speed
			this.logger.log(`🚀 STARTING PARALLEL GENERATION: ${prompts.length} images for generation ${generationId}`);
			
			// Mark all as processing
			visuals.forEach(v => v.status = 'processing');
			generation.visuals = visuals;
			await this.generationsRepository.save(generation);

			// Generation started - frontend will poll for updates
			
			const geminiModel = model || process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';
			
			// Process ALL images in parallel
			const imagePromises = prompts.map(async (prompt, i) => {
				const visualType = visuals[i]?.type || `visual_${i}`;
				this.logger.log(`🎨 [${i + 1}/${prompts.length}] Starting ${visualType}...`);
				
				try {
					const result = await this.geminiService.generateImage(
						prompt, 
						geminiModel,
						generation.aspect_ratio,
						generation.resolution
					);
					
					// Save image
					let imageUrl: string | null = null;
					let imageFilename: string | null = null;
					if (result.data) {
						try {
							const storedFile = await this.filesService.storeBase64Image(result.data, result.mimeType);
							imageUrl = storedFile.url;
							imageFilename = storedFile.filename;
						} catch (fileError: any) {
							this.logger.error(`❌ Save failed for ${visualType}: ${fileError.message}`);
							imageUrl = `data:${result.mimeType};base64,${result.data}`;
						}
					}
					
					// Update visual immediately
					visuals[i] = {
						...visuals[i],
						prompt,
						mimeType: result.mimeType,
						status: 'completed',
						image_url: imageUrl,
						image_filename: imageFilename,
						generated_at: new Date().toISOString(),
					};
					
					// Save to DB immediately so frontend can see it
					generation.visuals = [...visuals];
					await this.generationsRepository.save(generation);
					
					this.logger.log(`✅ [${i + 1}/${prompts.length}] ${visualType} completed!`);
					
					// Update progress
					const completed = visuals.filter(v => v.status === 'completed' || v.status === 'failed').length;
					generation.progress_percent = Math.round((completed / prompts.length) * 100);
					generation.completed_visuals_count = visuals.filter(v => v.status === 'completed').length;
					await this.generationsRepository.save(generation);
					job.progress(generation.progress_percent);

					// Image saved to DB - frontend will poll and see it
					
					return { success: true, index: i };
				} catch (error: any) {
					this.logger.error(`❌ [${i + 1}/${prompts.length}] ${visualType} failed: ${error?.message}`);
					
					visuals[i] = {
						...visuals[i],
						status: 'failed',
						error: error?.message || 'Unknown error',
					};
					
					generation.visuals = [...visuals];
					await this.generationsRepository.save(generation);

					const completed = visuals.filter(v => v.status === 'completed' || v.status === 'failed').length;
					generation.progress_percent = Math.round((completed / prompts.length) * 100);
					generation.completed_visuals_count = visuals.filter(v => v.status === 'completed').length;
					await this.generationsRepository.save(generation);

					// Failed image saved to DB - frontend will poll and see it
					
					return { success: false, index: i, error: error?.message };
				}
			});
			
			// Wait for all to complete
			await Promise.allSettled(imagePromises);
			
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
			
			// Final progress update
			generation.progress_percent = 100;
			generation.completed_visuals_count = completedCount;
			
			this.logger.log(`📊 Generation ${generationId} finished: ${completedCount} completed, ${failedCount} failed`);

			await this.generationsRepository.save(generation);

			// Generation complete - frontend will poll and see final status

			// Save generated image filenames to product for quick access later
			if (generation.product_id && completedCount > 0) {
				try {
					const product = await this.productsRepository.findOne({
						where: { id: generation.product_id },
					});
					
					if (product) {
						const generatedImages: Record<string, string> = {};
						for (const visual of visuals) {
							if (visual.status === 'completed' && visual.image_filename) {
								generatedImages[visual.type] = visual.image_filename;
							}
						}
						
						if (Object.keys(generatedImages).length > 0) {
							product.generated_images = generatedImages;
							await this.productsRepository.save(product);
							this.logger.log(`📦 Saved ${Object.keys(generatedImages).length} generated images to product ${product.id}`);
						}
					}
				} catch (err: any) {
					this.logger.warn(`⚠️ Failed to save generated images to product: ${err.message}`);
				}
			}

			// Pre-generate ZIP archive when all images are completed (background, non-blocking)
			if (allCompleted && completedCount > 0) {
				this.generationsService.preGenerateZipArchive(generationId).catch((err) => {
					this.logger.warn(`⚠️ Failed to pre-generate ZIP: ${err.message}`);
				});
			}
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
