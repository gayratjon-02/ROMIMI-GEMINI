import { IsArray, IsOptional, IsString } from 'class-validator';
import { ValidationMessage } from '../enums';

export class GenerateDto {
	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsString({ each: true, message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	prompts?: string[];

	@IsArray({ message: ValidationMessage.FIELD_INVALID })
	@IsString({ each: true, message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	visualTypes?: string[];

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	model?: string;
}
