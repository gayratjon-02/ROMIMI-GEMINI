import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaudeService } from '../ai/claude.service';
import { FilesService } from '../files/files.service';
import { DAPreset, DAPresetConfig } from '../database/entities/da-preset.entity';
import { AnalyzeDAPresetResponse } from '../libs/dto/analyze/analyze-da-preset.dto';

@Injectable()
export class DAService {
	private readonly logger = new Logger(DAService.name);

	constructor(
		@InjectRepository(DAPreset)
		private daPresetRepository: Repository<DAPreset>,
		private readonly claudeService: ClaudeService,
		private readonly filesService: FilesService,
	) { }

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
	): Promise<DAPreset> {
		if (!imageUrl) {
			throw new BadRequestException('Reference image is required');
		}

		this.logger.log('🎨 Starting DA reference analysis...');
		this.logger.log(`   Image URL: ${imageUrl}`);

		// 1. Call Claude AI to analyze
		let result = await this.claudeService.analyzeDAForPreset(imageUrl, presetName);

		// 2. Apply brand rules (post-processing safety net)
		result = this.applyBrandRules(result);

		this.logger.log('✅ DA Reference Analysis Result - Saving to DB...');

		// 3. Save directly to Database
		const code = `custom_${Date.now()}`; // Generate unique code

		const preset = this.daPresetRepository.create({
			name: result.da_name || presetName || 'Custom Analysis',
			code: code,
			description: 'Automatically analyzed from reference image',
			is_default: false,
			image_url: imageUrl,
			analyzed_da_json: result as unknown as Record<string, any>, // Save strictly

			// Map strict fields
			background_type: result.background.type,
			background_hex: result.background.hex,
			floor_type: result.floor.type,
			floor_hex: result.floor.hex,
			// V2: ground items (extract names for legacy DB fields)
			props_left: result.ground.left_items.map((item: any) => typeof item === 'string' ? item : item.name),
			props_right: result.ground.right_items.map((item: any) => typeof item === 'string' ? item : item.name),
			// V2: adult styling
			styling_pants: result.styling.adult_bottom || result.styling.pants,
			styling_footwear: result.styling.adult_feet || result.styling.footwear,
			lighting_type: result.lighting.type,
			lighting_temperature: result.lighting.temperature,
			mood: result.mood,
			quality: result.quality
		});

		const savedPreset = await this.daPresetRepository.save(preset);
		this.logger.log(`💾 DA Preset saved: ${savedPreset.id} (${savedPreset.name})`);

		return savedPreset;
	}

	/**
	 * 🛡️ V2: DATA NORMALIZATION (ground structure)
	 * 
	 * RULES:
	 * 1. Ground MUST have left_items/right_items arrays
	 * 2. Styling uses adult_bottom/adult_feet as primary
	 */
	private applyBrandRules(daJson: AnalyzeDAPresetResponse): AnalyzeDAPresetResponse {
		this.logger.log('🛡️ Running V2 Data Normalization...');

		// ═══════════════════════════════════════════════════════════
		// RULE 1: FORCE GROUND STRUCTURE (left_items / right_items)
		// ═══════════════════════════════════════════════════════════
		if (!daJson.ground) {
			daJson.ground = { left_items: [], right_items: [] };
		}

		if (!Array.isArray(daJson.ground.left_items)) {
			daJson.ground.left_items = [];
		}
		if (!Array.isArray(daJson.ground.right_items)) {
			daJson.ground.right_items = [];
		}

		// ═══════════════════════════════════════════════════════════
		// RULE 2: STYLING — V2 adult/kid structure
		// ═══════════════════════════════════════════════════════════
		if (!daJson.styling) {
			daJson.styling = {};
		}

		// Ensure adult styling has defaults
		if (!daJson.styling.adult_bottom) {
			daJson.styling.adult_bottom = daJson.styling.pants || 'Black chino pants (#1A1A1A)';
		}
		if (!daJson.styling.adult_feet) {
			daJson.styling.adult_feet = daJson.styling.footwear || 'Black dress shoes';
		}

		this.logger.log('✅ V2 normalization complete');
		this.logger.log(`   Ground: left=${daJson.ground.left_items.length}, right=${daJson.ground.right_items.length}`);
		this.logger.log(`   Adult styling: ${daJson.styling.adult_bottom} / ${daJson.styling.adult_feet}`);

		return daJson;
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

			// V2: Ground items
			props_left: analysisResult.ground.left_items.map((item: any) => typeof item === 'string' ? item : item.name),
			props_right: analysisResult.ground.right_items.map((item: any) => typeof item === 'string' ? item : item.name),

			// V2: Styling
			styling_pants: analysisResult.styling.adult_bottom || analysisResult.styling.pants,
			styling_footwear: analysisResult.styling.adult_feet || analysisResult.styling.footwear,

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
	 * Update DA preset analysis data
	 * PUT /api/da/presets/:id/analysis
	 *
	 * Allows editing the analyzed_da_json and updates all related fields
	 * System presets (is_default=true) cannot be modified
	 *
	 * @param id - Preset ID
	 * @param analysisData - Updated AnalyzeDAPresetResponse data
	 * @returns Updated DAPreset entity
	 */
	async updatePresetAnalysis(
		id: string,
		analysisData: AnalyzeDAPresetResponse,
	): Promise<DAPreset> {
		const preset = await this.findOne(id);

		if (preset.is_default) {
			throw new BadRequestException('System presets cannot be modified');
		}

		this.logger.log(`📝 Updating DA Preset analysis: ${preset.name} (${id})`);

		// Update the analyzed_da_json
		preset.analyzed_da_json = analysisData as unknown as Record<string, any>;

		// Update all individual fields to stay in sync
		preset.name = analysisData.da_name || preset.name;
		preset.background_type = analysisData.background.type;
		preset.background_hex = analysisData.background.hex;
		preset.floor_type = analysisData.floor.type;
		preset.floor_hex = analysisData.floor.hex;
		// V2: Ground items
		preset.props_left = analysisData.ground.left_items.map((item: any) => typeof item === 'string' ? item : item.name);
		preset.props_right = analysisData.ground.right_items.map((item: any) => typeof item === 'string' ? item : item.name);
		// V2: Styling
		preset.styling_pants = analysisData.styling.adult_bottom || analysisData.styling.pants;
		preset.styling_footwear = analysisData.styling.adult_feet || analysisData.styling.footwear;
		preset.lighting_type = analysisData.lighting.type;
		preset.lighting_temperature = analysisData.lighting.temperature;
		preset.mood = analysisData.mood;
		preset.quality = analysisData.quality;

		const savedPreset = await this.daPresetRepository.save(preset);
		this.logger.log(`✅ DA Preset analysis updated: ${savedPreset.name}`);

		return savedPreset;
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
