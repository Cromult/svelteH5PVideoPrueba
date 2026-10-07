import { clearProject, deleteVideo, loadProject, loadVideo, saveProject, saveVideo } from './storage.ts';
import type { BrandId, Interaction, InteractionType, InteractiveVideo, ThemeMode } from './types.ts';

export const uid = () =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2) + Date.now().toString(36);

export function createInteraction(type: InteractionType, time: number): Interaction {
	const base = {
		id: uid(),
		time: Math.round(time * 10) / 10,
		required: true,
		points: 1,
		question: '',
		feedbackCorrect: '¡Correcto!',
		feedbackIncorrect: 'No es correcto, revisa esta parte del video.',
		onFailSeekTo: null
	};
	switch (type) {
		case 'multiple-choice':
			return {
				...base,
				type,
				multiple: false,
				options: [
					{ id: uid(), text: '', correct: true },
					{ id: uid(), text: '', correct: false },
					{ id: uid(), text: '', correct: false }
				]
			};
		case 'true-false':
			return { ...base, type, answer: true };
		case 'short-answer':
			return { ...base, type, accepted: [''], caseSensitive: false };
		case 'matching':
			return {
				...base,
				type,
				pairs: [
					{ id: uid(), left: '', right: '' },
					{ id: uid(), left: '', right: '' },
					{ id: uid(), left: '', right: '' }
				]
			};
	}
}

class ProjectState {
	data = $state<InteractiveVideo | null>(null);
	videoUrl = $state<string | null>(null);
	loading = $state(true);

	/** Preguntas ordenadas por tiempo (derivado). */
	sorted = $derived(this.data ? [...this.data.interactions].sort((a, b) => a.time - b.time) : []);

	async load() {
		this.loading = true;
		const stored = loadProject();
		if (stored) {
			if (!stored.brand) stored.brand = 'default';
			if (!stored.mode) stored.mode = 'auto';
			const blob = await loadVideo(stored.videoKey).catch(() => undefined);
			if (blob) {
				this.setUrl(URL.createObjectURL(blob));
				this.data = stored;
			} else {
				this.data = null;
			}
		}
		this.loading = false;
	}

	async createFromFile(file: File, title: string) {
		const videoKey = uid();
		await saveVideo(videoKey, file);
		if (this.data) await deleteVideo(this.data.videoKey).catch(() => {});
		this.setUrl(URL.createObjectURL(file));
		this.data = {
			id: uid(),
			title: title || file.name.replace(/\.[^.]+$/, ''),
			brand: 'default',
			mode: 'auto',
			videoKey,
			videoName: file.name,
			duration: 0,
			status: 'draft',
			updatedAt: new Date().toISOString(),
			interactions: []
		};
		this.persist();
	}

	async reset() {
		if (this.data) await deleteVideo(this.data.videoKey).catch(() => {});
		clearProject();
		this.setUrl(null);
		this.data = null;
	}

	persist() {
		if (!this.data) return;
		// updatedAt se pone solo en la copia guardada para no re-disparar el autoguardado.
		const snapshot = $state.snapshot(this.data) as InteractiveVideo;
		snapshot.updatedAt = new Date().toISOString();
		saveProject(snapshot);
	}

	add(type: InteractionType, time: number): Interaction {
		const interaction = createInteraction(type, time);
		this.data!.interactions.push(interaction);
		this.markDraft();
		// Devolvemos el proxy reactivo, no el objeto original.
		return this.data!.interactions.at(-1)!;
	}

	remove(id: string) {
		if (!this.data) return;
		this.data.interactions = this.data.interactions.filter((i) => i.id !== id);
		this.markDraft();
	}

	duplicate(id: string): Interaction | null {
		const source = this.data?.interactions.find((i) => i.id === id);
		if (!source) return null;
		const copy = structuredClone($state.snapshot(source)) as Interaction;
		copy.id = uid();
		copy.time = Math.min(copy.time + 2, this.data!.duration || copy.time + 2);
		this.data!.interactions.push(copy);
		this.markDraft();
		return this.data!.interactions.at(-1)!;
	}

	setBrand(brand: BrandId) {
		if (!this.data || this.data.brand === brand) return;
		this.data.brand = brand;
		this.markDraft();
		this.persist();
	}

	setMode(mode: ThemeMode) {
		if (!this.data || this.data.mode === mode) return;
		this.data.mode = mode;
		this.persist();
	}

	markDraft() {
		if (this.data) this.data.status = 'draft';
	}

	publish() {
		if (!this.data) return;
		this.data.status = 'published';
		this.persist();
	}

	private setUrl(url: string | null) {
		if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
		this.videoUrl = url;
	}
}

export const project = new ProjectState();

export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds)) return '0:00';
	const s = Math.max(0, seconds);
	const m = Math.floor(s / 60);
	const rest = s - m * 60;
	return `${m}:${Math.floor(rest).toString().padStart(2, '0')}`;
}

/** Igual que formatTime pero con décimas, para el editor. */
export function formatTimePrecise(seconds: number): string {
	const tenths = Math.floor((Math.max(0, seconds) % 1) * 10);
	return `${formatTime(seconds)}.${tenths}`;
}
