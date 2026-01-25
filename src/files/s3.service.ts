import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class S3Service {
	private readonly logger = new Logger(S3Service.name);
	private readonly s3Client: S3Client | null = null;
	private readonly bucket: string;
	private readonly baseUrl: string;
	private readonly enabled: boolean;

	constructor(private readonly configService: ConfigService) {
		const uploadConfig = this.configService.get<any>('upload');
		this.bucket = uploadConfig.s3?.bucket || process.env.AWS_BUCKET;
		this.baseUrl = uploadConfig.baseUrl || process.env.UPLOAD_BASE_URL || '';
		this.enabled = !!this.bucket && !!process.env.AWS_ACCESS_KEY_ID;

		if (this.enabled) {
			const s3Config: any = {
				region: uploadConfig.s3?.region || process.env.AWS_REGION || 'us-east-1',
				credentials: {
					accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
					secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
				},
			};

			// Support S3-compatible endpoints (R2, MinIO, etc.)
			if (uploadConfig.s3?.endpoint) {
				s3Config.endpoint = uploadConfig.s3.endpoint;
				s3Config.forcePathStyle = uploadConfig.s3.forcePathStyle || false;
			}

			this.s3Client = new S3Client(s3Config);
			this.logger.log(`✅ S3 storage enabled. Bucket: ${this.bucket}, Region: ${s3Config.region}`);
		} else {
			this.logger.warn('⚠️ S3 storage disabled. Using local storage fallback.');
		}
	}

	async uploadBuffer(
		buffer: Buffer,
		filePath: string,
		mimeType: string = 'image/jpeg',
	): Promise<{ url: string; path: string }> {
		if (!this.enabled || !this.s3Client) {
			throw new Error('S3 service not enabled');
		}

		try {
			// Ensure path doesn't start with /
			const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

			const upload = new Upload({
				client: this.s3Client,
				params: {
					Bucket: this.bucket,
					Key: cleanPath,
					Body: buffer,
					ContentType: mimeType,
					ACL: 'public-read', // Make files publicly accessible
				},
			});

			await upload.done();

			// Generate public URL
			let url: string;
			if (this.baseUrl) {
				url = `${this.baseUrl.replace(/\/$/, '')}/${cleanPath}`;
			} else {
				// Check for custom endpoint (R2, MinIO, etc.)
				const endpointConfig = this.s3Client.config.endpoint;
				if (endpointConfig && typeof endpointConfig === 'object' && endpointConfig !== null && 'url' in endpointConfig) {
					const endpoint = (endpointConfig as any).url as string;
					url = `${endpoint.replace(/\/$/, '')}/${this.bucket}/${cleanPath}`;
				} else {
					// Standard AWS S3 URL
					const region = this.s3Client.config.region || 'us-east-1';
					url = `https://${this.bucket}.s3.${region}.amazonaws.com/${cleanPath}`;
				}
			}

			this.logger.log(`✅ Uploaded to S3: ${cleanPath} (${buffer.length} bytes)`);

			return { url, path: cleanPath };
		} catch (error: any) {
			this.logger.error(`❌ S3 upload failed: ${error.message}`, error.stack);
			throw error;
		}
	}

	async delete(filePath: string): Promise<void> {
		if (!this.enabled || !this.s3Client) {
			throw new Error('S3 service not enabled');
		}

		try {
			const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

			await this.s3Client.send(
				new DeleteObjectCommand({
					Bucket: this.bucket,
					Key: cleanPath,
				}),
			);

			this.logger.log(`✅ Deleted from S3: ${cleanPath}`);
		} catch (error: any) {
			this.logger.error(`❌ S3 delete failed: ${error.message}`, error.stack);
			throw error;
		}
	}

	getPublicUrl(filePath: string): string {
		if (!this.enabled) {
			throw new Error('S3 service not enabled');
		}

		const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

		if (this.baseUrl) {
			return `${this.baseUrl.replace(/\/$/, '')}/${cleanPath}`;
		} else if (this.s3Client?.config.endpoint) {
			const endpointConfig = this.s3Client.config.endpoint;
			if (endpointConfig && typeof endpointConfig === 'object' && endpointConfig !== null && 'url' in endpointConfig) {
				const endpoint = (endpointConfig as any).url as string;
				return `${endpoint.replace(/\/$/, '')}/${this.bucket}/${cleanPath}`;
			}
		}
		
		// Standard AWS S3 URL
		const region = this.s3Client?.config.region || 'us-east-1';
		return `https://${this.bucket}.s3.${region}.amazonaws.com/${cleanPath}`;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	generatePath(prefix: string = 'generations', extension: string = 'jpg'): string {
		const uuid = randomUUID();
		const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
		return `${prefix}/${timestamp}/${uuid}.${extension}`;
	}
}
