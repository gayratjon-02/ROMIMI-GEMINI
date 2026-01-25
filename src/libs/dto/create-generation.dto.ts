import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, IsIn } from 'class-validator';
import { GenerationType, ValidationMessage } from '../enums';

export class CreateGenerationDto {
	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	product_id: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	collection_id: string;

	@IsEnum(GenerationType, { message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	generation_type: GenerationType;

	// 📐 Aspect ratio validation - faqat ruxsat berilgan qiymatlar
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsIn(['4:5', '1:1', '9:16'], { message: 'Aspect ratio must be one of: 4:5, 1:1, 9:16' })
	@IsOptional()
	aspect_ratio?: string;

	// 🎯 Resolution validation - faqat ruxsat berilgan qiymatlar
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsIn(['2K', '4K'], { message: 'Resolution must be one of: 2K, 4K' })
	@IsOptional()
	resolution?: string;
}
