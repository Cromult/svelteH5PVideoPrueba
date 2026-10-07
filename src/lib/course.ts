// Helpers del modelo de curso: creación de lecciones, migración desde el modelo
// antiguo de un solo video y utilidades de progreso.
import type {
	ContentLesson,
	Course,
	InteractiveVideo,
	Lesson,
	QuizLesson,
	ResourceLesson,
	VideoLesson
} from './types.ts';
import { lessonInteractions } from './types.ts';

export const uid = (): string =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2) + Date.now().toString(36);

export function newVideoLesson(title: string, videoKey: string, videoName: string): VideoLesson {
	return { id: uid(), kind: 'video', title: title || videoName.replace(/\.[^.]+$/, ''), videoKey, videoName, duration: 0, interactions: [] };
}

export function newContentLesson(title = 'Página de contenido'): ContentLesson {
	return { id: uid(), kind: 'content', title, body: '' };
}

export function newQuizLesson(title = 'Cuestionario'): QuizLesson {
	return { id: uid(), kind: 'quiz', title, interactions: [], threshold: 0.6 };
}

export function newResourceLesson(title = 'Recurso'): ResourceLesson {
	return { id: uid(), kind: 'resource', title, description: '' };
}

export function newCourse(title: string): Course {
	return {
		id: uid(),
		title: title || 'Curso sin título',
		status: 'draft',
		updatedAt: new Date().toISOString(),
		sequential: true,
		threshold: 0.6,
		lessons: []
	};
}

export function lessonMaxScore(lesson: Lesson): number {
	return lessonInteractions(lesson).reduce((sum, i) => sum + i.points, 0);
}

/** Suma de puntos de todas las interacciones del curso. */
export function courseMaxScore(course: Course): number {
	return course.lessons.reduce((sum, l) => sum + lessonMaxScore(l), 0);
}

/**
 * Normaliza lo cargado desde localStorage: cursos nuevos pasan tal cual y los
 * proyectos antiguos de un solo video se envuelven en un curso de una lección.
 */
export function migrateToCourse(raw: unknown): Course | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	if (Array.isArray(obj.lessons)) {
		const course = obj as unknown as Course;
		course.sequential ??= true;
		course.threshold ??= 0.6;
		return course;
	}
	// Modelo antiguo: InteractiveVideo con un solo MP4.
	if (typeof obj.videoKey === 'string') {
		const legacy = obj as unknown as InteractiveVideo;
		const lesson: VideoLesson = {
			id: legacy.id ?? uid(),
			kind: 'video',
			title: legacy.title,
			videoKey: legacy.videoKey,
			videoName: legacy.videoName,
			duration: legacy.duration ?? 0,
			interactions: legacy.interactions ?? []
		};
		return {
			id: legacy.id ?? uid(),
			title: legacy.title,
			brand: legacy.brand,
			mode: legacy.mode,
			status: legacy.status ?? 'draft',
			updatedAt: legacy.updatedAt ?? new Date().toISOString(),
			sequential: true,
			threshold: 0.6,
			lessons: [lesson]
		};
	}
	return null;
}

/** ¿La lección tiene contenido suficiente para el estudiante? */
export function lessonReady(lesson: Lesson): boolean {
	switch (lesson.kind) {
		case 'video':
			return lesson.videoKey.length > 0;
		case 'content':
			return lesson.body.trim().length > 0 || !!lesson.imageKey;
		case 'quiz':
			return lesson.interactions.length > 0;
		case 'resource':
			return !!lesson.url || !!lesson.fileKey;
	}
}
