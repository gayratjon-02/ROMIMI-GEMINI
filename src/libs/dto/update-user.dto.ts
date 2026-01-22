import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ValidationMessage } from '../enums';

export class UpdateUserDto {
	@IsEmail({}, { message: ValidationMessage.EMAIL_INVALID })
	@IsOptional()
	email?: string;

	@IsString()
	@IsOptional()
	name?: string;
}
