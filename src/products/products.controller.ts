import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	UseGuards,
	UseInterceptors,
	UploadedFiles,
	Query,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProductDto, UpdateProductDto, UploadProductDto } from '../libs/dto';
import { User } from '../database/entities/user.entity';
import { Product } from '../database/entities/product.entity';
import { FilesService } from '../files/files.service';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
	constructor(
		private readonly productsService: ProductsService,
		private readonly filesService: FilesService,
	) {}

	@Post('createProduct')
	@UseInterceptors(
		FileFieldsInterceptor([
			{ name: 'front_image', maxCount: 1 },
			{ name: 'back_image', maxCount: 1 },
			{ name: 'reference_images', maxCount: 10 },
		]),
	)
	async create(
		@CurrentUser() user: User,
		@Body() uploadProductDto: UploadProductDto,
		@UploadedFiles()
		files: {
			front_image?: Express.Multer.File[];
			back_image?: Express.Multer.File[];
			reference_images?: Express.Multer.File[];
		},
	): Promise<Product> {
		const frontImage = files?.front_image?.[0];
		const backImage = files?.back_image?.[0];
		const referenceImages = files?.reference_images || [];

		const storedFront = frontImage ? await this.filesService.storeImage(frontImage) : null;
		const storedBack = backImage ? await this.filesService.storeImage(backImage) : null;
		const storedRefs = referenceImages.length
			? await Promise.all(referenceImages.map((file) => this.filesService.storeImage(file)))
			: [];

		const createProductDto: CreateProductDto = {
			name: uploadProductDto.name,
			collection_id: uploadProductDto.collection_id,
			front_image_url: storedFront?.url || null,
			back_image_url: storedBack?.url || null,
			reference_images: storedRefs.map((item) => item.url),
		};

		return this.productsService.create(user.id, createProductDto);
	}

	@Get('getAllProducts')
	async getAllProducts(
		@CurrentUser() user: User,
		@Query('collection_id') collectionId?: string,
		@Query('page') page?: string,
		@Query('limit') limit?: string,
	): Promise<{ items: Product[]; total: number; page: number; limit: number }> {
		return this.productsService.findAll(user.id, {
			collection_id: collectionId,
			page: page ? parseInt(page, 10) : undefined,
			limit: limit ? parseInt(limit, 10) : undefined,
		});
	}

	@Get('getProduct/:id')
	async getProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<Product> {
		return this.productsService.findOne(id, user.id);
	}

	@Post('updateProduct/:id')
	async updateProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
		@Body() updateProductDto: UpdateProductDto,
	): Promise<Product> {
		return this.productsService.update(id, user.id, updateProductDto);
	}

	@Post('deleteProduct/:id')
	async deleteProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ message: string }> {
		return this.productsService.remove(id, user.id);
	}

	@Post(':id/analyze')
	async analyzeProduct(
		@Param('id') id: string,
		@CurrentUser() user: User,
	): Promise<{ extracted_variables: Record<string, any>; generations: Array<{ id: string; visuals: any[] }> }> {
		return this.productsService.analyzeProduct(id, user.id);
	}
}
