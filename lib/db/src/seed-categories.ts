// Reference fixtures used by the original product catalog, plus wholesale samples.
// VAT is enabled by default; these are demo settings, editable in Manage categories.
export const SEED_CATEGORIES = [
  "Analgesic",
  "Antibiotic",
  "Antihypertensive",
  "Cholesterol",
  "Antidiabetic",
  "Antihistamine",
  "Respiratory",
  "Gastrointestinal",
  "Vitamins & Supplements",
  "Topical",
  "Controlled Substance",
  "Medicine",
].map(name => ({ name, isVat: true }));

export function seedCategoryVat(name: string): boolean {
  const category = SEED_CATEGORIES.find(category => category.name === name);
  if (!category) throw new Error(`Missing seed category: ${name}`);
  return category.isVat;
}

export function seedSellingPrice(initialPrice: number, categoryName: string): number {
  const initialCents = Math.round(initialPrice * 100);
  const rate = seedCategoryVat(categoryName) ? 112 : 100;
  return Math.floor((initialCents * rate + 50) / 100) / 100;
}
