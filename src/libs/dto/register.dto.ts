import { IsEmail, IsString, MinLength, IsOptional, IsNotEmpty } from 'class-validator';
import { ValidationMessage } from '../enums';

export class RegisterDto {
	@IsEmail({}, { message: ValidationMessage.EMAIL_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	email: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	@MinLength(6, { message: ValidationMessage.PASSWORD_TOO_SHORT })
	password: string;

	@IsString()
	@IsOptional()
	name?: string;
}
