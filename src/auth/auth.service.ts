import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { RegisterDto, LoginDto, AuthResponseDto } from '../libs/dto';

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
			throw new ConflictException('User with this email already exists');
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

		// Find user
		const user = await this.usersRepository.findOne({
			where: { email },
		});

		if (!user) {
			throw new UnauthorizedException('Invalid email or password');
		}

		// Verify password
		const isPasswordValid = await bcrypt.compare(password, user.password_hash);

		if (!isPasswordValid) {
			throw new UnauthorizedException('Invalid email or password');
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
