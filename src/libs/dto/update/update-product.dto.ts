import { IsOptional, IsString, IsUUID, IsArray, IsObject } from 'class-validator';
import { ValidationMessage } from '../../enums';

export class UpdateProductDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	name?: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	collection_id?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	front_image_url?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	back_image_url?: string;

	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	reference_images?: string[];

	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	extracted_variables?: Record<string, any>;

	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	manual_overrides?: Record<string, any>;

	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	generated_images?: Record<string, string>;

	// New fields for 3-step workflow
	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	analyzed_product_json?: Record<string, any>;

	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	manual_product_overrides?: Record<string, any>;

	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	final_product_json?: Record<string, any>;
}
