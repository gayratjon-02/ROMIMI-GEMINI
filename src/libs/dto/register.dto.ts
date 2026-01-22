import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
	@IsEmail({}, { message: 'Email must be a valid email address' })
	email: string;

	@IsString()
	@MinLength(6, { message: 'Password must be at least 6 characters long' })
	password: string;

	@IsString()
	@IsOptional()
	name?: string;
}
