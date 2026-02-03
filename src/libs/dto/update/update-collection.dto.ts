import {
	IsOptional,
	IsString,
	IsUUID,
	IsObject,
	ValidateNested,
	IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ValidationMessage } from '../../enums';
import { FixedElementsDto } from '../fixed-elements.dto';

export class UpdateCollectionDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	name?: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	brand_id?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	da_reference_image_url?: string;

	@ValidateNested()
	@Type(() => FixedElementsDto)
	@IsOptional()
	fixed_elements?: FixedElementsDto;

	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	prompt_templates?: Record<string, any>;
}
