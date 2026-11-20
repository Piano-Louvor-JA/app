import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// piano-unified-auth T2 — authTokenAsync(): ID token FRESCO do Firebase SDK
// quando usuário Google ativo; fallback localStorage (token opaco legacy).
// SPEC piano-unified-auth v1.0.0 RF-03 (vault 9c85b1e)

const { getIdTokenMock, authMock } = vi.hoisted(() => ({
  getIdTokenMock: vi.fn(),
  authMock: { currentUser: null as unknown },
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => authMock),
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
}));
vi.mock("@shared/services/api-env", () => ({ defaultApiOrigin: () => "" }));

import { authTokenAsync } from "../auth-client";

describe("authTokenAsync (unified RF-03)", () => {
  beforeEach(() => {
    localStorage.clear();
    getIdTokenMock.mockReset();
    authMock.currentUser = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it("A: Firebase user ativo → getIdToken() fresco (mesmo com sessão local)", async () => {
    authMock.currentUser = { getIdToken: getIdTokenMock };
    getIdTokenMock.mockResolvedValueOnce("firebase-jwt-fresco");
    localStorage.setItem(
      "louvorja.custom.auth",
      JSON.stringify({ token: "opaco-velho", user: { id_user: 1, email: "a@a", displayName: "A" } }),
    );

    expect(await authTokenAsync()).toBe("firebase-jwt-fresco");
  });

  it("B: sem Firebase user, sessão local opaca → token do localStorage", async () => {
    authMock.currentUser = null;
    localStorage.setItem(
      "louvorja.custom.auth",
      JSON.stringify({ token: "opaco-legacy", user: { id_user: 2, email: "b@b", displayName: "B" } }),
    );

    expect(await authTokenAsync()).toBe("opaco-legacy");
  });

  it("C: sem Firebase user e sem sessão → null", async () => {
    authMock.currentUser = null;

    expect(await authTokenAsync()).toBeNull();
  });

  it("D: Firebase user mas getIdToken falha → fallback sessão local (não explode)", async () => {
    authMock.currentUser = { getIdToken: getIdTokenMock };
    getIdTokenMock.mockRejectedValueOnce(new Error("rede"));
    localStorage.setItem(
      "louvorja.custom.auth",
      JSON.stringify({ token: "opaco-fallback", user: { id_user: 3, email: "c@c", displayName: "C" } }),
    );

    expect(await authTokenAsync()).toBe("opaco-fallback");
  });
});
