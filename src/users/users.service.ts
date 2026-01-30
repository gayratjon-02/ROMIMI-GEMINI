import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { UpdateUserDto } from '../libs/dto';
import { NotFoundMessage, AuthMessage } from '../libs/enums';

@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(User)
		private usersRepository: Repository<User>,
	) {}

	// Helper to mask API keys for security
	private maskApiKey(key: string | null): string | null {
		if (!key) return null;
		if (key.length <= 8) return '****';
		return key.substring(0, 4) + '****' + key.substring(key.length - 4);
	}

	async findOne(id: string): Promise<User> {
		const user = await this.usersRepository.findOne({
			where: { id },
			select: [
				'id',
				'email',
				'name',
				'brand_brief',
				'api_key_openai',
				'api_key_anthropic',
				'api_key_gemini',
				'claude_model',
				'gemini_model',
				'language',
				'theme',
				'notifications_enabled',
				'created_at',
				'updated_at',
			],
		});

		if (!user) {
			throw new NotFoundException(NotFoundMessage.USER_NOT_FOUND);
		}

		// Mask API keys before returning
		return {
			...user,
			api_key_openai: this.maskApiKey(user.api_key_openai),
			api_key_anthropic: this.maskApiKey(user.api_key_anthropic),
			api_key_gemini: this.maskApiKey(user.api_key_gemini),
		} as User;
	}

	async getSettings(id: string): Promise<Partial<User>> {
		const user = await this.usersRepository.findOne({
			where: { id },
			select: [
				'id',
				'email',
				'name',
				'brand_brief',
				'api_key_openai',
				'api_key_anthropic',
				'api_key_gemini',
				'claude_model',
				'gemini_model',
				'language',
				'theme',
				'notifications_enabled',
			],
		});

		if (!user) {
			throw new NotFoundException(NotFoundMessage.USER_NOT_FOUND);
		}

		// Return with masked API keys and has_key flags
		return {
			...user,
			api_key_openai: this.maskApiKey(user.api_key_openai),
			api_key_anthropic: this.maskApiKey(user.api_key_anthropic),
			api_key_gemini: this.maskApiKey(user.api_key_gemini),
		};
	}

	async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
		const user = await this.usersRepository.findOne({
			where: { id },
		});

		if (!user) {
			throw new NotFoundException(NotFoundMessage.USER_NOT_FOUND);
		}

		// Check if email is being changed and if it's already taken
		if (updateUserDto.email && updateUserDto.email !== user.email) {
			const existingUser = await this.usersRepository.findOne({
				where: { email: updateUserDto.email },
			});

			if (existingUser) {
				throw new ConflictException(AuthMessage.USER_ALREADY_EXISTS);
			}
		}

		// Update user
		Object.assign(user, updateUserDto);
		const updatedUser = await this.usersRepository.save(user);

		// Return without password_hash and with masked API keys
		const { password_hash, ...result } = updatedUser;
		return {
			...result,
			api_key_openai: this.maskApiKey(result.api_key_openai),
			api_key_anthropic: this.maskApiKey(result.api_key_anthropic),
			api_key_gemini: this.maskApiKey(result.api_key_gemini),
		} as User;
	}

	async updateApiKey(
		id: string,
		keyType: 'openai' | 'anthropic' | 'gemini',
		apiKey: string | null,
	): Promise<{ success: boolean; message: string }> {
		const user = await this.usersRepository.findOne({
			where: { id },
		});

		if (!user) {
			throw new NotFoundException(NotFoundMessage.USER_NOT_FOUND);
		}

		const fieldMap = {
			openai: 'api_key_openai',
			anthropic: 'api_key_anthropic',
			gemini: 'api_key_gemini',
		};

		user[fieldMap[keyType]] = apiKey;
		await this.usersRepository.save(user);

		return {
			success: true,
			message: apiKey ? `${keyType} API key updated` : `${keyType} API key removed`,
		};
	}

	/**
	 * Get user's raw API keys (not masked) - for internal use only
	 */
	async getUserApiKeys(id: string): Promise<{
		api_key_openai: string | null;
		api_key_anthropic: string | null;
		api_key_gemini: string | null;
		claude_model: string | null;
		gemini_model: string | null;
	}> {
		const user = await this.usersRepository.findOne({
			where: { id },
			select: ['api_key_openai', 'api_key_anthropic', 'api_key_gemini', 'claude_model', 'gemini_model'],
		});

		if (!user) {
			throw new NotFoundException(NotFoundMessage.USER_NOT_FOUND);
		}

		return {
			api_key_openai: user.api_key_openai || null,
			api_key_anthropic: user.api_key_anthropic || null,
			api_key_gemini: user.api_key_gemini || null,
			claude_model: user.claude_model || null,
			gemini_model: user.gemini_model || null,
		};
	}
}
