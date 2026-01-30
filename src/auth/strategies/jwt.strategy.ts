import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { AuthMessage } from '../../libs/enums';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		private configService: ConfigService,
		@InjectRepository(User)
		private usersRepository: Repository<User>,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.get<string>('jwt.secret'),
		});
	}

	async validate(payload: any): Promise<User> {
		// Select only columns that exist before migration (claude_model/gemini_model may not exist yet)
		const user = await this.usersRepository
			.createQueryBuilder('user')
			.select([
				'user.id',
				'user.email',
				'user.name',
				'user.password_hash',
				'user.brand_brief',
				'user.api_key_openai',
				'user.api_key_anthropic',
				'user.api_key_gemini',
				'user.language',
				'user.theme',
				'user.notifications_enabled',
				'user.created_at',
				'user.updated_at',
			])
			.where('user.id = :id', { id: payload.sub })
			.getOne();

		if (!user) {
			throw new UnauthorizedException(AuthMessage.UNAUTHORIZED);
		}

		return user as User;
	}
}
