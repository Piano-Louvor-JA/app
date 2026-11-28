import { beforeEach, describe, expect, it } from "vitest";

import { BROWSER_STORAGE_KEYS } from "@shared/constants/storage-keys";
import {
  getUserPreference,
  loadUserPreferences,
  registerPrefsChangedHook,
  saveUserPreferences,
  setUserPreference,
} from "../user-preferences";

describe("user-preferences", () => {
  beforeEach(() => localStorage.clear());

  it("carrega vazio quando o storage devolve null ou valor null serializado", () => {
    expect(loadUserPreferences()).toEqual({});
    localStorage.setItem(BROWSER_STORAGE_KEYS.userPreferences, "null");
    expect(loadUserPreferences()).toEqual({});
  });

  it("salva e mescla preferências", () => {
    saveUserPreferences({ theme: "dark" });

    expect(setUserPreference("blur", true)).toEqual({
      theme: "dark",
      blur: true,
    });
    expect(localStorage.getItem(BROWSER_STORAGE_KEYS.userPreferences)).toBe(
      '{"theme":"dark","blur":true}',
    );
  });

  it("retorna valor tipado ou fallback para chave ausente", () => {
    saveUserPreferences({ zoom: 1.25 });

    expect(getUserPreference<number>("zoom")).toBe(1.25);
    expect(getUserPreference("missing", "padrão")).toBe("padrão");
  });

  it("suporta múltiplos hooks simultâneos: todos rodam na ordem de registro", () => {
    const calls: string[] = [];
    registerPrefsChangedHook((key) => calls.push(`a:${key}`));
    registerPrefsChangedHook((key) => calls.push(`b:${key}`));

    setUserPreference("language", "en-US");

    expect(calls).toEqual(["a:language", "b:language"]);
  });

  it("hook com erro não bloqueia os demais hooks nem o save", () => {
    const calls: string[] = [];
    registerPrefsChangedHook(() => {
      throw new Error("boom");
    });
    registerPrefsChangedHook((key) => calls.push(key));

    const saved = setUserPreference("language", "fr-FR");

    expect(calls).toEqual(["language"]);
    expect(saved.language).toBe("fr-FR");
    expect(getUserPreference<string>("language")).toBe("fr-FR");
  });
});
