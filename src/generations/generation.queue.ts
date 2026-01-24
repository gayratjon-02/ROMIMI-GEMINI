import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Generation } from '../database/entities/generation.entity';
import { GenerationProcessor } from './generation.processor';
import { AiModule } from '../ai/ai.module';
import { GenerationsService } from './generations.service';

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
		TypeOrmModule.forFeature([Generation]),
		AiModule,
	],
	providers: [GenerationProcessor, GenerationsService],
	exports: [BullModule],
})
export class GenerationQueueModule {}
