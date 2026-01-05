// Faz download de um texto como arquivo (UTF-8)
export function downloadTextFile({ filename, text, mimeType = 'application/json' }) {
	// ------------ Validação defensiva
	if (!filename || typeof filename !== 'string') {
		throw new Error('downloadTextFile: filename inválido');
	}
	if (typeof text !== 'string') {
		throw new Error('downloadTextFile: text inválido');
	}

	const blob = new Blob([text], { type: mimeType });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();

	URL.revokeObjectURL(url);
}
