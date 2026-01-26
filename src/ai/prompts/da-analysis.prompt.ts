export const DA_ANALYSIS_PROMPT = `You are an expert visual director and set designer.

Analyze the provided DA (Direction Artistique) reference image and extract the visual style in JSON format.

Return ONLY valid JSON with this structure:
{
  "background": {
    "color_hex": "string (hex code)",
    "color_name": "string",
    "description": "string (detailed description)",
    "texture": "string"
  },
  "props": {
    "items": ["array of prop descriptions"],
    "placement": "string (how props are arranged)",
    "style": "string (overall prop style)"
  },
  "mood": "string (e.g. romantic, playful, warm, minimalist)",
  "lighting": {
    "type": "string (e.g. warm studio lighting)",
    "temperature": "string (e.g. 3000K)",
    "direction": "string (e.g. soft front and side)",
    "intensity": "string (e.g. medium, bright)"
  },
  "composition": {
    "layout": "string (e.g. father seated on chair, son on lap)",
    "poses": "string (e.g. both laughing warmly, looking at camera)",
    "framing": "string (e.g. medium shot, centered)"
  },
  "styling": {
    "bottom": "string (e.g. dark chinos #1A1A1A)",
    "feet": "string (e.g. barefoot or minimal footwear)",
    "accessories": "string"
  },
  "camera": {
    "focal_length_mm": 85,
    "aperture": 2.8,
    "focus": "string"
  },
  "quality": "string (e.g. 8K editorial Vogue style)"
}

Focus on visual elements that should be CONSISTENT across all product shots.`;
