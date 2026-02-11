export type AspectRatio = '16:9' | '1:1' | '3:4' | '4:3' | '9:16';
export type PaintByNumbersMode = 'framed' | 'unframed';

export interface ProductEntity {
    id: string;
    name: string;
    specs: string; // Dimensions, materials, etc.
    images: string[]; 
    selected: boolean;
}

export interface PresetDefinition {
    id: string;
    label: string;
    width: string;
    height: string;
    ratio: AspectRatio;
}
