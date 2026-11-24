export interface PaymentData {
  isPaid?: boolean;
  amount?: number | null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function countOf(text: string, char: string): number {
  return text.split(char).length - 1;
}

export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? roundMoney(value) : null;
  }

  if (typeof value !== 'string') return null;

  const text = value.replace(/[^\d.,]/g, '');
  if (!/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let normalized = text;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = text.split(thousandSeparator).join('').replace(decimalSeparator, '.');
  } else if (lastComma >= 0) {
    normalized = countOf(text, ',') > 1 ? text.split(',').join('') : text.replace(',', '.');
  } else if (lastDot >= 0 && countOf(text, '.') > 1) {
    normalized = text.split('.').join('');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : null;
}

export function parseIsPaid(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }

  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1') return true;
    if (text === 'false' || text === '0') return false;
  }

  return undefined;
}

export function buildPaymentData(body: unknown): PaymentData {
  const data: PaymentData = {};
  if (!body || typeof body !== 'object') return data;

  const source = body as Record<string, unknown>;

  if ('isPaid' in source) {
    const isPaid = parseIsPaid(source.isPaid);
    if (isPaid !== undefined) data.isPaid = isPaid;
  }

  if ('amount' in source) {
    data.amount = parseAmount(source.amount);
  }

  return data;
}
