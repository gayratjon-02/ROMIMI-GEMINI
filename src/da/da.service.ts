import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaudeService } from '../ai/claude.service';
import { FilesService } from '../files/files.service';
import { DAPreset, DAPresetConfig } from '../database/entities/da-preset.entity';
import { AnalyzeDAPresetResponse } from '../libs/dto/analyze-da-preset.dto';

@Injectable()
export class DAService {
	private readonly logger = new Logger(DAService.name);

	constructor(
		@InjectRepository(DAPreset)
		private daPresetRepository: Repository<DAPreset>,
		private readonly claudeService: ClaudeService,
		private readonly filesService: FilesService,
	) {}

	/**
	 * Analyze a DA reference image and return structured preset data
	 * POST /api/da/analyze
	 *
	 * @param imageUrl - URL to the uploaded reference image
	 * @param presetName - Optional custom name for the analyzed preset
	 * @returns AnalyzeDAPresetResponse - Structured DA preset data (not saved to DB)
	 */
	async analyzeReference(
		imageUrl: string,
		presetName?: string,
	): Promise<AnalyzeDAPresetResponse> {
		if (!imageUrl) {
			throw new BadRequestException('Reference image is required');
		}

		this.logger.log('🎨 Starting DA reference analysis...');
		this.logger.log(`   Image URL: ${imageUrl}`);

		// Call Claude AI to analyze the reference image
		const result = await this.claudeService.analyzeDAForPreset(imageUrl, presetName);

		this.logger.log('✅ DA Reference Analysis Result:');
		this.logger.log(JSON.stringify(result, null, 2));

		return result;
	}

	/**
	 * Get all DA presets (default system presets + user-created)
	 */
	async findAll(): Promise<DAPreset[]> {
		return this.daPresetRepository.find({
			order: { is_default: 'DESC', created_at: 'DESC' },
		});
	}

	/**
	 * Get all default (system) presets only
	 */
	async findDefaults(): Promise<DAPreset[]> {
		return this.daPresetRepository.find({
			where: { is_default: true },
			order: { name: 'ASC' },
		});
	}

	/**
	 * Get a specific preset by ID
	 */
	async findOne(id: string): Promise<DAPreset> {
		const preset = await this.daPresetRepository.findOne({ where: { id } });
		if (!preset) {
			throw new BadRequestException('DA Preset not found');
		}
		return preset;
	}

	/**
	 * Get a specific preset by code
	 */
	async findByCode(code: string): Promise<DAPreset> {
		const preset = await this.daPresetRepository.findOne({ where: { code } });
		if (!preset) {
			throw new BadRequestException(`DA Preset with code "${code}" not found`);
		}
		return preset;
	}

	/**
	 * Save analyzed DA reference as a new preset
	 *
	 * @param analysisResult - Result from analyzeReference()
	 * @param code - Unique code for the preset (e.g., "my_custom_preset")
	 * @param description - Optional description
	 * @returns Saved DAPreset entity
	 */
	async saveAsPreset(
		analysisResult: AnalyzeDAPresetResponse,
		code: string,
		description?: string,
	): Promise<DAPreset> {
		// Check if code already exists
		const existing = await this.daPresetRepository.findOne({ where: { code } });
		if (existing) {
			throw new BadRequestException(`Preset with code "${code}" already exists`);
		}

		// Create new preset from analysis result
		const preset = this.daPresetRepository.create({
			name: analysisResult.da_name,
			code,
			description: description || `Analyzed from reference image`,
			is_default: false, // User-created presets are not default

			// Background
			background_type: analysisResult.background.type,
			background_hex: analysisResult.background.hex,

			// Floor
			floor_type: analysisResult.floor.type,
			floor_hex: analysisResult.floor.hex,

			// Props
			props_left: analysisResult.props.left_side,
			props_right: analysisResult.props.right_side,

			// Styling
			styling_pants: analysisResult.styling.pants,
			styling_footwear: analysisResult.styling.footwear,

			// Lighting
			lighting_type: analysisResult.lighting.type,
			lighting_temperature: analysisResult.lighting.temperature,

			// Mood & Quality
			mood: analysisResult.mood,
			quality: analysisResult.quality,
		});

		const saved = await this.daPresetRepository.save(preset);
		this.logger.log(`✅ Saved new DA Preset: ${saved.name} (${saved.code})`);

		return saved;
	}

	/**
	 * Delete a user-created preset
	 * System presets (is_default=true) cannot be deleted
	 */
	async remove(id: string): Promise<{ message: string }> {
		const preset = await this.findOne(id);

		if (preset.is_default) {
			throw new BadRequestException('System presets cannot be deleted');
		}

		await this.daPresetRepository.remove(preset);
		return { message: `DA Preset "${preset.name}" deleted successfully` };
	}

	/**
	 * Convert DAPreset entity to the "Gold Standard" JSON format
	 * Used for API responses and prompt generation
	 */
	toPresetConfig(preset: DAPreset): DAPresetConfig {
		return preset.toPresetConfig();
	}
}
