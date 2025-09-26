import fetch from "node-fetch";

const DEFAULT_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";

export class DeepSeekClient {
	constructor({ apiKey = process.env.DEEPSEEK_API_KEY, baseUrl = DEFAULT_BASE_URL } = {}) {
		if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");
		this.apiKey = apiKey;
		this.baseUrl = baseUrl.replace(/\/$/, "");
	}

	async chat({ messages, model = "deepseek-chat", temperature = 0.3, response_format } = {}) {
		const url = `${this.baseUrl}/chat/completions`;
		const body = { model, messages, temperature };
		if (response_format) body.response_format = response_format;
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`DeepSeek error ${res.status}: ${text}`);
		}
		const json = await res.json();
		return json.choices?.[0]?.message?.content ?? "";
	}
}
