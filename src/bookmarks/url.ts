/** Encode data characters without encoding existing escapes or URL delimiters twice. */
export function escapedUrl(url: string): string {
  return url.replace(/%(?![\da-f]{2})|[^\x21-\x7e]|["<>\\^`{|}]/giu, (character) => encodeURIComponent(character));
}

type UrlPart = { text: string; encoded: string };

function urlParts(url: string, normalizeLineEndings = false): UrlPart[] {
  const parts: UrlPart[] = [];
  for (let index = 0; index < url.length;) {
    const byte = /^%([\da-f]{2})/i.exec(url.slice(index));
    if (byte) {
      const value = parseInt(byte[1], 16);
      const count = value < 0x80 ? 1 : value >= 0xc2 && value <= 0xdf ? 2 : value <= 0xef ? 3 : 4;
      const encoded = url.slice(index, index + count * 3);
      try {
        const text = decodeURIComponent(encoded);
        parts.push({ text, encoded });
        index += encoded.length;
        continue;
      } catch { /* Keep malformed escapes editable. */ }
    }
    const text = String.fromCodePoint(url.codePointAt(index)!);
    parts.push({ text, encoded: text });
    index += text.length;
  }
  if (!normalizeLineEndings) return parts;
  // Textarea values normalize CR and CRLF to LF; keep their original encoded sources.
  const normalized: UrlPart[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part.text !== '\r') { normalized.push(part); continue; }
    let encoded = part.encoded;
    if (parts[index + 1]?.text === '\n') encoded += parts[++index].encoded;
    normalized.push({ text: '\n', encoded });
  }
  return normalized;
}

export function readableUrl(url: string, normalizeLineEndings = false): string {
  return urlParts(url, normalizeLineEndings).map(({ text }) => text).join('');
}

/** Keep the meaning of untouched escapes, including escaped URL delimiters, during editing. */
export function editUrl(encoded: string, text: string, escaped: boolean, normalizeLineEndings = false): string {
  if (escaped) return escapedUrl(text);
  const parts = urlParts(encoded, normalizeLineEndings);
  const next = [...text];
  let start = 0;
  while (start < parts.length && start < next.length && parts[start].text === next[start]) start++;
  let end = parts.length;
  let nextEnd = next.length;
  while (end > start && nextEnd > start && parts[end - 1].text === next[nextEnd - 1]) { end--; nextEnd--; }
  // A percent sign entered in decoded mode is data, rather than a new escape sequence.
  const inserted = next.slice(start, nextEnd).join('').replaceAll('%', '%25');
  return parts.slice(0, start).map(({ encoded }) => encoded).join('')
    + escapedUrl(inserted)
    + parts.slice(end).map(({ encoded }) => encoded).join('');
}

export function encodedUrlSelection(encoded: string, start: number, end: number, escaped: boolean, normalizeLineEndings = false): string {
  if (escaped) return encoded.slice(start, end);
  let offset = 0;
  return urlParts(encoded, normalizeLineEndings).map((part) => {
    const from = offset;
    offset += part.text.length;
    return offset > start && from < end ? part.encoded : '';
  }).join('');
}

/** Preserve encoded addresses when copying a selection containing URL text from the lists. */
export function copyUrlSelection(event: ClipboardEvent): void {
  if (event.defaultPrevented || document.activeElement?.matches('input, textarea')) return;
  const selection = window.getSelection();
  if (!event.clipboardData || !selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const sources = [...document.querySelectorAll<HTMLElement>('[data-url-encoded]')].filter((node) => range.intersectsNode(node));
  if (!sources.length) return;
  const fragment = range.cloneContents();
  const ancestor = range.commonAncestorContainer;
  const containing = sources.find((node) => node.contains(ancestor));
  const copies = containing ? [] : [...fragment.querySelectorAll<HTMLElement>('[data-url-encoded]')];
  for (const [index, source] of sources.entries()) {
    const before = document.createRange();
    before.selectNodeContents(source);
    let start = 0;
    let end = source.textContent?.length ?? 0;
    if (source.contains(range.startContainer)) {
      before.setEnd(range.startContainer, range.startOffset);
      start = before.toString().length;
    }
    if (source.contains(range.endContainer)) {
      before.setEnd(range.endContainer, range.endOffset);
      end = before.toString().length;
    }
    const text = encodedUrlSelection(source.dataset.urlEncoded!, start, end, source.dataset.urlEscaped === 'true');
    if (containing) {
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
      return;
    }
    if (copies[index]) copies[index].textContent = text;
  }
  event.clipboardData.setData('text/plain', fragment.textContent ?? '');
  event.preventDefault();
}
