import {
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	IsArray,
	MaxLength,
	ArrayMaxSize,
} from 'class-validator';
import { ValidationMessage } from '../../enums';

/**
 * Internal DTO for create product (built from UploadProductDto + stored image URLs).
 * Client workflow: CREATE (images + name) → ANALYZE → EDIT → MERGE → GENERATE.
 */
export class CreateProductDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	@MaxLength(255, { message: ValidationMessage.FIELD_INVALID })
	name: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	collection_id: string;

	/** Front packshot URL (required at create). */
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	front_image_url?: string;

	/** Back packshot URL (optional). */
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	back_image_url?: string;

	/** Reference image URLs, e.g. logos, details (optional, up to 12). */
	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	@ArrayMaxSize(12, { message: ValidationMessage.FIELD_INVALID })
	reference_images?: string[];
}
