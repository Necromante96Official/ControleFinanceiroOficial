// Escapa texto para uso seguro em HTML
export function escapeHtml(value) {
	const text = value === null || value === undefined ? '' : String(value);
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
