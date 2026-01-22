import { IsOptional, IsString } from 'class-validator';
import { ValidationMessage } from '../enums';

export class FixedElementsDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	background?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	styling?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	decor?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	quality?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	lighting?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	camera_defaults?: string;
}
