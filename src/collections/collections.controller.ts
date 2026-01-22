import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	UseGuards,
} from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
	CreateCollectionDto,
	UpdateCollectionDto,
	FixedElementsDto,
	UpdatePromptTemplatesDto,
} from '../libs/dto';
import { User } from '../database/entities/user.entity';
import { Collection } from '../database/entities/collection.entity';

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionsController {
	constructor(private readonly collectionsService: CollectionsService) {}

	@Get()
	async getAll(@CurrentUser() user: User): Promise<Collection[]> {
		return this.collectionsService.findAll(user.id);
	}

	@Get(':id')
	async getOne(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<Collection> {
		return this.collectionsService.findOne(id, user.id);
	}

	@Post()
	async create(
		@CurrentUser() user: User,
		@Body() createCollectionDto: CreateCollectionDto,
	): Promise<Collection> {
		return this.collectionsService.create(user.id, createCollectionDto);
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateCollectionDto: UpdateCollectionDto,
	): Promise<Collection> {
		return this.collectionsService.update(id, user.id, updateCollectionDto);
	}

	@Put(':id/fixed-elements')
	async updateFixedElements(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() fixedElementsDto: FixedElementsDto,
	): Promise<Collection> {
		return this.collectionsService.updateFixedElements(
			id,
			user.id,
			fixedElementsDto,
		);
	}

	@Put(':id/prompt-templates')
	async updatePromptTemplates(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updatePromptTemplatesDto: UpdatePromptTemplatesDto,
	): Promise<Collection> {
		return this.collectionsService.updatePromptTemplates(
			id,
			user.id,
			updatePromptTemplatesDto,
		);
	}

	@Delete(':id')
	async remove(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ message: string }> {
		return this.collectionsService.remove(id, user.id);
	}
}
