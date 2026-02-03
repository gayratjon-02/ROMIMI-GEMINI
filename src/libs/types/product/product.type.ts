// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE INTERFACES - Consistent API Response Format
// ═══════════════════════════════════════════════════════════════════════════

import { AnalyzedProductJSON } from "src/common/interfaces/product-json.interface";
import { Product } from "src/database/entities/product.entity";
import { AnalyzeProductDirectResponse } from "src/libs/dto/analyze/analyze-product-direct.dto";

export interface ProductResponse {
	success: boolean;
	product: Product;
	message?: string;
}

export interface ProductListResponse {
	success: boolean;
	items: Product[];
	total: number;
	page: number;
	limit: number;
}

export interface ProductAnalysisResponse {
	success: boolean;
	product_id: string;
	name: string;
	category: string;
	analysis: AnalyzeProductDirectResponse;
	imageUrl: string;
	front_image_url?: string;
	back_image_url?: string;
	reference_images?: string[];
	message: string;
	next_step: string;
}

export interface ProductJsonResponse {
	success: boolean;
	product_id: string;
	analyzed_product_json: AnalyzedProductJSON | null;
	final_product_json: AnalyzedProductJSON | null;
	has_manual_overrides: boolean;
	message?: string;
}