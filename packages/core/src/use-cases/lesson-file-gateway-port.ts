import type { Lesson } from "../entities/lesson.js";

export interface ParsedLesson {
    readonly lesson: Lesson;
    readonly filePath: string;
}

export interface LessonReadError {
    readonly filePath: string;
    readonly reason: string;
}

export interface ReadLessonsResult {
    readonly lessons: readonly ParsedLesson[];
    readonly errors: readonly LessonReadError[];
}

export interface LessonFileGatewayPort {
    readLessons(rootDir: string): Promise<ReadLessonsResult>;
}
