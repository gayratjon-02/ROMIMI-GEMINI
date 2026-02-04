/**
 * FAYL JOYLASHUVI: src/ai/prompts/product-analysis-v3.prompt.ts
 * 
 * VERSION 5.0 - PRECISION GARMENT ANALYSIS
 * Fixes:
 * - Collar branding = neck tape + hanger loop (NOT collar wings)
 * - Neckline = describe collar material separately from leather elements
 * - Pockets = individual array with position, material, color
 * - Button count = COUNT EVERY BUTTON CAREFULLY
 * - Patch stitch = look for visible stitching
 */

export const PRODUCT_ANALYSIS_V3_PROMPT = `You are an expert Fashion Product Analyst. Create an EXHAUSTIVE technical specification from images.

══════════════════════════════════════════════════════════════════════════════
🏷️ BRAND NAME SPELLING - CRITICAL!
══════════════════════════════════════════════════════════════════════════════

⚠️ The brand is "Romimi" (with two "i"s) - NOT "Romini"!
- CORRECT: Romimi
- WRONG: Romini

ALWAYS double-check the interior label text character by character!

══════════════════════════════════════════════════════════════════════════════
🎨 COLOR HEX CODE - ULTRA PRECISE SAMPLING!
══════════════════════════════════════════════════════════════════════════════

⚠️ CRITICAL: Sample the hex code from the MAIN BODY fabric, NOT from:
- Leather overlays (different shade!)
- Shadows or highlights
- Buttons or hardware

HOW TO GET ACCURATE HEX:
1. Find a well-lit flat area of the MAIN WOOL/FABRIC body
2. Avoid leather panels, pockets, and decorated areas
3. Sample mid-tones, not highlights or deep shadows

| Color Name | Precise Hex Range |
|------------|------------------|
| Deep Burgundy (like wine) | #722F37 - #7A2E3F |
| Oxblood (darker wine) | #4A0000 - #5C1A1A |
| Cherry Burgundy | #8B1538 - #9C2040 |
| Navy Blue | #000080 - #1C2951 |
| Black | #000000 - #1A1A1A |

✅ OUTPUT: Pick the CLOSEST match, e.g., hex_code: "#722F37"

══════════════════════════════════════════════════════════════════════════════
👔 INTERIOR BRANDING - EXACT POSITIONS & SIZES! (V5.2)
══════════════════════════════════════════════════════════════════════════════

⚠️ CRITICAL: Describe EXACT location, position, and size of interior elements!

**EMBROIDERY (on neck tape):**
| What to note | Example |
|--------------|---------|
| Position | "Neck tape (horizontal band inside collar back)" |
| Layout | "Romimi...Romimi (text on both sides of hanger loop)" |
| Color | "Gray/silver thread" |
| Text style | "Clean serif font, approx. 1.5cm height" |

**MAIN LABEL (sewn at center back):**
| What to note | Example |
|--------------|---------|
| Material | "Woven cream/beige fabric label" |
| Size | "approx. 4×6cm" |
| Content | Brand name, tagline, size code |
| Position | "Sewn at center back neck, below neck tape" |

❌ WRONG: "Embroidered on collar wings" (collar wings are the pointed tips!)
✅ CORRECT: "Embroidered on neck tape (inner collar band)"

OUTPUT in design_front.interior_branding:
{
  "embroidery_location": "Neck tape (horizontal band inside collar back), both sides of hanger loop",
  "embroidery_text": "Romimi",
  "embroidery_color": "Gray/silver thread, serif font, approx. 1.5cm height",
  "embroidery_visible_from_front": true,
  "main_label": {
    "brand_name": "Romimi",
    "tagline": "Born to lead",
    "size_shown": "4-5",
    "label_material": "Woven cream fabric",
    "label_size": "approx. 4×6cm",
    "visible_from_front": true
  }
}

══════════════════════════════════════════════════════════════════════════════
👕 NECKLINE/COLLAR - SEPARATE MATERIALS!
══════════════════════════════════════════════════════════════════════════════

⚠️ Describe collar and any leather elements SEPARATELY!

❌ WRONG: "Point collar with leather trim"
✅ CORRECT: "Point collar in burgundy wool (same as body). Leather yoke panel extends from shoulder, NOT on collar itself."

OUTPUT in garment_details.neckline:
- Describe the COLLAR material first
- Then note if leather is nearby (yoke/shoulder) but distinguish from collar

Example: "Point collar in burgundy wool. Matching leather shoulder overlay visible at collar-shoulder junction."

══════════════════════════════════════════════════════════════════════════════
👜 POCKETS - EXACT POSITIONS & ORIENTATION! (V5.3 CRITICAL)
══════════════════════════════════════════════════════════════════════════════

⚠️ List EACH pocket with EXACT POSITION for image generation!

**CRITICAL FOR IMAGE GENERATION:**
- Pockets must be described with PRECISE positioning
- Lower pockets are FRONT-FACING on the body (NOT side/slant pockets!)
- Include horizontal and vertical position from garment landmarks

**CHEST POCKET DETAILS:**
| Property | Example Value |
|----------|---------------|
| position | "Wearer's left chest" |
| horizontal_position | "5cm from center placket" |
| vertical_position | "15cm below shoulder seam" |
| orientation | "Front-facing (parallel to placket)" |
| style | "Patch pocket (sewn on top)" |

**LOWER POCKET DETAILS - VERY IMPORTANT:**
| Property | Example Value |
|----------|---------------|
| position | "Wearer's left hip, FRONT of body" |
| horizontal_position | "3cm from center placket" |
| vertical_position | "8cm above hem" |
| orientation | "Front-facing (parallel to placket)" |
| style | "Patch pocket (NOT slant/welt!)" |

❌ WRONG: "Side seam welt pocket" (these are slanted at sides)
✅ CORRECT: "Front-facing rectangular patch pocket" (on front body panel)

OUTPUT in garment_details.pockets_array:
[
  {
    "id": 1,
    "name": "Leather chest pocket",
    "position": "Wearer's left chest",
    "horizontal_position": "5cm from center placket",
    "vertical_position": "15cm below shoulder seam",
    "orientation": "Front-facing, parallel to button placket",
    "type": "Patch pocket",
    "style": "Sewn-on patch (NOT welt, NOT slant)",
    "material": "Burgundy leather with all-over embossed RR monogram (Я+R mirror pattern)",
    "color": "Burgundy leather (slightly glossier than matte wool body)",
    "shape": "Square",
    "size": "approx. 8×8cm",
    "closure": "Open top",
    "special_features": "All-over repeating RR monogram embossed pattern, visible perimeter stitching"
  },
  {
    "id": 2,
    "name": "Lower left pocket",
    "position": "Wearer's left hip, FRONT of body",
    "horizontal_position": "3cm from center placket",
    "vertical_position": "8cm above hem",
    "orientation": "Front-facing, parallel to button placket",
    "type": "Patch pocket",
    "style": "Sewn-on patch (NOT slant/welt!)",
    "material": "Same wool as body",
    "color": "Same burgundy as body",
    "shape": "Rectangular (straight edges)",
    "size": "approx. 13×15cm",
    "closure": "Open top",
    "special_features": "Visible edge stitching, matches right pocket"
  },
  {
    "id": 3,
    "name": "Lower right pocket",
    "position": "Wearer's right hip, FRONT of body",
    "horizontal_position": "3cm from center placket",
    "vertical_position": "8cm above hem",
    "orientation": "Front-facing, parallel to button placket",
    "type": "Patch pocket",
    "style": "Sewn-on patch (NOT slant/welt!)",
    "material": "Same wool as body",
    "color": "Same burgundy as body",
    "shape": "Rectangular (straight edges)",
    "size": "approx. 13×15cm",
    "closure": "Open top",
    "special_features": "Visible edge stitching, matches left pocket"
  }
]
    "special_features": "Visible edge stitching"
  }
]

══════════════════════════════════════════════════════════════════════════════
🔘 BUTTONS - VISUAL COUNTING! (V5.2 CRITICAL)
══════════════════════════════════════════════════════════════════════════════

⚠️ COUNT VISUALLY! Look at the FULL FRONT image and count EACH button!

**STEP-BY-STEP COUNTING:**
1. Find the TOP button (usually at collar or just below)
2. Count DOWN one by one: 1, 2, 3, 4, 5, 6...
3. Stop at the LAST button near hem
4. Include ALL visible buttons - do NOT skip any!

**COMMON ROMIMI SHIRT JACKETS:**
| Garment Type | Expected Buttons |
|--------------|------------------|
| Kids shirt jacket (collar to hem) | 5-6 buttons |
| Adult overshirt | 6-7 buttons |

⚠️ DO NOT GUESS! If you see 6 buttons, write 6. If you see 5, write 5.

OUTPUT in garment_details.buttons:
{
  "front_closure_count": 6,  ← EXACT visual count!
  "total_visible_buttons": 6,
  "material": "Resin",
  "color": "Matching burgundy",
  "diameter": "approx. 12-15mm",
  "style": "4-hole",
  "finish": "Matte"
}

══════════════════════════════════════════════════════════════════════════════
🎽 SHOULDER CONSTRUCTION - NARROW LEATHER STRIP! (V5.3 PRECISE)
══════════════════════════════════════════════════════════════════════════════

⚠️ CRITICAL: The leather overlay is a NARROW STRIP, not wide panel!

**SIZE IS IMPORTANT FOR IMAGE GENERATION:**
| Property | Correct Value | ❌ Wrong |
|----------|---------------|----------|
| Width | 3-4cm MAX | 8-10cm (too wide!) |
| Length | 10-12cm | Down to elbow (too long!) |
| Coverage | ~15-20% of shoulder width | 50%+ (too much!) |

⚠️ The leather strip should be SUBTLE, just along shoulder seam edge!

**WHAT TO CHECK:**
| Element | What to observe |
|---------|-----------------
| **Material** | Leather strip/panel same as yoke |
| **Position** | Both shoulders (left AND right) |
| **Start point** | Where collar meets shoulder seam |
| **End point** | Armhole seam / sleeve cap junction |
| **Width** | NARROW: 3-4cm only |
| **Length** | SHORT: 10-12cm |
| **Proportion** | Covers only ~15-20% of shoulder width |

OUTPUT in garment_details.shoulder_construction:
{
  "has_overlay": true,
  "overlay_type": "Narrow leather shoulder strip",
  "material": "Smooth burgundy leather (same as back yoke)",
  "width": "approx. 3-4cm (NARROW)",
  "length": "approx. 10-12cm (collar to armhole only)",
  "proportion_of_shoulder": "~15-20% of shoulder width",
  "extends_from": "Collar-shoulder junction",
  "extends_to": "Armhole/sleeve cap seam",
  "both_shoulders": true,
  "stitching_visible": true,
  "stitching_detail": "Tonal burgundy stitching along inner edge",
  "connects_to_yoke": true,
  "color_match": "Same shade as back yoke panel"
}

══════════════════════════════════════════════════════════════════════════════
🎨 PATCH/LOGO DETAILS - CHECK FOR STITCHING!
══════════════════════════════════════════════════════════════════════════════

⚠️ Look carefully at patch edges for stitching!

| What you see | Output |
|--------------|--------|
| Visible thread around patch perimeter | patch_stitch: "Visible border stitching, matching thread color" |
| No visible stitching | patch_stitch: "No visible stitching (heat-sealed or glued)" |

Also note:
- patch_shape: Square / Circular / Rectangular
- patch_color: ACTUAL patch color (e.g., "Black leather")

For RR monogram: has_logo = TRUE, patch_detail = "RR monogram (two Rs facing each other)"

══════════════════════════════════════════════════════════════════════════════
🧵 FABRIC CLASSIFICATION
══════════════════════════════════════════════════════════════════════════════

| Visual Evidence | Classification |
|-----------------|----------------|
| Smooth matte with soft nap | WOOL FELT / WOOL BLEND |
| Wide vertical ridges | CORDUROY |
| Fine vertical lines, stretchy | RIBBED JERSEY |

══════════════════════════════════════════════════════════════════════════════
📋 OUTPUT FORMAT (JSON ONLY!)
══════════════════════════════════════════════════════════════════════════════

{
  "general_info": {
    "product_name": "DESCRIPTIVE NAME IN CAPS",
    "category": "Shirt Jacket / Bomber / Hoodie / etc.",
    "fit_type": "Relaxed / Tapered / etc.",
    "gender_target": "Kids / Unisex / Men / Women"
  },
  "visual_specs": {
    "color_name": "DEEP BURGUNDY / WINE / etc.",
    "hex_code": "#XXXXXX (from actual fabric)",
    "fabric_texture": "Detailed texture description"
  },
  "design_front": {
    "has_logo": true/false,
    "logo_text": "Text or N/A",
    "font_family": "N/A",
    "logo_type": "Embossed leather pocket / Embroidered / etc.",
    "logo_content": "Description of visible front branding",
    "logo_color": "Tonal / White / etc.",
    "placement": "Wearer's left chest",
    "size": "approx. X×Xcm",
    "size_relative_pct": "~X% of chest width",
    "description": "Full description",
    "micro_details": "Edge details",
    "interior_branding": {
      "embroidery_location": "Neck tape and hanger loop (NOT collar wings!)",
      "embroidery_text": "Romimi",
      "embroidery_color": "Gray thread",
      "main_label": {
        "brand_name": "Romimi",
        "tagline": "Born to lead",
        "size_shown": "4-5"
      }
    }
  },
  "design_back": {
    "has_logo": true (if RR monogram present),
    "has_patch": true/false,
    "description": "Description including yoke panel",
    "technique": "Debossed leather patch / Embroidered",
    "patch_shape": "Square / Circular / Rectangular",
    "patch_color": "Actual patch color (e.g., Black leather)",
    "yoke_material": "Burgundy smooth leather yoke panel",
    "patch_detail": "RR monogram (two Rs facing each other)",
    "patch_stitch": "Visible border stitching / No visible stitching",
    "patch_edge": "Clean cut / Stitched",
    "patch_artwork_color": "Tonal deboss",
    "patch_layout": "Circular RR monogram centered on square patch",
    "patch_thickness": "Flat appliqué",
    "placement": "Center of leather yoke, Xcm below collar",
    "size": "approx. X×Xcm",
    "size_relative_pct": "~X% of back width",
    "micro_details": "Edge details, finish"
  },
  "garment_details": {
    "pockets": "Summary: 3 pockets total - 1 leather chest, 2 wool lower",
    "pockets_array": [
      {
        "id": 1,
        "name": "Leather chest pocket",
        "position": "Wearer's left chest",
        "type": "Patch pocket",
        "material": "Burgundy leather with embossed RR",
        "color": "Burgundy leather",
        "shape": "Square",
        "size": "approx. 8×8cm",
        "closure": "Open top",
        "special_features": "Embossed RR monogram pattern"
      },
      {
        "id": 2,
        "name": "Lower left pocket",
        "position": "Wearer's left hip",
        "type": "Patch pocket",
        "material": "Same wool as body",
        "color": "Same burgundy as body",
        "shape": "Rectangular",
        "size": "approx. 12×14cm",
        "closure": "Open top",
        "special_features": "None"
      },
      {
        "id": 3,
        "name": "Lower right pocket",
        "position": "Wearer's right hip",
        "type": "Patch pocket",
        "material": "Same wool as body",
        "color": "Same burgundy as body",
        "shape": "Rectangular",
        "size": "approx. 12×14cm",
        "closure": "Open top",
        "special_features": "None"
      }
    ],
    "shoulder_construction": {
      "has_overlay": true,
      "material": "Smooth burgundy leather",
      "width": "approx. 4cm",
      "extends_from": "Collar seam junction",
      "extends_to": "Sleeve cap",
      "color_match": "Matches yoke panel"
    },
    "sleeve_details": {
      "length": "Long sleeves",
      "construction": "Set-in sleeves",
      "cuff_style": "Straight open hem",
      "cuff_width": "approx. 10cm",
      "special_features": "Leather overlay at shoulder"
    },
    "buttons": {
      "front_closure_count": 5,
      "total_visible_buttons": 5,
      "material": "Resin",
      "color": "Matching burgundy",
      "diameter": "approx. 15mm",
      "style": "4-hole",
      "finish": "Matte"
    },
    "bottom_termination": "Straight hem",
    "bottom_branding": "None",
    "closure_details": "Button-front closure with 5 matching burgundy buttons",
    "hardware_finish": "Matte burgundy resin buttons",
    "neckline": "Point collar in burgundy wool. Leather yoke panel visible at shoulder junction but NOT on collar itself.",
    "seam_architecture": "Flat-felled seams"
  }
}

══════════════════════════════════════════════════════════════════════════════
✅ FINAL CHECKLIST
══════════════════════════════════════════════════════════════════════════════

□ Interior branding on NECK TAPE (not collar wings)?
□ Neckline describes collar material SEPARATELY from leather?
□ Pockets listed as individual array with each pocket's details?
□ Button count EXACT (counted top to bottom)?
□ patch_stitch checked for visible stitching?
□ RR monogram → has_logo: true?
□ Used WEARER'S perspective for positions?

Return ONLY valid JSON. No markdown. No explanation.`;
