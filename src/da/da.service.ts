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
			props_left: result.props.left_side,
			props_right: result.props.right_side,
			styling_pants: result.styling.pants,
			styling_footwear: result.styling.footwear,
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
	 * 🛡️ AGGRESSIVE DATA NORMALIZATION
	 * 
	 * This is a forceful safety net that runs AFTER Claude returns JSON.
	 * DO NOT rely on AI to get the schema right. This function FIXES the data.
	 * 
	 * RULES:
	 * 1. Props MUST have left_side/right_side arrays (delete items/placement/style)
	 * 2. 🆕 Smart Footwear: Preserve DA footwear or apply stylish default (no more forced barefoot)
	 * 3. Default pants to brand standard if missing
	 */
	private applyBrandRules(daJson: AnalyzeDAPresetResponse): AnalyzeDAPresetResponse {
		this.logger.log('🛡️ Running AGGRESSIVE Data Normalization...');

		// ═══════════════════════════════════════════════════════════
		// RULE 1: FORCE PROPS STRUCTURE (left_side / right_side)
		// ═══════════════════════════════════════════════════════════
		const rawProps = daJson.props as any;

		// Check if correct structure is missing
		const hasLeftSide = Array.isArray(rawProps?.left_side);
		const hasRightSide = Array.isArray(rawProps?.right_side);

		if (!hasLeftSide || !hasRightSide) {
			this.logger.warn('⚠️ AI returned incorrect props structure - FORCING normalization');

			// Try to salvage from 'items' array
			const items = rawProps?.items || [];
			const midpoint = Math.ceil(items.length / 2);

			daJson.props = {
				left_side: hasLeftSide ? rawProps.left_side : items.slice(0, midpoint),
				right_side: hasRightSide ? rawProps.right_side : items.slice(midpoint),
			};
		}

		// CLEANUP: Remove any invalid keys that AI might have added
		const cleanProps = daJson.props as any;
		delete cleanProps.items;
		delete cleanProps.placement;
		delete cleanProps.style;

		// ═══════════════════════════════════════════════════════════
		// RULE 2: STYLING — MIRROR RULE (No Override)
		// ═══════════════════════════════════════════════════════════
		// Preserve EXACTLY what the AI reported from the reference image.
		// Do NOT replace BAREFOOT with "stylish" shoes. Do NOT guess or "improve" footwear.

		if (!daJson.styling) {
			daJson.styling = { pants: '', footwear: '' };
		}

		// Map feet -> footwear if prompt returned "feet"
		if ((daJson.styling as any).feet != null && daJson.styling.footwear === '') {
			daJson.styling.footwear = (daJson.styling as any).feet;
		}
		// Only default footwear if completely missing (empty string)
		if (!daJson.styling.footwear || daJson.styling.footwear.trim() === '') {
			daJson.styling.footwear = 'BAREFOOT';
		}

		// ═══════════════════════════════════════════════════════════
		// RULE 3: Default Pants only if missing
		// ═══════════════════════════════════════════════════════════
		if (!daJson.styling?.pants || daJson.styling.pants.trim() === '') {
			daJson.styling.pants = 'Black chino pants (#1A1A1A)';
		}

		this.logger.log('✅ Aggressive normalization complete');
		this.logger.log(`   Props: left_side=${daJson.props.left_side.length}, right_side=${daJson.props.right_side.length}`);
		this.logger.log(`   Footwear: ${daJson.styling.footwear}`);

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
		preset.props_left = analysisData.props.left_side;
		preset.props_right = analysisData.props.right_side;
		preset.styling_pants = analysisData.styling.pants;
		preset.styling_footwear = analysisData.styling.footwear;
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
