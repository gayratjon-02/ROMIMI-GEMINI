import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

@Module({
	imports: [
		BullModule.registerQueue({
			name: 'generation',
			// Increase stall interval for long-running image generation jobs
			settings: {
				stalledInterval: 300000, // 5 minutes - check for stalled jobs every 5 min
				maxStalledCount: 3, // Allow job to be stalled 3 times before failing
				lockDuration: 600000, // 10 minutes - lock duration for processing
				lockRenewTime: 300000, // 5 minutes - renew lock every 5 min
			},
			defaultJobOptions: {
				attempts: 2, // Reduce retries to avoid duplicate generations
				timeout: 900000, // 15 minutes timeout per job
				backoff: {
					type: 'exponential',
					delay: 5000,
				},
				removeOnComplete: {
					age: 3600, // Keep completed jobs for 1 hour
					count: 100, // Keep last 100 completed jobs
				},
				removeOnFail: {
					age: 86400, // Keep failed jobs for 24 hours
				},
			},
		}),
	],
	exports: [BullModule],
})
export class GenerationQueueModule {}
