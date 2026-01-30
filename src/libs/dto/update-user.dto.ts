import { IsString, IsOptional, IsEmail, IsBoolean } from 'class-validator';
import { ValidationMessage } from '../enums';

export class UpdateUserDto {
	@IsEmail({}, { message: ValidationMessage.EMAIL_INVALID })
	@IsOptional()
	email?: string;

	@IsString()
	@IsOptional()
	name?: string;

	@IsString()
	@IsOptional()
	brand_brief?: string;

	@IsString()
	@IsOptional()
	api_key_openai?: string;

	@IsString()
	@IsOptional()
	api_key_anthropic?: string;

	@IsString()
	@IsOptional()
	api_key_gemini?: string;

	@IsString()
	@IsOptional()
	claude_model?: string;

	@IsString()
	@IsOptional()
	gemini_model?: string;

	@IsString()
	@IsOptional()
	language?: string;

	@IsString()
	@IsOptional()
	theme?: string;

	@IsBoolean()
	@IsOptional()
	notifications_enabled?: boolean;
}
