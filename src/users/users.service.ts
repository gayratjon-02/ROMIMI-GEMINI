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

	async findOne(id: string): Promise<User> {
		const user = await this.usersRepository.findOne({
			where: { id },
			select: ['id', 'email', 'name', 'created_at', 'updated_at'],
		});

		if (!user) {
			throw new NotFoundException(NotFoundMessage.USER_NOT_FOUND);
		}

		return user;
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

		// Return without password_hash
		const { password_hash, ...result } = updatedUser;
		return result as User;
	}
}
