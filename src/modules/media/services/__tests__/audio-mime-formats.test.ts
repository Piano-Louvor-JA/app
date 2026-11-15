import { describe, expect, it } from "vitest";

import {
  audioMimeFromBase64,
  audioMimeFromBytes,
} from "@modules/media/services/custom-catalog";

/**
 * SPEC-audio-removal v1.2.0 (RF-05): magic bytes offline reconhece os 6
 * formatos da allowlist (mp3/ogg/m4a/wav/flac/aac) — paridade com o online.
 */

const b64 = (bytes: number[]): string =>
  btoa(String.fromCharCode(...bytes));

describe("audioMimeFromBase64/Bytes — allowlist 6 formatos", () => {
  it("wav (RIFF)", () => {
    expect(audioMimeFromBase64(b64([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]))).toBe(
      "audio/wav",
    );
  });

  it("ogg (OggS)", () => {
    expect(audioMimeFromBase64(b64([0x4f, 0x67, 0x67, 0x53, 0x00]))).toBe(
      "audio/ogg",
    );
  });

  it("flac (fLaC)", () => {
    expect(audioMimeFromBase64(b64([0x66, 0x4c, 0x61, 0x43, 0x00]))).toBe(
      "audio/flac",
    );
  });

  it("mp3 ID3", () => {
    expect(audioMimeFromBase64(b64([0x49, 0x44, 0x33, 0x03, 0x00]))).toBe(
      "audio/mpeg",
    );
  });

  it("aac ADTS (0xFF 0xFx)", () => {
    expect(audioMimeFromBase64(b64([0xff, 0xf1, 0x50, 0x80]))).toBe("audio/aac");
  });

  it("m4a ftypM4A", () => {
    expect(
      audioMimeFromBase64(
        b64([
          0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41,
          0x20,
        ]),
      ),
    ).toBe("audio/mp4");
  });

  it("m4a ftypisom (mp4 genérico com áudio)", () => {
    expect(
      audioMimeFromBase64(
        b64([
          0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f,
          0x6d,
        ]),
      ),
    ).toBe("audio/mp4");
  });

  it("bytes API: mesmos resultados", () => {
    expect(audioMimeFromBytes(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(
      "audio/flac",
    );
    expect(audioMimeFromBytes(new Uint8Array([0xff, 0xf9]))).toBe("audio/aac");
    expect(
      audioMimeFromBytes(
        new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
      ),
    ).toBe("audio/mp4");
  });

  it("desconhecido cai em audio/mpeg (legacy)", () => {
    expect(audioMimeFromBase64(b64([0x00, 0x01, 0x02]))).toBe("audio/mpeg");
  });
});
