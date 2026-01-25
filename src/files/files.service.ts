import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';
import 'multer';
import { FileMessage } from '../libs/enums';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class FilesService {
	constructor(private configService: ConfigService) {}

	async storeImage(file: Express.Multer.File) {
		if (!file) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const uploadConfig = this.configService.get<any>('upload');
		if (uploadConfig.provider !== 'local') {
			throw new BadRequestException(FileMessage.FILE_UPLOAD_FAILED);
		}

		const baseUrl = uploadConfig.baseUrl as string;
		const localPath = uploadConfig.localPath as string;
		const url = baseUrl
			? `${baseUrl.replace(/\/$/, '')}/${localPath}/${file.filename}`
			: `/${localPath}/${file.filename}`;

		return {
			filename: file.filename,
			mimetype: file.mimetype,
			size: file.size,
			path: file.path,
			url,
		};
	}

	async storeBase64Image(base64Data: string, mimeType: string = 'image/jpeg'): Promise<{ url: string; filename: string; path: string }> {
		if (!base64Data) {
			throw new BadRequestException(FileMessage.FILE_NOT_FOUND);
		}

		const uploadConfig = this.configService.get<any>('upload');
		if (uploadConfig.provider !== 'local') {
			throw new BadRequestException(FileMessage.FILE_UPLOAD_FAILED);
		}

		// Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
		const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
		
		// Convert base64 to buffer
		const buffer = Buffer.from(base64String, 'base64');
		
		// Determine file extension from mime type
		const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
		const filename = `${randomUUID()}${ext}`;
		
		// Get upload directory
		const localPath = uploadConfig.localPath as string;
		const absolutePath = path.join(process.cwd(), localPath);
		
		// Ensure directory exists
		fs.mkdirSync(absolutePath, { recursive: true });
		
		// Save file
		const filePath = path.join(absolutePath, filename);
		fs.writeFileSync(filePath, buffer);
		
		// Generate URL
		const baseUrl = uploadConfig.baseUrl as string;
		const url = baseUrl
			? `${baseUrl.replace(/\/$/, '')}/${localPath}/${filename}`
			: `/${localPath}/${filename}`;

		return {
			filename,
			path: filePath,
			url,
		};
	}
}
