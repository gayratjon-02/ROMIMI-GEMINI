export interface ProductDetails {
  piping?: string;
  zip?: string;
  collar?: string;
  closure?: string;
  pockets?: string;
  fit?: string;
  sleeves?: string;
  accents?: string;
  seams_and_corners?: string;
}

export interface LogoInfo {
  type: string;
  color: string;
  position: string;
  size?: string;
}

export interface AnalyzedProductJSON {
  product_type: string;
  product_name: string;
  color_name: string;
  color_hex: string;
  material: string;
  details: ProductDetails;
  logo_front: LogoInfo;
  logo_back: LogoInfo;
  texture_description: string;
  additional_details: string[];
  confidence_score: number;
  analyzed_at?: string;
}
