import { z } from "zod";

export const QuestionType = z.enum(["mcq", "free"]);

export const McqQuestion = z.object({
	id: z.string(),
	type: z.literal("mcq"),
	prompt: z.string(),
	options: z.array(z.string()).length(4),
	answerIndex: z.number().int().min(0).max(3),
});

export const FreeQuestion = z.object({
	id: z.string(),
	type: z.literal("free"),
	prompt: z.string(),
	idealAnswer: z.string(),
});

export const Question = z.discriminatedUnion("type", [McqQuestion, FreeQuestion]);
export const Quiz = z.object({
	source: z.object({ kind: z.enum(["url", "topic"]), value: z.string() }),
	durationMinutes: z.number().int().min(1).max(120),
	questions: z.array(Question),
});
