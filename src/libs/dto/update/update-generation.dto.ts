import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { GenerationType, ValidationMessage } from '../../enums';

export class UpdateGenerationDto {
	@IsEnum(GenerationType, { message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	generation_type?: GenerationType;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	aspect_ratio?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	resolution?: string;

	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsString({ each: true, message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	prompts?: string[];

	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsString({ each: true, message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	visualTypes?: string[];
}
