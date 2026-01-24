import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationsService } from './generations.service';
import { GenerationsController } from './generations.controller';
import { GenerationEventsController } from './generation-events.controller';
import { Generation } from '../database/entities/generation.entity';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';
import { AiModule } from '../ai/ai.module';
import { GenerationQueueModule } from './generation.queue';

@Module({
	imports: [
		TypeOrmModule.forFeature([Generation, Product, Collection]),
		AiModule,
		GenerationQueueModule,
	],
	controllers: [GenerationsController, GenerationEventsController],
	providers: [GenerationsService],
	exports: [GenerationsService],
})
export class GenerationsModule {}
