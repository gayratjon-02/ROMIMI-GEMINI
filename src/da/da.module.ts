import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DAController } from './da.controller';
import { DAService } from './da.service';
import { DAPreset } from '../database/entities/da-preset.entity';
import { AiModule } from '../ai/ai.module';
import { FilesModule } from '../files/files.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([DAPreset]),
		AiModule,
		FilesModule,
	],
	controllers: [DAController],
	providers: [DAService],
	exports: [DAService],
})
export class DAModule {}
