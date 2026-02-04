/**
 * ═══════════════════════════════════════════════════════════
 * 🛡️ BACKEND DATA SANITIZATION LAYER
 * ═══════════════════════════════════════════════════════════
 *
 * Purpose: Prevent [object Object] errors and "Unknown" spam
 * Author: Backend Team
 * Last Updated: 2026-01-28
 */

import {
	AnalyzedProductJSON,
	LogoInfo,
	ProductDetails,
} from '../../common/interfaces/product-json.interface';

interface LogoField {
	type?: string;
	color?: string;
	position?: string;
	size?: string;
	description?: string;
	text?: string;
}

export interface ValidationFlags {
	color_validated: boolean;
	material_validated: boolean;
	logo_front_validated: boolean;
	logo_back_validated: boolean;
	overall_confidence: number;
}

/**
 * ═══════════════════════════════════════════════════════════
 * 📌 CORE FUNCTION: Normalize AI Response
 * ═══════════════════════════════════════════════════════════
 */
export function normalizeProductData(
	rawAIResponse: any,
): AnalyzedProductJSON & { validation_flags?: ValidationFlags } {
	// Safety check
	if (!rawAIResponse || typeof rawAIResponse !== 'object') {
		throw new Error('Invalid AI response format');
	}

	// ═══════════════════════════════════════════════════════════
	// 🔧 NORMALIZE CORE FIELDS
	// ═══════════════════════════════════════════════════════════

	const product_type = sanitizeString(
		rawAIResponse.product_type || rawAIResponse.productType,
		'Fashion Item',
	);

	const color_name = sanitizeString(
		rawAIResponse.color_name || rawAIResponse.colorName || rawAIResponse.color,
		'Multi-color',
	);

	const material = sanitizeString(rawAIResponse.material, 'Synthetic Blend');

	// ═══════════════════════════════════════════════════════════
	// 🔧 NORMALIZE LOGO OBJECTS (Keep as LogoInfo structure)
	// ═══════════════════════════════════════════════════════════

	const logo_front = normalizeLogo(rawAIResponse.logo_front);
	const logo_back = normalizeLogo(rawAIResponse.logo_back);

	// ═══════════════════════════════════════════════════════════
	// 🔧 NORMALIZE DETAILS OBJECT
	// ═══════════════════════════════════════════════════════════

	const details = normalizeDetails(rawAIResponse.details);

	// ═══════════════════════════════════════════════════════════
	// 🔍 VALIDATION FLAGS (for Frontend Red/Green Indicators)
	// ═══════════════════════════════════════════════════════════

	const validation_flags: ValidationFlags = {
		color_validated: !isPlaceholder(color_name),
		material_validated: !isPlaceholder(material),
		logo_front_validated: logo_front.type.toLowerCase() !== 'none',
		logo_back_validated: logo_back.type.toLowerCase() !== 'none',
		overall_confidence: rawAIResponse.confidence_score || 0.85,
	};

	// ═══════════════════════════════════════════════════════════
	// 🔧 NORMALIZE VISUAL_SPECS (required by AnalyzedProductJSON)
	// ═══════════════════════════════════════════════════════════

	const color_hex = rawAIResponse.color_hex || '#808080';
	const texture_description = rawAIResponse.texture_description || '';

	const visual_specs = rawAIResponse.visual_specs && typeof rawAIResponse.visual_specs === 'object'
		? {
			color_name: sanitizeString(rawAIResponse.visual_specs.color_name, color_name),
			hex_code: rawAIResponse.visual_specs.hex_code || color_hex,
			fabric_texture: sanitizeString(rawAIResponse.visual_specs.fabric_texture, texture_description || material),
		}
		: {
			color_name,
			hex_code: color_hex,
			fabric_texture: texture_description || material,
		};

	// ═══════════════════════════════════════════════════════════
	// 📦 RETURN CLEAN DATA
	// ═══════════════════════════════════════════════════════════

	return {
		visual_specs,
		product_type,
		product_name: rawAIResponse.product_name || product_type,
		color_name,
		color_hex,
		material,
		details,
		logo_front,
		logo_back,
		texture_description,
		additional_details: Array.isArray(rawAIResponse.additional_details)
			? rawAIResponse.additional_details
			: [],
		confidence_score: rawAIResponse.confidence_score || 0.85,
		analyzed_at: new Date().toISOString(),
		validation_flags,
	};
}

/**
 * ═══════════════════════════════════════════════════════════
 * 🔧 HELPER: Sanitize String (Remove "Unknown")
 * ═══════════════════════════════════════════════════════════
 */
function sanitizeString(value: any, fallback: string): string {
	if (!value || typeof value !== 'string') return fallback;

	const cleaned = value.trim();

	// Kill "Unknown" spam
	const forbiddenPhrases = [
		'unknown',
		'not visible',
		'cannot determine',
		'unsure',
		'n/a',
		'tbd',
	];

	const lowerCleaned = cleaned.toLowerCase();
	const isInvalid = forbiddenPhrases.some((phrase) =>
		lowerCleaned.includes(phrase),
	);

	return isInvalid ? fallback : cleaned;
}

/**
 * ═══════════════════════════════════════════════════════════
 * 🔧 HELPER: Check if value is placeholder
 * ═══════════════════════════════════════════════════════════
 */
function isPlaceholder(value: string): boolean {
	const placeholders = [
		'multi-color',
		'synthetic blend',
		'none',
		'minimal branding',
		'not detected',
		'fashion item',
	];

	return placeholders.some((p) => value.toLowerCase().includes(p));
}

/**
 * ═══════════════════════════════════════════════════════════
 * 🔧 HELPER: Normalize Logo Object → LogoInfo
 * ═══════════════════════════════════════════════════════════
 *
 * INPUT (from AI - could be string or object):
 * String: "Embroidered text logo"
 * OR Object:
 * {
 *   "type": "Embroidered text",
 *   "color": "White",
 *   "position": "Left chest",
 *   "size": "Small"
 * }
 *
 * OUTPUT (always LogoInfo object):
 * {
 *   type: "Embroidered text",
 *   color: "White",
 *   position: "Left chest",
 *   size: "Small"
 * }
 */
function normalizeLogo(
	logoField: string | LogoField | null | undefined,
): LogoInfo {
	// Default "None" logo
	const defaultLogo: LogoInfo = {
		type: 'None',
		color: '',
		position: '',
		size: '',
	};

	// Handle null/undefined
	if (!logoField) return defaultLogo;

	// Handle string input (AI returned simplified string)
	if (typeof logoField === 'string') {
		const cleaned = sanitizeString(logoField, 'None');
		if (
			cleaned.toLowerCase() === 'none' ||
			cleaned.toLowerCase() === 'minimal branding'
		) {
			return defaultLogo;
		}
		// Parse string into LogoInfo
		return {
			type: cleaned,
			color: '',
			position: '',
			size: '',
		};
	}

	// Handle object
	if (typeof logoField === 'object') {
		return {
			type: sanitizeString(logoField.type, 'None'),
			color: sanitizeString(logoField.color, ''),
			position: sanitizeString(logoField.position, ''),
			size: logoField.size || '',
		};
	}

	return defaultLogo;
}

/**
 * ═══════════════════════════════════════════════════════════
 * 🔧 HELPER: Normalize Details Object → ProductDetails
 * ═══════════════════════════════════════════════════════════
 */
function normalizeDetails(detailsObj: any): ProductDetails {
	if (!detailsObj || typeof detailsObj !== 'object') {
		return {};
	}

	const cleaned: ProductDetails = {};

	Object.keys(detailsObj).forEach((key) => {
		const value = detailsObj[key];
		if (value && typeof value === 'string') {
			// Remove "Unknown" values from details
			const sanitized = sanitizeString(value, '');
			if (sanitized) {
				(cleaned as any)[key] = sanitized;
			}
		}
	});

	return cleaned;
}
