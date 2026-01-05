import { escapeHtml } from './escapeHtml.js';

// Converte texto com quebras de linha em HTML seguro
export function textToSafeHtml(text) {
	const safe = escapeHtml(text);
	return safe.replace(/\n/g, '<br>');
}
