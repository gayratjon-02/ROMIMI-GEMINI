import { IsString, IsOptional } from 'class-validator';
import { ValidationMessage } from '../../enums';

export class UpdateBrandDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	name?: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	brand_brief?: string;
}
