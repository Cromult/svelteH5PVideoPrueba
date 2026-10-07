// Paletas de marca disponibles. Los colores viven en app.css (bloques [data-brand]).
import type { BrandId, ThemeMode } from './types.ts';

export interface ModeMeta {
	id: ThemeMode;
	label: string;
	icon: string;
}

export const MODES: ModeMeta[] = [
	{ id: 'light', label: 'Claro', icon: '☀' },
	{ id: 'dark', label: 'Oscuro', icon: '🌙' },
	{ id: 'auto', label: 'Auto', icon: '◐' }
];

export function modeOf(mode: ThemeMode | undefined): ThemeMode {
	return mode ?? 'auto';
}

/** Resuelve 'auto' al modo real según el sistema. */
export function resolveMode(mode: ThemeMode | undefined, prefersDark: boolean): 'light' | 'dark' {
	const m = modeOf(mode);
	return m === 'auto' ? (prefersDark ? 'dark' : 'light') : m;
}

export interface BrandMeta {
	id: BrandId;
	label: string;
	hint: string;
}

export const BRANDS: BrandMeta[] = [
	{ id: 'default', label: 'Default', hint: 'Índigo (demo)' },
	{ id: 'esam', label: 'ESAM', hint: 'Azul marino y dorado' },
	{ id: 'upi', label: 'UPI', hint: 'Naranja y negro' }
];

export function brandOf(brand: BrandId | undefined): BrandId {
	return brand ?? 'default';
}

export function brandLabel(brand: BrandId | undefined): string {
	return BRANDS.find((b) => b.id === brandOf(brand))?.label ?? 'Default';
}
