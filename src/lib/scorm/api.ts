// Simulador de un LMS con SCORM 1.2. Reproduce la API que un SCO espera
// encontrar en `window.API` (LMSInitialize, LMSGetValue, LMSSetValue, LMSCommit,
// LMSFinish) y guarda los datos CMI en localStorage, por curso y alumno.
// Así el reproductor se comporta como contenido SCORM real sin un LMS externo.

export type LessonStatus = 'not attempted' | 'incomplete' | 'completed' | 'passed' | 'failed' | 'browsed';

export interface ScormInteractionRecord {
	id: string;
	type: string;
	studentResponse: string;
	result: 'correct' | 'wrong' | 'neutral';
	weighting: number;
	latency: number;
}

export interface ScormSessionData {
	courseId: string;
	learnerId: string;
	learnerName: string;
	lessonStatus: LessonStatus;
	scoreRaw: number;
	scoreMin: number;
	scoreMax: number;
	/** Marcador (segundo del video) para reanudar. */
	lessonLocation: number;
	/** Estado opaco del contenido (aquí guardamos respuestas, tiempos y cobertura). */
	suspendData: string;
	sessionTime: number;
	totalTime: number;
	exit: string;
	entry: 'ab-initio' | 'resume';
	interactions: ScormInteractionRecord[];
	updatedAt: string;
}

const PREFIX = 'scorm:';

export function sessionKey(courseId: string, learnerId: string): string {
	return `${PREFIX}${courseId}:${learnerId}`;
}

export function emptySession(courseId: string, learnerId: string, learnerName: string): ScormSessionData {
	return {
		courseId,
		learnerId,
		learnerName,
		lessonStatus: 'not attempted',
		scoreRaw: 0,
		scoreMin: 0,
		scoreMax: 0,
		lessonLocation: 0,
		suspendData: '',
		sessionTime: 0,
		totalTime: 0,
		exit: '',
		entry: 'ab-initio',
		interactions: [],
		updatedAt: new Date().toISOString()
	};
}

export function loadSession(courseId: string, learnerId: string): ScormSessionData | null {
	try {
		const raw = localStorage.getItem(sessionKey(courseId, learnerId));
		return raw ? (JSON.parse(raw) as ScormSessionData) : null;
	} catch {
		return null;
	}
}

export function saveSession(data: ScormSessionData): void {
	try {
		data.updatedAt = new Date().toISOString();
		localStorage.setItem(sessionKey(data.courseId, data.learnerId), JSON.stringify(data));
	} catch {
		/* sin almacenamiento */
	}
}

export function clearSession(courseId: string, learnerId: string): void {
	try {
		localStorage.removeItem(sessionKey(courseId, learnerId));
	} catch {
		/* ignorar */
	}
}

export function listSessions(courseId?: string): ScormSessionData[] {
	const out: ScormSessionData[] = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key?.startsWith(PREFIX)) continue;
			const data = JSON.parse(localStorage.getItem(key) || 'null') as ScormSessionData | null;
			if (data && (!courseId || data.courseId === courseId)) out.push(data);
		}
	} catch {
		/* ignorar */
	}
	return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** HHHH:MM:SS.SS (formato de tiempo SCORM). */
export function formatScormTime(totalSeconds: number): string {
	const t = Math.max(0, Math.floor(totalSeconds || 0));
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = t % 60;
	return `${String(h).padStart(4, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.00`;
}

export function parseScormTime(value: string): number {
	const m = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/.exec(value?.trim() ?? '');
	if (!m) return 0;
	const frac = m[4] ? parseFloat(`0.${m[4]}`) : 0;
	return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
}

const STATUSES: LessonStatus[] = ['not attempted', 'incomplete', 'completed', 'passed', 'failed', 'browsed'];

/**
 * API SCORM 1.2. Mantiene un objeto CMI en memoria y lo persiste en cada commit.
 * Los métodos devuelven las cadenas "true"/"false" que define el estándar.
 */
export class ScormApi {
	private data: ScormSessionData;
	initialized = false;
	lastError = '0';

	constructor(data: ScormSessionData) {
		this.data = data;
	}

	get session(): ScormSessionData {
		return this.data;
	}

	LMSInitialize(_param = ''): string {
		if (this.initialized) return this.fail('101');
		this.initialized = true;
		this.data.entry = this.data.lessonStatus === 'not attempted' ? 'ab-initio' : 'resume';
		this.persist();
		return 'true';
	}

	LMSGetValue(element: string): string {
		if (!this.initialized) return this.fail('301');
		const d = this.data;
		switch (element) {
			case 'cmi.core.student_id':
				return d.learnerId;
			case 'cmi.core.student_name':
				return d.learnerName;
			case 'cmi.core.lesson_location':
				return String(d.lessonLocation);
			case 'cmi.core.score.raw':
				return String(d.scoreRaw);
			case 'cmi.core.score.min':
				return String(d.scoreMin);
			case 'cmi.core.score.max':
				return String(d.scoreMax);
			case 'cmi.core.lesson_status':
				return d.lessonStatus;
			case 'cmi.core.session_time':
				return formatScormTime(d.sessionTime);
			case 'cmi.core.total_time':
				return formatScormTime(d.totalTime);
			case 'cmi.core.exit':
				return d.exit;
			case 'cmi.core.entry':
				return d.entry;
			case 'cmi.suspend_data':
				return d.suspendData;
			case 'cmi.interactions._count':
				return String(d.interactions.length);
			default: {
				const m = /^cmi\.interactions\.(\d+)\.(id|type|student_response|result|weighting|latency)$/.exec(element);
				if (m) {
					const rec = d.interactions[Number(m[1])];
					if (!rec) return '';
					switch (m[2]) {
						case 'id':
							return rec.id;
						case 'type':
							return rec.type;
						case 'student_response':
							return rec.studentResponse;
						case 'result':
							return rec.result;
						case 'weighting':
							return String(rec.weighting);
						case 'latency':
							return formatScormTime(rec.latency);
					}
				}
				return '';
			}
		}
	}

	LMSSetValue(element: string, value: string): string {
		if (!this.initialized) return this.fail('301');
		const d = this.data;
		const num = () => Number(value) || 0;
		switch (element) {
			case 'cmi.core.lesson_location':
				d.lessonLocation = num();
				break;
			case 'cmi.core.score.raw':
				d.scoreRaw = num();
				break;
			case 'cmi.core.score.min':
				d.scoreMin = num();
				break;
			case 'cmi.core.score.max':
				d.scoreMax = num();
				break;
			case 'cmi.core.lesson_status':
				if (STATUSES.includes(value as LessonStatus)) d.lessonStatus = value as LessonStatus;
				break;
			case 'cmi.core.session_time':
				d.sessionTime = parseScormTime(value);
				break;
			case 'cmi.core.total_time':
				d.totalTime = parseScormTime(value);
				break;
			case 'cmi.core.exit':
				d.exit = value;
				break;
			case 'cmi.suspend_data':
				d.suspendData = value;
				break;
			default: {
				const m = /^cmi\.interactions\.(\d+)\.(id|type|student_response|result|weighting|latency)$/.exec(element);
				if (m) {
					const idx = Number(m[1]);
					const rec =
						d.interactions[idx] ??
						(d.interactions[idx] = {
							id: '',
							type: '',
							studentResponse: '',
							result: 'neutral',
							weighting: 1,
							latency: 0
						});
					switch (m[2]) {
						case 'id':
							rec.id = value;
							break;
						case 'type':
							rec.type = value;
							break;
						case 'student_response':
							rec.studentResponse = value;
							break;
						case 'result':
							rec.result = value as ScormInteractionRecord['result'];
							break;
						case 'weighting':
							rec.weighting = num();
							break;
						case 'latency':
							rec.latency = parseScormTime(value);
							break;
					}
					break;
				}
				return this.fail('401');
			}
		}
		this.persist();
		return 'true';
	}

	LMSCommit(_param = ''): string {
		if (!this.initialized) return this.fail('301');
		this.persist();
		return 'true';
	}

	LMSFinish(_param = ''): string {
		if (!this.initialized) return this.fail('301');
		this.initialized = false;
		this.persist();
		return 'true';
	}

	LMSGetLastError(): string {
		return this.lastError;
	}

	LMSGetErrorString(code: string): string {
		const map: Record<string, string> = {
			'0': 'No error',
			'101': 'General exception',
			'301': 'Not initialized',
			'401': 'Not implemented error'
		};
		return map[code] ?? 'Unknown error';
	}

	LMSGetDiagnostic(code: string): string {
		return this.LMSGetErrorString(code);
	}

	private fail(code: string): string {
		this.lastError = code;
		return 'false';
	}

	private persist(): void {
		saveSession(this.data);
	}
}

/**
 * Publica la API en `window.API` (y `window.API_1484_11` como alias) para que
 * cualquier SCO pueda encontrarla igual que en un LMS real. Devuelve una función
 * para quitarla.
 */
export function exposeApi(api: ScormApi): () => void {
	const w = window as unknown as Record<string, unknown>;
	w.API = api;
	w.API_1484_11 = api;
	return () => {
		delete w.API;
		delete w.API_1484_11;
	};
}
