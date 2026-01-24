import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

@Module({
	imports: [
		BullModule.registerQueue({
			name: 'generation',
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: 'exponential',
					delay: 2000,
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
