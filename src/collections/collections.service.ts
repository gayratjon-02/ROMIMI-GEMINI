import {
	Injectable,
	NotFoundException,
	ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Collection } from '../database/entities/collection.entity';
import { Brand } from '../database/entities/brand.entity';
import {
	CreateCollectionDto,
	UpdateCollectionDto,
	FixedElementsDto,
	UpdatePromptTemplatesDto,
} from '../libs/dto';
import { NotFoundMessage, PermissionMessage } from '../libs/enums';

@Injectable()
export class CollectionsService {
	constructor(
		@InjectRepository(Collection)
		private collectionsRepository: Repository<Collection>,
		@InjectRepository(Brand)
		private brandsRepository: Repository<Brand>,
	) {}

	async create(
		userId: string,
		createCollectionDto: CreateCollectionDto,
	): Promise<Collection> {
		const brand = await this.brandsRepository.findOne({
			where: { id: createCollectionDto.brand_id },
		});

		if (!brand) {
			throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
		}

		if (brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		const collection = this.collectionsRepository.create({
			name: createCollectionDto.name,
			brand_id: createCollectionDto.brand_id,
			fixed_elements: createCollectionDto.fixed_elements || null,
			prompt_templates: createCollectionDto.prompt_templates || null,
		});

		return this.collectionsRepository.save(collection);
	}

	async findAll(userId: string): Promise<Collection[]> {
		return this.collectionsRepository.find({
			relations: ['brand'],
			where: { brand: { user_id: userId } },
			order: { created_at: 'DESC' },
		});
	}

	async findOne(id: string, userId: string): Promise<Collection> {
		const collection = await this.collectionsRepository.findOne({
			where: { id },
			relations: ['brand'],
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		if (!collection.brand || collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return collection;
	}

	async update(
		id: string,
		userId: string,
		updateCollectionDto: UpdateCollectionDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);

		if (
			updateCollectionDto.brand_id &&
			updateCollectionDto.brand_id !== collection.brand_id
		) {
			const brand = await this.brandsRepository.findOne({
				where: { id: updateCollectionDto.brand_id },
			});

			if (!brand) {
				throw new NotFoundException(NotFoundMessage.BRAND_NOT_FOUND);
			}

			if (brand.user_id !== userId) {
				throw new ForbiddenException(PermissionMessage.NOT_OWNER);
			}

			collection.brand_id = updateCollectionDto.brand_id;
		}

		if (updateCollectionDto.name !== undefined) {
			collection.name = updateCollectionDto.name;
		}

		if (updateCollectionDto.fixed_elements !== undefined) {
			collection.fixed_elements = updateCollectionDto.fixed_elements;
		}

		if (updateCollectionDto.prompt_templates !== undefined) {
			collection.prompt_templates = updateCollectionDto.prompt_templates;
		}

		return this.collectionsRepository.save(collection);
	}

	async updateFixedElements(
		id: string,
		userId: string,
		fixedElementsDto: FixedElementsDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);
		collection.fixed_elements = fixedElementsDto;
		return this.collectionsRepository.save(collection);
	}

	async updatePromptTemplates(
		id: string,
		userId: string,
		updatePromptTemplatesDto: UpdatePromptTemplatesDto,
	): Promise<Collection> {
		const collection = await this.findOne(id, userId);
		collection.prompt_templates = updatePromptTemplatesDto.prompt_templates;
		return this.collectionsRepository.save(collection);
	}

	async remove(id: string, userId: string): Promise<{ message: string }> {
		const collection = await this.findOne(id, userId);
		await this.collectionsRepository.remove(collection);
		return { message: 'Collection deleted successfully' };
	}
}
