// Calcula contagens (preview) a partir do payload de backup
export function getBackupCounts(payload) {
	// ------------ Estrutura esperada: payload.data = { categories, benefits, credit, debit, transactions }
	const data = payload?.data || {};

	const categories = Array.isArray(data.categories) ? data.categories.length : 0;
	const benefits = Array.isArray(data.benefits) ? data.benefits.length : 0;
	const debitCards = Array.isArray(data.debit) ? data.debit.length : 0;
	const creditCards = Array.isArray(data.credit) ? data.credit.length : 0;
	const transactions = Array.isArray(data.transactions) ? data.transactions.length : 0;

	return {
		categories,
		benefits,
		debitCards,
		creditCards,
		transactions,
	};
}
