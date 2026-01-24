import { Processor, Process, OnQueueEvent, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Generation } from '../database/entities/generation.entity';
import { GeminiService } from '../ai/gemini.service';
import { GenerationStatus } from '../libs/enums';
import { GenerationsService } from './generations.service';

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

			// Process each prompt sequentially with progress updates
			const results: any[] = [];
			for (let i = 0; i < prompts.length; i++) {
				const prompt = prompts[i];
				
				// Update progress
				job.progress(Math.round(((i + 1) / prompts.length) * 100));
				
				// Update visual status
				if (visuals[i]) {
					visuals[i].status = 'processing';
					generation.visuals = visuals;
					await this.generationsRepository.save(generation);
					
					// Emit processing event immediately
					this.generationsService.emitVisualProcessing(generationId, i, visuals[i].type);
				}

				try {
					this.logger.log(`Generating image ${i + 1}/${prompts.length} for generation ${generationId}`);
					
					const result = await this.geminiService.generateImage(prompt, model);
					
					// Update visual with result
					visuals[i] = {
						...visuals[i],
						prompt,
						mimeType: result.mimeType,
						data: result.data,
						text: result.text,
						status: 'completed',
						image_url: result.data ? `data:${result.mimeType};base64,${result.data}` : null,
						generated_at: new Date().toISOString(),
					};

					results.push(result);
					
					// Save progress
					generation.visuals = visuals;
					await this.generationsRepository.save(generation);
					
					// Emit completion event immediately
					this.generationsService.emitVisualCompleted(generationId, i, visuals[i]);
					
					this.logger.log(`Completed image ${i + 1}/${prompts.length} for generation ${generationId}`);
				} catch (error: any) {
					this.logger.error(`Failed to generate image ${i + 1}/${prompts.length}: ${error?.message || error}`);
					
					// Mark visual as failed
					visuals[i] = {
						...visuals[i],
						status: 'failed',
						error: error?.message || 'Unknown error',
					};
					
					generation.visuals = visuals;
					await this.generationsRepository.save(generation);
					
					// Emit failure event immediately
					this.generationsService.emitVisualFailed(generationId, i, error?.message || 'Unknown error');
				}
			}

			// Check if all visuals completed successfully
			const allCompleted = visuals.every((v) => v.status === 'completed');
			const anyFailed = visuals.some((v) => v.status === 'failed');

			if (allCompleted) {
				generation.status = GenerationStatus.COMPLETED;
				generation.completed_at = new Date();
				this.logger.log(`Generation ${generationId} completed successfully`);
				
				// Emit final completion event
				const completedCount = visuals.filter(v => v.status === 'completed').length;
				this.generationsService.emitGenerationCompleted(generationId, completedCount, visuals.length);
			} else if (anyFailed) {
				generation.status = GenerationStatus.FAILED;
				this.logger.error(`Generation ${generationId} failed - some visuals failed`);
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
