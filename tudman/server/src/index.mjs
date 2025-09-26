import "dotenv/config";
import express from "express";
import cors from "cors";
import { DeepSeekClient } from "./deepseekClient.mjs";
import { extractReadableTextFromUrl } from "./contentExtract.mjs";
import { z } from "zod";
import { Quiz } from "./quizSchema.mjs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const deepseek = new DeepSeekClient({});

function alternateQuestions(mcqs, frees) {
	const result = [];
	const total = mcqs.length + frees.length;
	let mi = 0, fi = 0;
	for (let i = 0; i < total; i++) {
		if (i % 2 === 0) {
			if (mi < mcqs.length) result.push(mcqs[mi++]);
			else if (fi < frees.length) result.push(frees[fi++]);
		} else {
			if (fi < frees.length) result.push(frees[fi++]);
			else if (mi < mcqs.length) result.push(mcqs[mi++]);
		}
	}
	return result;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/generateQuiz", async (req, res) => {
	try {
		const schema = z.object({
			inputType: z.enum(["url", "topic"]),
			value: z.string().min(1),
			durationMinutes: z.number().int().min(1).max(60),
		});
		const { inputType, value, durationMinutes } = schema.parse(req.body);

		let material = "";
		if (inputType === "url") {
			material = await extractReadableTextFromUrl(value);
		} else {
			material = value;
		}

		const totalQuestions = durationMinutes * 2;
		const numMcq = Math.floor(totalQuestions / 2);
		const numFree = totalQuestions - numMcq;

		const system = {
			role: "system",
			content: "You are an educational quiz generator for Persian (Farsi) students in Iran. Generate concise, accurate questions from provided material. Output STRICT JSON only.",
		};
		const user = {
			role: "user",
			content: JSON.stringify({
				language: "fa",
				material,
				requirements: {
					numMcq,
					numFree,
					format: "Return JSON with mcqs and frees arrays. MCQs: id, prompt (fa), 4 options (fa), answerIndex. Frees: id, prompt (fa), idealAnswer (fa).",
					level: "concise, exam-like, balanced coverage",
				},
			}),
		};

		const content = await deepseek.chat({
			messages: [system, user],
			response_format: { type: "json_object" },
		});

		let parsed;
		try { parsed = JSON.parse(content); } catch {
			return res.status(502).json({ error: "Invalid AI response" });
		}

		const mcqs = (parsed.mcqs || []).map((q) => ({
			id: String(q.id || cryptoRandom()),
			type: "mcq",
			prompt: String(q.prompt || ""),
			options: Array.isArray(q.options) ? q.options.slice(0,4).map(String) : [],
			answerIndex: Number.isInteger(q.answerIndex) ? q.answerIndex : 0,
		}));
		const frees = (parsed.frees || []).map((q) => ({
			id: String(q.id || cryptoRandom()),
			type: "free",
			prompt: String(q.prompt || ""),
			idealAnswer: String(q.idealAnswer || ""),
		}));

		const questions = alternateQuestions(mcqs, frees).slice(0, totalQuestions);
		const quiz = { source: { kind: inputType, value }, durationMinutes, questions };
		const validated = Quiz.parse(quiz);
		res.json(validated);
	} catch (e) {
		res.status(400).json({ error: e.message || String(e) });
	}
});

app.post("/api/evaluate", async (req, res) => {
	try {
		const schema = z.object({
			question: z.object({
				id: z.string(),
				type: z.enum(["mcq", "free"]),
				prompt: z.string(),
				options: z.array(z.string()).optional(),
				answerIndex: z.number().optional(),
				idealAnswer: z.string().optional(),
			}),
			userAnswer: z.string(),
		});
		const { question, userAnswer } = schema.parse(req.body);

		if (question.type === "mcq") {
			const correctIndex = question.answerIndex ?? 0;
			const userIndex = Number(userAnswer);
			const correct = userIndex === correctIndex;
			return res.json({ correct, score: correct ? 1 : 0, feedback: correct ? "درست" : "نادرست" });
		}

		const system = { role: "system", content: "You are an Iranian tutor. Evaluate student free-response briefly in Persian. Return JSON {correct:boolean, feedback:string, score:number between 0 and 1}." };
		const user = { role: "user", content: JSON.stringify({ prompt: question.prompt, idealAnswer: question.idealAnswer, student: userAnswer, language: "fa" }) };
		const content = await deepseek.chat({ messages: [system, user], response_format: { type: "json_object" } });
		let parsed;
		try { parsed = JSON.parse(content); } catch { return res.status(502).json({ error: "Invalid AI response" }); }
		const correct = Boolean(parsed.correct);
		const score = Math.max(0, Math.min(1, Number(parsed.score ?? 0)));
		const feedback = String(parsed.feedback || "");
		return res.json({ correct, score, feedback });
	} catch (e) {
		res.status(400).json({ error: e.message || String(e) });
	}
});

app.post("/api/summary", async (req, res) => {
	try {
		const schema = z.object({
			qa: z.array(z.object({
				prompt: z.string(),
				type: z.enum(["mcq", "free"]),
				idealAnswer: z.string().optional(),
				userAnswer: z.string().optional(),
				correct: z.boolean().optional(),
				feedback: z.string().optional(),
			})),
		});
		const { qa } = schema.parse(req.body);
		const system = { role: "system", content: "Create a concise Persian study summary with bullet points, key definitions, and missed concepts first. Output markdown in Persian." };
		const user = { role: "user", content: JSON.stringify({ qa }) };
		const content = await deepseek.chat({ messages: [system, user], temperature: 0.2 });
		res.json({ summary: content });
	} catch (e) {
		res.status(400).json({ error: e.message || String(e) });
	}
});

function cryptoRandom() {
	return Math.random().toString(36).slice(2, 10);
}

const port = Number(process.env.PORT || 5050);
app.listen(port, () => {
	console.log(`server listening on :${port}`);
});
