import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateCollectionDto, UpdateCollectionDto, FixedElementsDto, UpdatePromptTemplatesDto } from '../libs/dto';
import { User } from '../database/entities/user.entity';
import { Collection } from '../database/entities/collection.entity';

// Predefined DA (Direction Artistique) Templates - Decorators for visual generation
export interface DATemplate {
	code: string;
	name: string;
	description: string;
	fixed_elements: {
		background: string;
		lighting: string;
		decor: string[];
		model_styling: string;
		mood: string;
		color_palette: string[];
	};
}

const DA_TEMPLATES: DATemplate[] = [
	{
		code: 'ss26',
		name: 'SS26 - Summer Studio',
		description: 'Fresh summer collection with bright, natural lighting',
		fixed_elements: {
			background: 'Clean white cyclorama with soft shadows',
			lighting: 'Natural daylight simulation, soft fill light, minimal shadows',
			decor: ['Potted tropical plants', 'Natural wood elements', 'White linen drapes'],
			model_styling: 'Light beige chinos, white canvas sneakers, minimal jewelry',
			mood: 'Fresh, optimistic, breezy summer vibes',
			color_palette: ['#FFFFFF', '#F5F5DC', '#87CEEB', '#90EE90'],
		},
	},
	{
		code: 'fw26',
		name: 'FW26 - Winter Elegance',
		description: 'Sophisticated fall/winter collection with warm tones',
		fixed_elements: {
			background: 'Dark charcoal textured wall with subtle spotlight',
			lighting: 'Dramatic side lighting, warm tungsten accents, deep shadows',
			decor: ['Vintage leather armchair', 'Stacked hardcover books', 'Brass desk lamp'],
			model_styling: 'Dark wool trousers, oxford leather shoes, vintage watch',
			mood: 'Sophisticated, cozy, intellectual warmth',
			color_palette: ['#2C2C2C', '#8B4513', '#DAA520', '#F5F5DC'],
		},
	},
	{
		code: 'minimal',
		name: 'Minimal Pure',
		description: 'Ultra-clean minimalist aesthetic',
		fixed_elements: {
			background: 'Pure white infinity cove, no visible edges',
			lighting: 'Even, shadowless lighting from all sides',
			decor: [],
			model_styling: 'Black slim-fit trousers, white minimalist sneakers',
			mood: 'Clean, modern, product-focused',
			color_palette: ['#FFFFFF', '#000000', '#808080'],
		},
	},
	{
		code: 'urban',
		name: 'Urban Street',
		description: 'Contemporary urban streetwear setting',
		fixed_elements: {
			background: 'Industrial concrete wall with exposed brick accents',
			lighting: 'Mixed natural and neon accent lighting',
			decor: ['Graffiti art element', 'Metal scaffolding', 'Street signage'],
			model_styling: 'Relaxed cargo pants, chunky sneakers, silver chain',
			mood: 'Edgy, authentic, street culture',
			color_palette: ['#808080', '#FF6B6B', '#4ECDC4', '#2C3E50'],
		},
	},
	{
		code: 'nature',
		name: 'Nature Studio',
		description: 'Organic, nature-inspired studio environment',
		fixed_elements: {
			background: 'Sage green seamless paper with natural texture',
			lighting: 'Golden hour simulation, warm and soft',
			decor: ['Dried botanical arrangements', 'Raw wood stumps', 'Natural stone elements'],
			model_styling: 'Earth-tone linen pants, leather sandals, woven bracelet',
			mood: 'Organic, sustainable, earth-connected',
			color_palette: ['#A3B18A', '#588157', '#DAD7CD', '#3A5A40'],
		},
	},
	{
		code: 'luxury',
		name: 'Luxury Editorial',
		description: 'High-end luxury magazine editorial style',
		fixed_elements: {
			background: 'Rich velvet curtain backdrop in deep burgundy',
			lighting: 'Rembrandt lighting with soft gold reflectors',
			decor: ['Marble pedestal', 'Crystal decanter', 'Fresh white orchids'],
			model_styling: 'Tailored black trousers, Italian leather loafers, gold cufflinks',
			mood: 'Opulent, refined, aspirational',
			color_palette: ['#722F37', '#D4AF37', '#1C1C1C', '#F8F8FF'],
		},
	},
];

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionsController {
	constructor(private readonly collectionsService: CollectionsService) {}

	// ==================== PUBLIC ENDPOINTS (Decorators/DA Templates) ====================
	
	/**
	 * Get all DA Templates (Decorators) - PUBLIC endpoint
	 * These are predefined studio environments for product visual generation
	 */
	@Public()
	@Get('decorators')
	getDecorators(): DATemplate[] {
		return DA_TEMPLATES;
	}

	/**
	 * Get a specific DA Template by code - PUBLIC endpoint
	 */
	@Public()
	@Get('decorators/:code')
	getDecorator(@Param('code') code: string): DATemplate | null {
		return DA_TEMPLATES.find(t => t.code === code) || null;
	}

	// ==================== AUTHENTICATED ENDPOINTS ====================

	@Get('getAllCollections')
	async getAllCollections(@CurrentUser() user: User): Promise<Collection[]> {
		return this.collectionsService.findAll(user.id);
	}

	@Get('getCollection/:id')
	async getCollection(@Param('id') id: string, @CurrentUser() user: User): Promise<Collection> {
		return this.collectionsService.findOne(id, user.id);
	}

	@Post('createCollection')
	async createCollection(
		@CurrentUser() user: User,
		@Body() createCollectionDto: CreateCollectionDto,
	): Promise<Collection> {
		return this.collectionsService.create(user.id, createCollectionDto);
	}

	@Post('updateCollection/:id')
	async updateCollection(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateCollectionDto: UpdateCollectionDto,
	): Promise<Collection> {
		return this.collectionsService.update(id, user.id, updateCollectionDto);
	}

	@Post('updateFixedElements/:id')
	async updateFixedElementsCollection(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() fixedElementsDto: FixedElementsDto,
	): Promise<Collection> {
		return this.collectionsService.updateFixedElements(id, user.id, fixedElementsDto);
	}

	@Post('updatePromptTemplates/:id')
	async updatePromptTemplatesCollection(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updatePromptTemplatesDto: UpdatePromptTemplatesDto,
	): Promise<Collection> {
		return this.collectionsService.updatePromptTemplates(id, user.id, updatePromptTemplatesDto);
	}

	@Post('deleteCollection/:id')
	async deleteCollection(@Param('id') id: string, @CurrentUser() user: User): Promise<{ message: string }> {
		return this.collectionsService.remove(id, user.id);
	}
}
