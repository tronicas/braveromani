import fetch from "node-fetch";
import { Readability } from "readability-js";
import { JSDOM } from "jsdom";

export async function extractReadableTextFromUrl(targetUrl) {
	const res = await fetch(targetUrl, { redirect: "follow" });
	if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
	const html = await res.text();
	const dom = new JSDOM(html, { url: targetUrl });
	const reader = new Readability(dom.window.document);
	const article = reader.parse();
	const text = [article?.title, article?.textContent].filter(Boolean).join("\n\n");
	return text || dom.window.document.body.textContent || "";
}
