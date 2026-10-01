// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  classoCandidatePaths,
  looksLikeClassoInstall,
  scanClassoMedia,
  findClassoDataFiles,
  detectClassoInstallation,
} from "../classo-detect.mjs";

/**
 * IO falso: recebe árvore declarativa ANINHADA rooted em "/" e achata em
 * lookup por path completo. Cada nó: { dirs: {nome: nó}, files: {nome: size} }.
 */
function fakeIo(def) {
  /** @type {Map<string, { dirs: string[], files: Record<string, number> }>} */
  const flat = new Map();
  const register = (path, node) => {
    if (!flat.has(path)) flat.set(path, { dirs: [], files: {} });
    const entry = flat.get(path);
    for (const [name, sub] of Object.entries(node.dirs ?? {})) {
      entry.dirs.push(name);
      const child = path === "/" ? "/" + name : path + "/" + name;
      register(child, sub);
    }
    Object.assign(entry.files, node.files ?? {});
  };
  // def: { <segmento>: { dirs, files } } — cada chave de 1º nível é um
  // diretório filho de "/" (formato mais legível que dirs aninhados no root).
  register("/", { dirs: def, files: {} });

  const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  const splitPath = (p) => {
    const idx = p.lastIndexOf("/");
    return [p.slice(0, idx) || "/", p.slice(idx + 1)];
  };

  const exists = (p) => {
    const [dir, file] = splitPath(norm(p));
    const node = flat.get(dir);
    return Boolean(node && (file === undefined || file in node.files));
  };
  const readdir = (p) => {
    const node = flat.get(norm(p));
    if (!node) throw new Error("ENOENT");
    return [...node.dirs, ...Object.keys(node.files)];
  };
  const stat = (p) => {
    const [dir, file] = splitPath(norm(p));
    const node = flat.get(dir);
    if (!node) throw new Error("ENOENT");
    if (file === undefined) return { isDirectory: () => true, size: 0 };
    if (node.dirs.includes(file)) return { isDirectory: () => true, size: 0 };
    if (!(file in node.files)) throw new Error("ENOENT");
    return { isDirectory: () => false, size: node.files[file] };
  };
  const join = (...parts) => {
    const [head, ...rest] = parts;
    if (rest.length === 0) return head;
    return head.replace(/\/$/, "") + "/" + rest.join("/");
  };
  return { exists, readdir, stat, join };
}

/** Instalação Classo de exemplo: /c/LouvorJA com Media e dados. */
function classoDef() {
  return {
    c: {
      dirs: {
        LouvorJA: {
          dirs: {
            Media: {
              dirs: {
                "1992 - Brilha Jesus": {
                  dirs: {},
                  files: { "01.mp3": 1000, "02.mp3": 2000 },
                },
                "1994 - brilha jesus ao vivo": {
                  dirs: {},
                  files: { "01.mp3": 500 },
                },
              },
              files: { "capa.jpg": 10 },
            },
          },
          files: {
            "configPT.ja": 5000,
            "liturgia.ja": 300,
            "itensAgendados.xml": 200,
          },
        },
      },
      files: {},
    },
  };
}

describe("classoCandidatePaths", () => {
  it("lista paths padrão do Windows (win32.join determinístico)", () => {
    const paths = classoCandidatePaths();
    expect(paths).toContain("C:\\LouvorJA");
    expect(paths).toContain("C:\\Program Files\\LouvorJA");
    expect(paths).toContain("C:\\Program Files (x86)\\LouvorJA");
  });

  it("inclui LOCALAPPDATA quando informado", () => {
    const paths = classoCandidatePaths({ localAppData: "C:\\Users\\j\\AppData\\Local" });
    expect(paths).toContain("C:\\Users\\j\\AppData\\Local\\LouvorJA");
  });
});

describe("looksLikeClassoInstall", () => {
  it("confirma com configPT.ja presente", () => {
    const io = fakeIo(classoDef());
    expect(looksLikeClassoInstall("/c/LouvorJA", io.exists)).toBe(true);
  });

  it("não confirma sem configPT.ja", () => {
    const io = fakeIo({ c: { dirs: { LouvorJA: { dirs: {}, files: {} } }, files: {} } });
    expect(looksLikeClassoInstall("/c/LouvorJA", io.exists)).toBe(false);
  });
});

describe("scanClassoMedia", () => {
  it("agrupa MP3s por pasta-álbum e soma bytes", () => {
    const io = fakeIo(classoDef());
    const { albums, totalBytes } = scanClassoMedia("/c/LouvorJA", io);
    expect(albums).toHaveLength(2);
    const brilha = albums.find((a) => a.name === "1992 - Brilha Jesus");
    expect(brilha.files).toHaveLength(2);
    expect(brilha.bytes).toBe(3000);
    expect(totalBytes).toBe(3500);
  });

  it("ignora não-áudio (capa.jpg não vira arquivo de álbum)", () => {
    const io = fakeIo(classoDef());
    const { albums } = scanClassoMedia("/c/LouvorJA", io);
    expect(albums.every((a) => a.files.every((f) => f.endsWith(".mp3")))).toBe(true);
  });

  it("diretório vazio retorna vazio sem lançar", () => {
    const io = fakeIo({ c: { dirs: { LouvorJA: { dirs: {}, files: {} } }, files: {} } });
    const { albums, totalBytes } = scanClassoMedia("/c/LouvorJA", io);
    expect(albums).toEqual([]);
    expect(totalBytes).toBe(0);
  });

  it("respeita profundidade máxima (depth > 2 não desce)", () => {
    const io = fakeIo({
      c: {
        dirs: {
          LouvorJA: {
            dirs: { a: { dirs: { b: { dirs: { c: { dirs: { d: { dirs: {}, files: { "x.mp3": 1 } } }, files: {} } }, files: {} } }, files: {} } },
            files: {},
          },
        },
        files: {},
      },
    });
    // d está a 4 níveis do root — fora do limite do walk (depth>2)
    const { totalBytes } = scanClassoMedia("/c/LouvorJA", io);
    expect(totalBytes).toBe(0);
  });
});

describe("findClassoDataFiles", () => {
  it("acha liturgia.ja e XMLs quando existem", () => {
    const io = fakeIo(classoDef());
    const data = findClassoDataFiles("/c/LouvorJA", io);
    expect(data.liturgiaJa).toBe("/c/LouvorJA/liturgia.ja");
    expect(data.itensAgendados).toBe("/c/LouvorJA/itensAgendados.xml");
    expect(data.configPt).toBe("/c/LouvorJA/configPT.ja");
  });

  it("retorna null para arquivos ausentes", () => {
    const io = fakeIo({ c: { dirs: { LouvorJA: { dirs: {}, files: { "configPT.ja": 1 } } }, files: {} } });
    const data = findClassoDataFiles("/c/LouvorJA", io);
    expect(data.liturgiaJa).toBeNull();
    expect(data.itensAgendados).toBeNull();
  });
});

describe("detectClassoInstallation", () => {
  it("encontra via registry (maior prioridade)", () => {
    const io = fakeIo(classoDef());
    const result = detectClassoInstallation({
      exists: io.exists,
      io,
      registryProbe: () => "/c/LouvorJA",
    });
    expect(result.found).toBe(true);
    expect(result.root).toBe("/c/LouvorJA");
    expect(result.media.albums).toHaveLength(2);
    expect(result.dataFiles.liturgiaJa).not.toBeNull();
  });

  it("encontra por path padrão sem registry (candidatos mapeados no fake)", () => {
    // fake usa /c/LouvorJA; mapeamos candidatos pra esse mundo de teste:
    const io = fakeIo(classoDef());
    const result = detectClassoInstallation({
      exists: (p) => io.exists(p.replace("C:\\LouvorJA", "/c/LouvorJA")),
      io,
      classoCandidates: ["/c/LouvorJA"],
    });
    expect(result.found).toBe(true);
    expect(result.root).toBe("/c/LouvorJA");
    expect(result.media.albums).toHaveLength(2);
  });

  it("registry apontando pra instalação inexistente cai pro candidato", () => {
    const io = fakeIo(classoDef());
    const result = detectClassoInstallation({
      exists: io.exists,
      io,
      registryProbe: () => "/c/nao-existe",
      classoCandidates: ["/c/LouvorJA"],
    });
    expect(result.found).toBe(true);
    expect(result.root).toBe("/c/LouvorJA");
  });

  it("nada encontrado: found=false e estrutura vazia", () => {
    const io = fakeIo({ c: { dirs: {}, files: {} } });
    const result = detectClassoInstallation({
      exists: io.exists,
      io,
      registryProbe: () => null,
      classoCandidates: ["/c/LouvorJA"],
    });
    expect(result.found).toBe(false);
    expect(result.media.albums).toEqual([]);
    expect(result.dataFiles).toBeNull();
  });
});
