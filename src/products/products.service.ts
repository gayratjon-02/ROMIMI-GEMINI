import {
	Injectable,
	NotFoundException,
	ForbiddenException,
	BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { Collection } from '../database/entities/collection.entity';
import { Generation } from '../database/entities/generation.entity';
import { ClaudeService } from '../ai/claude.service';
import { CreateProductDto, UpdateProductDto } from '../libs/dto';
import {
	NotFoundMessage,
	PermissionMessage,
	FileMessage,
	GenerationType,
	GenerationStatus,
} from '../libs/enums';

@Injectable()
export class ProductsService {
	constructor(
		@InjectRepository(Product)
		private productsRepository: Repository<Product>,
		@InjectRepository(Collection)
		private collectionsRepository: Repository<Collection>,
		@InjectRepository(Generation)
		private generationsRepository: Repository<Generation>,
		private readonly claudeService: ClaudeService,
	) {}

	async create(userId: string, createProductDto: CreateProductDto): Promise<Product> {
		const collection = await this.collectionsRepository.findOne({
			where: { id: createProductDto.collection_id },
			relations: ['brand'],
		});

		if (!collection) {
			throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
		}

		if (!collection.brand || collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		const product = this.productsRepository.create({
			name: createProductDto.name,
			collection_id: createProductDto.collection_id,
			user_id: userId,
			front_image_url: createProductDto.front_image_url || null,
			back_image_url: createProductDto.back_image_url || null,
			reference_images: createProductDto.reference_images || null,
		});

		return this.productsRepository.save(product);
	}

	async findAll(
		userId: string,
		filters: { collection_id?: string; page?: number; limit?: number },
	): Promise<{ items: Product[]; total: number; page: number; limit: number }> {
		const page = filters.page && filters.page > 0 ? filters.page : 1;
		const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
		const skip = (page - 1) * limit;

		const query = this.productsRepository
			.createQueryBuilder('product')
			.leftJoinAndSelect('product.collection', 'collection')
			.leftJoinAndSelect('collection.brand', 'brand')
			.where('brand.user_id = :userId', { userId })
			.orderBy('product.created_at', 'DESC')
			.skip(skip)
			.take(limit);

		if (filters.collection_id) {
			query.andWhere('product.collection_id = :collectionId', {
				collectionId: filters.collection_id,
			});
		}

		const [items, total] = await query.getManyAndCount();

		return { items, total, page, limit };
	}

	async findOne(id: string, userId: string): Promise<Product> {
		const product = await this.productsRepository.findOne({
			where: { id },
			relations: ['collection', 'collection.brand'],
		});

		if (!product) {
			throw new NotFoundException(NotFoundMessage.PRODUCT_NOT_FOUND);
		}

		if (!product.collection?.brand || product.collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		return product;
	}

	async update(
		id: string,
		userId: string,
		updateProductDto: UpdateProductDto,
	): Promise<Product> {
		const product = await this.findOne(id, userId);

		if (
			updateProductDto.collection_id &&
			updateProductDto.collection_id !== product.collection_id
		) {
			const collection = await this.collectionsRepository.findOne({
				where: { id: updateProductDto.collection_id },
				relations: ['brand'],
			});

			if (!collection) {
				throw new NotFoundException(NotFoundMessage.COLLECTION_NOT_FOUND);
			}

			if (!collection.brand || collection.brand.user_id !== userId) {
				throw new ForbiddenException(PermissionMessage.NOT_OWNER);
			}

			product.collection_id = updateProductDto.collection_id;
		}

		if (updateProductDto.name !== undefined) {
			product.name = updateProductDto.name;
		}

		if (updateProductDto.front_image_url !== undefined) {
			product.front_image_url = updateProductDto.front_image_url;
		}

		if (updateProductDto.back_image_url !== undefined) {
			product.back_image_url = updateProductDto.back_image_url;
		}

		if (updateProductDto.reference_images !== undefined) {
			product.reference_images = updateProductDto.reference_images;
		}

		return this.productsRepository.save(product);
	}

	async remove(id: string, userId: string): Promise<{ message: string }> {
		const product = await this.findOne(id, userId);
		
		// First, delete all related generations to avoid foreign key constraint errors
		const relatedGenerations = await this.generationsRepository.find({
			where: { product_id: id },
		});
		
		if (relatedGenerations.length > 0) {
			await this.generationsRepository.remove(relatedGenerations);
		}
		
		// Now delete the product
		await this.productsRepository.remove(product);
		return { message: 'Product deleted successfully' };
	}

	async analyzeImages(
		images: string[],
		productName?: string,
		brandBrief?: string,
	): Promise<{ prompt: string; extracted_variables: Record<string, any> }> {
		if (!images.length) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const extractedVariables = await this.claudeService.analyzeProduct({
			images,
			productName,
			brandBrief,
		});

		const prompts = await this.claudeService.generatePrompts({
			productName,
			brandBrief,
			extractedVariables,
			count: 1,
		});

		return {
			prompt: prompts[0] || '',
			extracted_variables: extractedVariables,
		};
	}

	async analyzeProduct(
		id: string,
		userId: string,
	): Promise<{ extracted_variables: Record<string, any>; visuals: any[] }> {
		const product = await this.productsRepository.findOne({
			where: { id },
			relations: ['collection', 'collection.brand'],
		});

		if (!product) {
			throw new NotFoundException(NotFoundMessage.PRODUCT_NOT_FOUND);
		}

		if (!product.collection?.brand || product.collection.brand.user_id !== userId) {
			throw new ForbiddenException(PermissionMessage.NOT_OWNER);
		}

		const images = [
			product.front_image_url,
			product.back_image_url,
			...(product.reference_images || []),
		].filter(Boolean) as string[];

		if (!images.length) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		// Step 1: Analyze product images to extract variables
		const extractedVariables = await this.claudeService.analyzeProduct({
			images,
			productName: product.name,
			brandBrief: product.collection.brand.brand_brief || undefined,
		});

		// Step 2: Generate structured visuals (6 objects with all required fields)
		const visuals = await this.claudeService.generateStructuredVisuals({
			images,
			productName: product.name,
			brandBrief: product.collection.brand.brand_brief || undefined,
			extractedVariables,
			fixedElements: product.collection.fixed_elements || undefined,
			promptTemplates: product.collection.prompt_templates || undefined,
			count: 6,
		});

		// Step 3: Save extracted_variables to product
		product.extracted_variables = extractedVariables;
		await this.productsRepository.save(product);

		// Step 4: Create generation with visuals and status = "processing"
		const generation = this.generationsRepository.create({
			product_id: product.id,
			collection_id: product.collection_id,
			user_id: userId,
			generation_type: GenerationType.PRODUCT_VISUALS,
			visuals: visuals.map(v => ({ ...v, status: 'pending' })), // Initialize with pending status
			status: GenerationStatus.PROCESSING, // Set to processing as per spec
		});

		await this.generationsRepository.save(generation);

		// Step 5: Return exactly as spec requires
		return {
			extracted_variables: extractedVariables,
			visuals: visuals,
		};
	}
}
