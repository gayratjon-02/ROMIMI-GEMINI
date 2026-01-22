import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from '../libs/dto';
import { User } from '../database/entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get('getUser')
	async getUser(@CurrentUser() user: User): Promise<Omit<User, 'password_hash'>> {
		return this.usersService.findOne(user.id);
	}

	@Post('updateUser')
	async updateUser(
		@CurrentUser() user: User,
		@Body() updateUserDto: UpdateUserDto,
	): Promise<Omit<User, 'password_hash'>> {
		return this.usersService.update(user.id, updateUserDto);
	}
}
