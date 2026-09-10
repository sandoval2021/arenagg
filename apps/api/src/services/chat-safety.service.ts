export const CHAT_SAFETY_MESSAGE =
  'Por motivos de segurança, não é permitido compartilhar números de telefone, redes sociais externas ou dados financeiros no chat.';

const BLOCKED_KEYWORDS = ['whatsapp', 'wpp', 'telegram', 'pix', 'cpf'] as const;

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function violatesChatSafetyPolicy(value: string): boolean {
  const normalized = normalizeText(value);
  const compact = normalized.replace(/[^a-z0-9]/g, '');

  if (BLOCKED_KEYWORDS.some((keyword) => compact.includes(keyword))) return true;

  // Common external-contact shortcuts that may not contain the full brand name.
  if (/\b(?:wa\.me|t\.me|telegram\.me|api\.whatsapp\.com)\b/i.test(normalized)) return true;

  // 9+ digits even when users try to hide a phone/CPF with spaces, dots or symbols.
  if (/(?:\d[\s().+_\-/]*){9,}/.test(normalized)) return true;

  // Brazilian local phone style such as 9898-9898 (8 digits with formatting).
  if (/\b\d{4}[\s.\-]\d{4}\b/.test(normalized)) return true;

  // CPF with or without punctuation (explicit defense in depth).
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(normalized)) return true;

  // UUID / long random-token-shaped strings often used as PIX random keys.
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(normalized)) return true;
  if (/\b(?=[a-z0-9_-]{24,}\b)(?=[a-z0-9_-]*\d)(?=[a-z0-9_-]*[a-z])[a-z0-9_-]+\b/i.test(normalized)) return true;

  return false;
}
