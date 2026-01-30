import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { RegisterDto, LoginDto, AuthResponseDto } from '../libs/dto';
import { AuthMessage } from '../libs/enums';

@Injectable()
export class AuthService {
	constructor(
		@InjectRepository(User)
		private usersRepository: Repository<User>,
		private jwtService: JwtService,
	) {}

	async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
		const { email, password, name } = registerDto;

		// Check if user already exists
		const existingUser = await this.usersRepository.findOne({
			where: { email },
		});

		if (existingUser) {
			throw new ConflictException(AuthMessage.USER_ALREADY_EXISTS);
		}

		// Hash password
		const saltRounds = 10;
		const password_hash = await bcrypt.hash(password, saltRounds);

		// Create user
		const user = this.usersRepository.create({
			email,
			password_hash,
			name: name || null,
		});

		const savedUser = await this.usersRepository.save(user);

		// Generate JWT token
		const payload = { sub: savedUser.id, email: savedUser.email };
		const access_token = this.jwtService.sign(payload);

		return {
			access_token,
			user: {
				id: savedUser.id,
				email: savedUser.email,
				name: savedUser.name,
			},
		};
	}

	async login(loginDto: LoginDto): Promise<AuthResponseDto> {
		const { email, password } = loginDto;

		// Find user (select only columns that exist before migration)
		const user = await this.usersRepository
			.createQueryBuilder('user')
			.select([
				'user.id',
				'user.email',
				'user.name',
				'user.password_hash',
			])
			.where('user.email = :email', { email })
			.getOne();

		if (!user) {
			throw new UnauthorizedException(AuthMessage.INVALID_EMAIL_OR_PASSWORD);
		}

		// Verify password
		const isPasswordValid = await bcrypt.compare(password, user.password_hash);

		if (!isPasswordValid) {
			throw new UnauthorizedException(AuthMessage.INVALID_EMAIL_OR_PASSWORD);
		}

		// Generate JWT token
		const payload = { sub: user.id, email: user.email };
		const access_token = this.jwtService.sign(payload);

		return {
			access_token,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
		};
	}
}
