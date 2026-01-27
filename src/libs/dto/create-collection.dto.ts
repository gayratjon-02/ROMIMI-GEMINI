import {
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	IsObject,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ValidationMessage } from '../enums';
import { FixedElementsDto } from './fixed-elements.dto';

export class CreateCollectionDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	name: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	brand_id: string;

	@IsString()
	@IsOptional()
	code?: string;

	@IsString()
	@IsOptional()
	description?: string;

	@ValidateNested()
	@Type(() => FixedElementsDto)
	@IsOptional()
	fixed_elements?: FixedElementsDto;

	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	prompt_templates?: Record<string, any>;
}
