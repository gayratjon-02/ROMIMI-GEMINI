import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { Collection } from '../database/entities/collection.entity';
import { Brand } from '../database/entities/brand.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Collection, Brand])],
	controllers: [CollectionsController],
	providers: [CollectionsService],
	exports: [CollectionsService],
})
export class CollectionsModule {}
