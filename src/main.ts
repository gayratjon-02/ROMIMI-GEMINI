import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
	const logger = new Logger('Bootstrap');

	try {
		const app = await NestFactory.create(AppModule, {
			logger: ['error', 'warn', 'log', 'debug', 'verbose'],
		});

		// Global validation pipe
		app.useGlobalPipes(
			new ValidationPipe({
				whitelist: true, // Remove unknown properties
				forbidNonWhitelisted: true, // Throw error if unknown properties exist
				transform: true, // Transform payloads to DTO instances
			}),
		);

		// API prefix
		app.setGlobalPrefix('api');

		// CORS setup (frontend uchun)
		app.enableCors({
			origin: process.env.FRONTEND_URL || '*',
			credentials: true,
		});

		const configService = app.get(ConfigService);
		const port = configService.get<number>('app.port') || parseInt(process.env.PORT_API || '3000', 10);

		await app.listen(port);

		logger.log(`🚀 Application is running on: http://localhost:${port}`);
		logger.log(`📝 API endpoints available at: http://localhost:${port}/api`);
	} catch (error) {
		logger.error(' Failed to start application', error);
		process.exit(1);
	}
}

bootstrap();
