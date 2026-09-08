/**
 * Cutting a stream of bytes into the messages it holds.
 *
 * Only what the emulator can act on is understood here: a message the splitter
 * cannot place is handed on whole so the device can report it as unrecognised
 * rather than letting it change the meaning of the bytes after it.
 */

export const NOTE_OFF = 0x80;
export const NOTE_ON = 0x90;
export const POLY_PRESSURE = 0xa0;
export const CONTROL_CHANGE = 0xb0;
export const PROGRAM_CHANGE = 0xc0;
export const CHANNEL_PRESSURE = 0xd0;
export const PITCH_BEND = 0xe0;
export const SYSTEM_START = 0xf0;

export type RawMessageKind = 'sysex' | 'channel' | 'system' | 'orphan';

export interface RawMessage {
  kind: RawMessageKind;
  bytes: number[];
  /** True when the stream ended before the message did. */
  truncated: boolean;
}

/** How many data bytes a channel status takes. */
function channelDataLength(status: number): number {
  const family = status & 0xf0;
  return family === PROGRAM_CHANGE || family === CHANNEL_PRESSURE ? 1 : 2;
}

/** How many data bytes a system-common status takes. */
function systemDataLength(status: number): number {
  if (status === 0xf2) return 2;
  if (status === 0xf1 || status === 0xf3) return 1;
  return 0;
}

/**
 * Split a byte buffer into messages.
 *
 * Running status is not supported: a data byte with no status in front of it
 * becomes an `orphan`, because guessing which status it belonged to would be
 * the emulator inventing a message that was never sent.
 */
export function splitMessages(bytes: number[]): RawMessage[] {
  const messages: RawMessage[] = [];
  let index = 0;
  while (index < bytes.length) {
    const status = bytes[index];
    if (status < 0x80) {
      const start = index;
      while (index < bytes.length && bytes[index] < 0x80) index += 1;
      messages.push({ kind: 'orphan', bytes: bytes.slice(start, index), truncated: false });
      continue;
    }
    if (status === SYSTEM_START) {
      let end = index + 1;
      while (end < bytes.length && bytes[end] !== 0xf7) end += 1;
      const truncated = end >= bytes.length;
      const stop = truncated ? bytes.length : end + 1;
      messages.push({ kind: 'sysex', bytes: bytes.slice(index, stop), truncated });
      index = stop;
      continue;
    }
    const length = status < 0xf0 ? channelDataLength(status) : systemDataLength(status);
    const stop = Math.min(index + 1 + length, bytes.length);
    messages.push({
      kind: status < 0xf0 ? 'channel' : 'system',
      bytes: bytes.slice(index, stop),
      truncated: stop - index < 1 + length,
    });
    index = stop;
  }
  return messages;
}
