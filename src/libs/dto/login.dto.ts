import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ValidationMessage } from '../enums';

export class LoginDto {
	@IsEmail({}, { message: ValidationMessage.EMAIL_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	email: string;

	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	password: string;
}
