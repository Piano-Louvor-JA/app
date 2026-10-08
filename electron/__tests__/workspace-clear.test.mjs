// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	rmSync: vi.fn(),
	resetWorkspaceDirectories: vi.fn(),
	ensureWorkspaceDirectories: vi.fn(),
	getWorkspacePaths: vi.fn(() => ({
		root: "/workspace",
		sysdata: "/workspace/.sysdata",
		media: "/workspace/Media",
		covers: "/workspace/Media/covers",
		music: "/workspace/Media/music",
		images: "/workspace/Media/images",
		tempDatabase: "/workspace/database.db",
		downloadCompleteFlag: "/workspace/.download-complete",
	})),
}));

vi.mock("node:fs", () => ({
	existsSync: mocks.existsSync,
	mkdirSync: vi.fn(),
	unlinkSync: vi.fn(),
	rmSync: mocks.rmSync,
	writeFileSync: mocks.writeFileSync,
	readFileSync: mocks.readFileSync,
	statSync: vi.fn(),
}));

vi.mock("electron", () => ({ net: { request: vi.fn() } }));
vi.mock("basic-ftp", () => ({ Client: class Client {} }));
vi.mock("../crypto.mjs", () => ({ obfuscateText: vi.fn(), revealText: vi.fn() }));
vi.mock("../ftp.mjs", () => ({ getFtpParams: vi.fn() }));
vi.mock("../catalog-extractor.mjs", () => ({ CatalogExtractor: class CatalogExtractor {} }));
vi.mock("../paths.mjs", () => ({
	ensureWorkspaceDirectories: mocks.ensureWorkspaceDirectories,
	getWorkspacePaths: mocks.getWorkspacePaths,
	resetWorkspaceDirectories: mocks.resetWorkspaceDirectories,
	resolveMediaDirectory: vi.fn(),
}));

import { clearWorkspaceData } from "../workspace.mjs";

describe("clearWorkspaceData", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.readFileSync.mockReturnValue("registro-eula-ofuscado");
	});

	it("preserva eula.bin ao recriar o workspace", () => {
		mocks.existsSync.mockImplementation((filePath) => String(filePath).endsWith("/eula.bin"));

		expect(clearWorkspaceData()).toBe(true);
		expect(mocks.readFileSync).toHaveBeenCalledWith("/workspace/.sysdata/eula.bin", "utf8");
		expect(mocks.resetWorkspaceDirectories).toHaveBeenCalledOnce();
		expect(mocks.writeFileSync).toHaveBeenCalledWith(
			"/workspace/.sysdata/eula.bin",
			"registro-eula-ofuscado",
			"utf8",
		);
		expect(mocks.resetWorkspaceDirectories.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.writeFileSync.mock.invocationCallOrder[0],
		);
	});

	it("não cria registro legal quando ainda não existe", () => {
		mocks.existsSync.mockReturnValue(false);

		expect(clearWorkspaceData()).toBe(true);
		expect(mocks.resetWorkspaceDirectories).toHaveBeenCalledOnce();
		expect(mocks.writeFileSync).not.toHaveBeenCalled();
	});

	it("com preserveMedia limpa só sysdata e mantém Media", () => {
		mocks.existsSync.mockImplementation((filePath) => String(filePath).endsWith("/.sysdata"));

		expect(clearWorkspaceData({ preserveMedia: true })).toBe(true);
		expect(mocks.resetWorkspaceDirectories).not.toHaveBeenCalled();
		expect(mocks.rmSync).toHaveBeenCalledWith("/workspace/.sysdata", {
			recursive: true,
			force: true,
		});
		expect(mocks.ensureWorkspaceDirectories).toHaveBeenCalledOnce();
	});
});
