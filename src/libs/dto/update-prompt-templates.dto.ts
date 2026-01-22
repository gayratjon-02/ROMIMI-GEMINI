import { IsNotEmpty, IsObject } from 'class-validator';
import { ValidationMessage } from '../enums';

export class UpdatePromptTemplatesDto {
	@IsObject({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	prompt_templates: Record<string, any>;
}
