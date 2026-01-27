import { MergedPrompts } from '../common/interfaces/merged-prompts.interface';

export const MOCK_MERGED_PROMPTS: MergedPrompts = {
    duo: {
        type: 'duo',
        display_name: 'DUO (Two Models)',
        prompt: 'Professional e-commerce photography of two mannequins wearing the collection pieces, side by side, studio lighting, neutral background, emphasizing the fit and fabric drape.',
        negative_prompt: 'blurry, low quality, distorted, watermark, text, logos, deformed',
        camera: {
            focal_length_mm: 50,
            aperture: 8,
            focus: 'sharp',
            angle: 'eye-level'
        },
        background: {
            wall: 'Clean white studio wall',
            floor: 'White seamless floor'
        },
        product_details: {
            type: 'Tracksuit',
            color: 'Navy Blue',
            piping: 'White',
            logos: 'Brand logo on chest'
        },
        da_elements: {
            background: 'Minimalist studio',
            props: 'None',
            mood: 'Professional and clean',
            composition: 'Balanced side-by-side'
        },
        editable: true,
        last_edited_at: null
    },
    solo: {
        type: 'solo',
        display_name: 'SOLO (Single Model)',
        prompt: 'Professional e-commerce photography of a single mannequin displaying the primary product, full body shot, dynamic pose, studio lighting.',
        negative_prompt: 'blurry, low quality, distorted, watermark',
        camera: {
            focal_length_mm: 85,
            aperture: 5.6,
            focus: 'product',
            angle: 'eye-level'
        },
        background: {
            wall: 'Neutral grey gradient',
            floor: 'Grey matte'
        },
        product_details: {
            type: 'Tracksuit Top',
            color: 'Navy Blue',
            zip: 'Metal zipper'
        },
        da_elements: {
            background: 'Studio gradient',
            props: 'None',
            mood: 'Focused',
            composition: 'Centered'
        },
        editable: true,
        last_edited_at: null
    },
    flatlay_front: {
        type: 'flatlay_front',
        display_name: 'FLAT LAY FRONT',
        prompt: 'Professional flatlay photography of the product, front view, neatly arranged on a surface, overhead shot, soft lighting, 90 degree angle.',
        negative_prompt: 'wrinkles, messy, shadows, distorted',
        camera: {
            focal_length_mm: 35,
            aperture: 11,
            focus: 'entire product',
            angle: 'overhead'
        },
        background: {
            wall: 'n/a',
            floor: 'White table surface'
        },
        product_details: {
            type: 'Tracksuit',
            color: 'Navy Blue',
            logos: 'Visible'
        },
        da_elements: {
            background: 'White surface',
            props: 'None',
            mood: 'Technical',
            composition: 'Symmetrical'
        },
        editable: true,
        last_edited_at: null
    },
    flatlay_back: {
        type: 'flatlay_back',
        display_name: 'FLAT LAY BACK',
        prompt: 'Professional flatlay photography of the product, back view, neatly arranged on a surface, overhead shot, soft lighting, 90 degree angle.',
        negative_prompt: 'wrinkles, messy, shadows, distorted',
        camera: {
            focal_length_mm: 35,
            aperture: 11,
            focus: 'entire product',
            angle: 'overhead'
        },
        background: {
            wall: 'n/a',
            floor: 'White table surface'
        },
        product_details: {
            type: 'Tracksuit',
            color: 'Navy Blue'
        },
        da_elements: {
            background: 'White surface',
            props: 'None',
            mood: 'Technical',
            composition: 'Symmetrical'
        },
        editable: true,
        last_edited_at: null
    },
    closeup_front: {
        type: 'closeup_front',
        display_name: 'CLOSE UP FRONT',
        prompt: 'Macro photography detail shot of the product front features, zooming in on logos/prints or fabric texture, shallow depth of field.',
        negative_prompt: 'blurry, out of focus, noisy',
        camera: {
            focal_length_mm: 100,
            aperture: 2.8,
            focus: 'detail',
            angle: 'macro'
        },
        background: {
            wall: 'Blurred',
            floor: 'n/a'
        },
        product_details: {
            type: 'Detail',
            color: 'Navy Blue',
            logos: 'Embroidered logo'
        },
        da_elements: {
            background: 'Bokeh',
            props: 'None',
            mood: 'Artistic',
            composition: 'Detail oriented'
        },
        editable: true,
        last_edited_at: null
    },
    closeup_back: {
        type: 'closeup_back',
        display_name: 'CLOSE UP BACK',
        prompt: 'Macro photography detail shot of the product back features, zooming in on labels or back design elements, shallow depth of field.',
        negative_prompt: 'blurry, out of focus, noisy',
        camera: {
            focal_length_mm: 100,
            aperture: 2.8,
            focus: 'detail',
            angle: 'macro'
        },
        background: {
            wall: 'Blurred',
            floor: 'n/a'
        },
        product_details: {
            type: 'Detail',
            color: 'Navy Blue',
            logos: 'Label'
        },
        da_elements: {
            background: 'Bokeh',
            props: 'None',
            mood: 'Artistic',
            composition: 'Detail oriented'
        },
        editable: true,
        last_edited_at: null
    }
};
