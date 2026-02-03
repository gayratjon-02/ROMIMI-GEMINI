import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ValidationMessage } from '../enums';

export class UploadProductDto {
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	@MaxLength(255, { message: ValidationMessage.FIELD_INVALID })
	name: string;

	@IsUUID('4', { message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	collection_id: string;
}
