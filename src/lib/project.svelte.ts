import {
	clearProject,
	deleteAsset,
	deleteVideo,
	loadAsset,
	loadProject,
	loadVideo,
	saveAsset,
	saveProject,
	saveVideo
} from './storage.ts';
import {
	migrateToCourse,
	newContentLesson,
	newCourse,
	newQuizLesson,
	newResourceLesson,
	newVideoLesson,
	uid
} from './course.ts';
import { lessonInteractions, type BrandId, type Course, type Interaction, type InteractionType, type Lesson, type VideoLesson } from './types.ts';

export { uid };

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

/** ¿Alguna otra lección sigue usando este blob? (para no borrarlo antes de tiempo). */
function keyUsed(course: Course, kind: 'video' | 'asset', key: string, exceptId: string): boolean {
	return course.lessons.some((l) => {
		if (l.id === exceptId) return false;
		if (kind === 'video') return l.kind === 'video' && l.videoKey === key;
		return (l.kind === 'content' && l.imageKey === key) || (l.kind === 'resource' && l.fileKey === key);
	});
}

class ProjectState {
	data = $state<Course | null>(null);
	currentId = $state<string | null>(null);
	videoUrl = $state<string | null>(null);
	assetUrl = $state<string | null>(null);
	loading = $state(true);

	/** Lección seleccionada en el editor. */
	current = $derived<Lesson | null>(
		this.data ? (this.data.lessons.find((l) => l.id === this.currentId) ?? this.data.lessons[0] ?? null) : null
	);
	currentVideo = $derived<VideoLesson | null>(this.current?.kind === 'video' ? this.current : null);
	/** Interacciones de la lección actual, ordenadas por tiempo. */
	interactions = $derived<Interaction[]>(
		this.current ? [...lessonInteractions(this.current)].sort((a, b) => a.time - b.time) : []
	);
	sorted = $derived(this.interactions);
	lessonCount = $derived(this.data?.lessons.length ?? 0);

	async load() {
		this.loading = true;
		const course = migrateToCourse(loadProject());
		if (course && course.lessons.length) {
			this.data = course;
			this.currentId = course.lessons[0].id;
			await this.loadAssets();
		} else {
			this.data = course;
		}
		this.loading = false;
	}

	async createCourseFromFiles(files: File[], title: string) {
		const course = newCourse(title || files[0]?.name.replace(/\.[^.]+$/, '') || 'Curso');
		for (const file of files) {
			const key = uid();
			await saveVideo(key, file);
			course.lessons.push(newVideoLesson('', key, file.name));
		}
		this.setVideoUrl(null);
		this.setAssetUrl(null);
		this.data = course;
		this.currentId = course.lessons[0]?.id ?? null;
		await this.loadAssets();
		this.persist();
	}

	async selectLesson(id: string) {
		if (!this.data) return;
		this.currentId = id;
		await this.loadAssets();
	}

	async addVideoLesson(file: File) {
		if (!this.data) return;
		const key = uid();
		await saveVideo(key, file);
		const lesson = newVideoLesson('', key, file.name);
		this.data.lessons.push(lesson);
		this.currentId = lesson.id;
		await this.loadAssets();
		this.markDraft();
		this.persist();
	}

	addContentLesson() {
		if (!this.data) return;
		const lesson = newContentLesson(`Contenido ${this.data.lessons.length + 1}`);
		this.data.lessons.push(lesson);
		this.currentId = lesson.id;
		this.setVideoUrl(null);
		this.setAssetUrl(null);
		this.markDraft();
		this.persist();
	}

	addQuizLesson() {
		if (!this.data) return;
		const lesson = newQuizLesson(`Cuestionario ${this.data.lessons.length + 1}`);
		this.data.lessons.push(lesson);
		this.currentId = lesson.id;
		this.setVideoUrl(null);
		this.setAssetUrl(null);
		this.markDraft();
		this.persist();
	}

	addResourceLesson() {
		if (!this.data) return;
		const lesson = newResourceLesson(`Recurso ${this.data.lessons.length + 1}`);
		this.data.lessons.push(lesson);
		this.currentId = lesson.id;
		this.setVideoUrl(null);
		this.setAssetUrl(null);
		this.markDraft();
		this.persist();
	}

	duplicateLesson(id: string) {
		if (!this.data) return;
		const source = this.data.lessons.find((l) => l.id === id);
		if (!source) return;
		const copy = structuredClone($state.snapshot(source)) as Lesson;
		copy.id = uid();
		copy.title = `${copy.title} (copia)`;
		if (copy.kind === 'video' || copy.kind === 'quiz') {
			for (const i of copy.interactions) i.id = uid();
		}
		const idx = this.data.lessons.findIndex((l) => l.id === id);
		this.data.lessons.splice(idx + 1, 0, copy);
		this.markDraft();
		this.persist();
	}

	async removeLesson(id: string) {
		if (!this.data) return;
		const lesson = this.data.lessons.find((l) => l.id === id);
		if (!lesson) return;
		const remaining = this.data.lessons.filter((l) => l.id !== id);
		if (lesson.kind === 'video' && !keyUsed({ ...this.data, lessons: remaining }, 'video', lesson.videoKey, id)) {
			await deleteVideo(lesson.videoKey).catch(() => {});
		}
		if (lesson.kind === 'content' && lesson.imageKey && !keyUsed({ ...this.data, lessons: remaining }, 'asset', lesson.imageKey, id)) {
			await deleteAsset(lesson.imageKey).catch(() => {});
		}
		if (lesson.kind === 'resource' && lesson.fileKey && !keyUsed({ ...this.data, lessons: remaining }, 'asset', lesson.fileKey, id)) {
			await deleteAsset(lesson.fileKey).catch(() => {});
		}
		this.data.lessons = remaining;
		if (this.currentId === id) this.currentId = remaining[0]?.id ?? null;
		await this.loadAssets();
		this.markDraft();
		this.persist();
	}

	moveLesson(id: string, delta: number) {
		if (!this.data) return;
		const lessons = this.data.lessons;
		const idx = lessons.findIndex((l) => l.id === id);
		const to = idx + delta;
		if (idx < 0 || to < 0 || to >= lessons.length) return;
		[lessons[idx], lessons[to]] = [lessons[to], lessons[idx]];
		this.markDraft();
		this.persist();
	}

	async setLessonImage(file: File) {
		if (this.current?.kind !== 'content') return;
		if (this.current.imageKey) await deleteAsset(this.current.imageKey).catch(() => {});
		const key = uid();
		await saveAsset(key, file);
		this.current.imageKey = key;
		this.current.imageName = file.name;
		await this.loadAssets();
		this.markDraft();
		this.persist();
	}

	async clearLessonImage() {
		if (this.current?.kind !== 'content' || !this.current.imageKey) return;
		await deleteAsset(this.current.imageKey).catch(() => {});
		this.current.imageKey = undefined;
		this.current.imageName = undefined;
		this.setAssetUrl(null);
		this.markDraft();
		this.persist();
	}

	async setLessonFile(file: File) {
		if (this.current?.kind !== 'resource') return;
		if (this.current.fileKey) await deleteAsset(this.current.fileKey).catch(() => {});
		const key = uid();
		await saveAsset(key, file);
		this.current.fileKey = key;
		this.current.fileName = file.name;
		await this.loadAssets();
		this.markDraft();
		this.persist();
	}

	async clearLessonFile() {
		if (this.current?.kind !== 'resource' || !this.current.fileKey) return;
		await deleteAsset(this.current.fileKey).catch(() => {});
		this.current.fileKey = undefined;
		this.current.fileName = undefined;
		this.setAssetUrl(null);
		this.markDraft();
		this.persist();
	}

	add(type: InteractionType, time: number): Interaction | null {
		if (!this.data || (this.current?.kind !== 'video' && this.current?.kind !== 'quiz')) return null;
		const interaction = createInteraction(type, time);
		this.current.interactions.push(interaction);
		this.markDraft();
		return this.current.interactions.at(-1)!;
	}

	remove(id: string) {
		if (this.current?.kind !== 'video' && this.current?.kind !== 'quiz') return;
		this.current.interactions = this.current.interactions.filter((i) => i.id !== id);
		this.markDraft();
	}

	duplicate(id: string): Interaction | null {
		if (this.current?.kind !== 'video' && this.current?.kind !== 'quiz') return null;
		const source = this.current.interactions.find((i) => i.id === id);
		if (!source) return null;
		const copy = structuredClone($state.snapshot(source)) as Interaction;
		copy.id = uid();
		this.current.interactions.push(copy);
		this.markDraft();
		return this.current.interactions.at(-1)!;
	}

	updateDuration(seconds: number) {
		if (this.currentVideo && seconds && Math.abs(this.currentVideo.duration - seconds) > 0.05) {
			this.currentVideo.duration = seconds;
		}
	}

	setSequential(on: boolean) {
		if (!this.data) return;
		this.data.sequential = on;
		this.markDraft();
		this.persist();
	}

	setBrand(brand: BrandId) {
		if (!this.data || this.data.brand === brand) return;
		this.data.brand = brand;
		this.markDraft();
		this.persist();
	}

	setMode(mode: Course['mode']) {
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

	async reset() {
		if (this.data) {
			const videos = new Set(this.data.lessons.filter((l): l is VideoLesson => l.kind === 'video').map((l) => l.videoKey));
			await Promise.all([...videos].map((k) => deleteVideo(k).catch(() => {})));
		}
		clearProject();
		this.setVideoUrl(null);
		this.setAssetUrl(null);
		this.data = null;
		this.currentId = null;
	}

	persist() {
		if (!this.data) return;
		const snapshot = $state.snapshot(this.data) as Course;
		snapshot.updatedAt = new Date().toISOString();
		saveProject(snapshot);
	}

	/** Carga las URLs de los blobs de la lección actual (video o activo). */
	private async loadAssets() {
		const lesson = this.current;
		if (lesson?.kind === 'video') {
			const blob = await loadVideo(lesson.videoKey).catch(() => undefined);
			this.setVideoUrl(blob ? URL.createObjectURL(blob) : null);
			this.setAssetUrl(null);
		} else if (lesson?.kind === 'content' && lesson.imageKey) {
			const blob = await loadAsset(lesson.imageKey).catch(() => undefined);
			this.setVideoUrl(null);
			this.setAssetUrl(blob ? URL.createObjectURL(blob) : null);
		} else if (lesson?.kind === 'resource' && lesson.fileKey) {
			const blob = await loadAsset(lesson.fileKey).catch(() => undefined);
			this.setVideoUrl(null);
			this.setAssetUrl(blob ? URL.createObjectURL(blob) : null);
		} else {
			this.setVideoUrl(null);
			this.setAssetUrl(null);
		}
	}

	private setVideoUrl(url: string | null) {
		if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
		this.videoUrl = url;
	}

	private setAssetUrl(url: string | null) {
		if (this.assetUrl) URL.revokeObjectURL(this.assetUrl);
		this.assetUrl = url;
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
