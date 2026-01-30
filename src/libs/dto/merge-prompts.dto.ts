import { IsUUID, IsOptional, IsString, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ShotOptions } from '../../common/interfaces/shot-options.interface';

export class MergePromptsDto {
	@IsUUID()
	@IsOptional()
	product_id?: string;

	@IsUUID()
	@IsOptional()
	collection_id?: string;

	/**
	 * @deprecated Use shot_options instead for granular control
	 * Kept for backward compatibility - applies to ALL shots if shot_options not provided
	 */
	@IsOptional()
	@IsString()
	model_type?: 'adult' | 'kid';

	/**
	 * NEW: Per-shot control options
	 * Allows different settings for SOLO (adult/kid) and FLAT LAY (adult/kid size)
	 * 
	 * @example
	 * {
	 *   duo: { enabled: true },
	 *   solo: { enabled: true, subject: 'kid' },
	 *   flatlay_front: { enabled: true, size: 'adult' },
	 *   flatlay_back: { enabled: true, size: 'kid' },
	 *   closeup_front: { enabled: true },
	 *   closeup_back: { enabled: false }
	 * }
	 */
	@IsOptional()
	@IsObject()
	shot_options?: ShotOptions;
}
