import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggingInterceptor } from './libs/interceptor/Logging.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { HttpExceptionFilter } from './common/filters';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
	const logger = new Logger('Bootstrap');

	try {
		const app = await NestFactory.create<NestExpressApplication>(AppModule, {
			logger: ['error', 'warn', 'log', 'debug', 'verbose'],
		});

		// Global exception filter
		app.useGlobalFilters(new HttpExceptionFilter());

		// Enhanced global validation pipe
		app.useGlobalPipes(
			new ValidationPipe({
				whitelist: true, // Remove unknown properties
				forbidNonWhitelisted: true, // Throw error if unknown properties exist
				transform: true, // Transform payloads to DTO instances
				transformOptions: {
					enableImplicitConversion: true, // Auto-convert types
				},
				disableErrorMessages: false, // Show detailed error messages
				validationError: {
					target: false, // Don't include target object in error
					value: false, // Don't include value in error
				},
				exceptionFactory: (errors) => {
					// Custom error formatting will be handled by HttpExceptionFilter
					return new ValidationPipe().createExceptionFactory()(errors);
				},
			}),
		);

		// Global logging interceptor
		app.useGlobalInterceptors(new LoggingInterceptor());

		const reflector = app.get(Reflector);
		app.useGlobalGuards(new JwtAuthGuard(reflector));

		// API prefix
		app.setGlobalPrefix('api');

		// Swagger/OpenAPI Documentation
		const config = new DocumentBuilder()
			.setTitle('ROMIMI Visual Generator API')
			.setDescription('Complete API documentation for ROMIMI Visual Generator - AI-powered e-commerce visual generation platform')
			.setVersion('1.0')
			.setContact('ROMIMI Team', 'https://romimi.com', 'support@romimi.com')
			.addBearerAuth(
				{
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT',
					name: 'JWT',
					description: 'Enter JWT token',
					in: 'header',
				},
				'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controller!
			)
			.addTag('Authentication', 'User authentication and registration')
			.addTag('Users', 'User profile management')
			.addTag('Brands', 'Brand management for e-commerce')
			.addTag('Collections', 'Product collection management')
			.addTag('Products', 'Product management and analysis')
			.addTag('Generations', 'AI image generation workflow')
			.addTag('Ad Recreation', 'Competitor ad analysis and recreation')
			.addTag('Files', 'File upload and management')
			.build();

		const document = SwaggerModule.createDocument(app, config);
		SwaggerModule.setup('api/docs', app, document, {
			customSiteTitle: 'ROMIMI API Documentation',
			customCss: `
				.topbar-wrapper { display: none }
				.swagger-ui .info { margin: 20px 0 }
				.swagger-ui .scheme-container { margin: 20px 0; padding: 20px; background-color: #f8f9fa; border-radius: 4px; }
			`,
			swaggerOptions: {
				persistAuthorization: true,
			},
		});

		// WebSocket removed - using polling instead

		// 🔧 Enhanced CORS for SSE support
		app.enableCors({
			origin: (origin, callback) => {
				// Allow requests with no origin (mobile apps, curl, etc.)
				if (!origin) return callback(null, true);
				
				const allowedOrigins = [
					process.env.FRONTEND_URL,
					'http://localhost:3000',
					'http://localhost:3001',
					'http://localhost:5030',
					'http://167.172.90.235:5030', // Production frontend (Droplet)
					'http://209.97.168.255:5030', // Production frontend (alt)
				].filter(Boolean);
				
				if (allowedOrigins.includes(origin)) {
					callback(null, true);
				} else {
					logger.warn(`CORS blocked origin: ${origin}`);
					callback(null, true); // Allow all for now to debug
				}
			},
			credentials: true,
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
			allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'Connection', 'X-Requested-With'],
			exposedHeaders: ['Content-Length', 'Content-Type'],
		});

		// 🚀 CRITICAL: Serve static files from uploads directory
		const configService = app.get(ConfigService);
		const uploadConfig = configService.get<any>('upload');
		if (uploadConfig?.localPath) {
			const uploadsPath = join(process.cwd(), uploadConfig.localPath);
			// Ensure directory exists
			const fs = require('fs');
			if (!fs.existsSync(uploadsPath)) {
				fs.mkdirSync(uploadsPath, { recursive: true });
			}
			
			// Serve static files from uploads directory (without /api prefix)
			app.useStaticAssets(uploadsPath, {
				prefix: `/${uploadConfig.localPath}/`,
			});
			
			logger.log(`📁 Serving static files from: ${uploadsPath} at /${uploadConfig.localPath}/`);
		}
		const port = configService.get<number>('app.port') || parseInt(process.env.PORT_API || '3000', 10);
		const host = process.env.LISTEN_HOST || '0.0.0.0';

		await app.listen(port, host);

		logger.log(`🚀 Application is running on: http://${host}:${port}`);
		logger.log(`📝 API endpoints available at: http://localhost:${port}/api`);
		logger.log(`📚 API documentation available at: http://localhost:${port}/api/docs`);
	} catch (error) {
		logger.error(' Failed to start application', error);
		process.exit(1);
	}
}

bootstrap();
