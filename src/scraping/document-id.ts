// Opaco de propósito: o cliente (LLM/consumidor da API) não deve depender do formato,
// só recebê-lo de um resultado de busca e devolvê-lo para get_document/getDocument.
const SEPARATOR = '::';

export function encodeDocumentId(category: string, link: string): string {
  return Buffer.from(`${category}${SEPARATOR}${link}`, 'utf-8').toString('base64url');
}

export function decodeDocumentId(id: string): { category: string; link: string } {
  const decoded = Buffer.from(id, 'base64url').toString('utf-8');
  const sepIndex = decoded.indexOf(SEPARATOR);
  if (sepIndex === -1) {
    throw new Error('ID de documento inválido');
  }
  const category = decoded.slice(0, sepIndex);
  const link = decoded.slice(sepIndex + SEPARATOR.length);
  if (!category || !link) {
    throw new Error('ID de documento inválido');
  }
  return { category, link };
}
