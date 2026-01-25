import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GenerationsService } from './generations.service';
import { GenerationsController } from './generations.controller';
import { GenerationEventsController } from './generation-events.controller';
import { GenerationProcessor } from './generation.processor';
import { Generation } from '../database/entities/generation.entity';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';
import { AiModule } from '../ai/ai.module';
import { GenerationQueueModule } from './generation.queue';
import { FilesModule } from '../files/files.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([Generation, Product, Collection]),
		JwtModule.registerAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				secret: configService.get<string>('JWT_SECRET'),
				signOptions: { expiresIn: '24h' },
			}),
			inject: [ConfigService],
		}),
		AiModule,
		GenerationQueueModule,
		FilesModule,
	],
	controllers: [GenerationsController, GenerationEventsController],
	providers: [GenerationsService, GenerationProcessor],
	exports: [GenerationsService],
})
export class GenerationsModule {}
