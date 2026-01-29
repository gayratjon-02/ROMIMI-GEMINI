import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import 'multer';
import { DAService } from './da.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../database/entities/user.entity';
import { DAPreset, DAPresetConfig } from '../database/entities/da-preset.entity';
import { FilesService } from '../files/files.service';
import { AnalyzeDAPresetDto, AnalyzeDAPresetResponse } from '../libs/dto/analyze-da-preset.dto';

/**
 * Save Preset DTO
 */
interface SavePresetDto {
	analysis: AnalyzeDAPresetResponse;
	code: string;
	description?: string;
}

@Controller('da')
@UseGuards(JwtAuthGuard)
export class DAController {
	constructor(
		private readonly daService: DAService,
		private readonly filesService: FilesService,
	) {}

	// ═══════════════════════════════════════════════════════════
	// 🎨 DA REFERENCE ANALYSIS
	// ═══════════════════════════════════════════════════════════

	/**
	 * Analyze DA Reference Image
	 * POST /api/da/analyze
	 *
	 * Accepts an image and returns a structured DAPreset JSON.
	 * Does NOT save to database - just returns the analysis.
	 *
	 * FormData:
	 * - image (required): Reference photo of the room/scene
	 * - preset_name (optional): Custom name for the analyzed preset
	 */
	@Post('analyze')
	@UseInterceptors(
		FileInterceptor('image', {
			limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
		}),
	)
	async analyzeReference(
		@CurrentUser() user: User,
		@Body() analyzeDto: AnalyzeDAPresetDto,
		@UploadedFile() imageFile: Express.Multer.File,
	): Promise<{
		success: boolean;
		data: AnalyzeDAPresetResponse;
		message: string;
	}> {
		if (!imageFile) {
			throw new BadRequestException('Reference image is required. Upload a photo of the room/scene.');
		}

		// Store the uploaded file and get URL
		const storedImage = await this.filesService.storeImage(imageFile);

		// Analyze with Claude AI
		const analysis = await this.daService.analyzeReference(
			storedImage.url,
			analyzeDto.preset_name,
		);

		return {
			success: true,
			data: analysis,
			message: 'DA reference analyzed successfully. Use POST /api/da/presets to save as a preset.',
		};
	}

	// ═══════════════════════════════════════════════════════════
	// 📚 DA PRESETS CRUD
	// ═══════════════════════════════════════════════════════════

	/**
	 * Get all DA Presets
	 * GET /api/da/presets
	 *
	 * Returns all presets (system defaults + user-created)
	 */
	@Get('presets')
	async getAllPresets(): Promise<{
		total: number;
		system_presets: number;
		user_presets: number;
		presets: DAPreset[];
	}> {
		const presets = await this.daService.findAll();
		const systemPresets = presets.filter(p => p.is_default);
		const userPresets = presets.filter(p => !p.is_default);

		return {
			total: presets.length,
			system_presets: systemPresets.length,
			user_presets: userPresets.length,
			presets,
		};
	}

	/**
	 * Get system default presets only
	 * GET /api/da/presets/defaults
	 */
	@Public()
	@Get('presets/defaults')
	async getDefaultPresets(): Promise<DAPreset[]> {
		return this.daService.findDefaults();
	}

	/**
	 * Get a preset by ID
	 * GET /api/da/presets/:id
	 */
	@Get('presets/:id')
	async getPresetById(@Param('id') id: string): Promise<{
		preset: DAPreset;
		config: DAPresetConfig;
	}> {
		const preset = await this.daService.findOne(id);
		return {
			preset,
			config: this.daService.toPresetConfig(preset),
		};
	}

	/**
	 * Get a preset by code
	 * GET /api/da/presets/code/:code
	 */
	@Public()
	@Get('presets/code/:code')
	async getPresetByCode(@Param('code') code: string): Promise<{
		preset: DAPreset;
		config: DAPresetConfig;
	}> {
		const preset = await this.daService.findByCode(code);
		return {
			preset,
			config: this.daService.toPresetConfig(preset),
		};
	}

	/**
	 * Save analyzed DA reference as a new preset
	 * POST /api/da/presets
	 *
	 * Body:
	 * - analysis: The AnalyzeDAPresetResponse from /api/da/analyze
	 * - code: Unique code for the preset (e.g., "my_custom_preset")
	 * - description: Optional description
	 */
	@Post('presets')
	async saveAsPreset(
		@CurrentUser() user: User,
		@Body() body: SavePresetDto,
	): Promise<{
		success: boolean;
		preset: DAPreset;
		message: string;
	}> {
		if (!body.analysis || !body.code) {
			throw new BadRequestException('analysis and code are required');
		}

		const preset = await this.daService.saveAsPreset(
			body.analysis,
			body.code,
			body.description,
		);

		return {
			success: true,
			preset,
			message: `DA Preset "${preset.name}" saved successfully`,
		};
	}

	/**
	 * Delete a user-created preset
	 * DELETE /api/da/presets/:id
	 *
	 * Note: System presets (is_default=true) cannot be deleted
	 */
	@Post('presets/delete/:id')
	async deletePreset(
		@CurrentUser() user: User,
		@Param('id') id: string,
	): Promise<{ message: string }> {
		return this.daService.remove(id);
	}
}
