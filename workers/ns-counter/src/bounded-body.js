
// Also bound chunked upstream responses and POST bodies without Content-Length.
export class BodyTooLarge extends Error {}

export async function boundedText(message, maxBytes) {
  if (Number(message.headers.get('Content-Length')) > maxBytes) {
    await message.body?.cancel();
    throw new BodyTooLarge('Body exceeds byte limit');
  }
  const reader = message.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BodyTooLarge('Body exceeds byte limit');
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}
