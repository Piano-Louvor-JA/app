import { beforeEach, describe, expect, it } from "vitest";

import { setUserPreference } from "@shared/services/user-preferences";

import {
	loadHomeLocation,
	loadLastKnownHomeLocation,
	resolveReportedHomeLocation,
	saveHomeLocation,
} from "../home-preferences";

/**
 * Último distrito/igreja digitados: se o usuário apagar o campo, a
 * telemetria ainda envia o que ele já tinha informado (roundtrip real em
 * user_data, sem mock de storage).
 */
describe("home-preferences — último valor conhecido", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("sem nada digitado, não há valor para enviar", () => {
		expect(resolveReportedHomeLocation()).toEqual({ district: "", church: "" });
	});

	it("digitou e depois apagou: o campo fica vazio, mas o envio usa o valor guardado", () => {
		saveHomeLocation({ district: "Bertioga", church: "Rio da Praia" });
		saveHomeLocation({ district: "", church: "" });

		expect(loadHomeLocation()).toEqual({ district: "", church: "" });
		expect(loadLastKnownHomeLocation()).toEqual({ district: "Bertioga", church: "Rio da Praia" });
		expect(resolveReportedHomeLocation()).toEqual({ district: "Bertioga", church: "Rio da Praia" });
	});

	it("com o campo preenchido, vale o campo (inclusive depois de trocar o valor)", () => {
		saveHomeLocation({ district: "Bertioga", church: "Rio da Praia" });
		saveHomeLocation({ district: "Santos", church: "Rio da Praia" });
		expect(resolveReportedHomeLocation()).toEqual({ district: "Santos", church: "Rio da Praia" });

		saveHomeLocation({ district: "", church: "Rio da Praia" });
		expect(resolveReportedHomeLocation()).toEqual({ district: "Santos", church: "Rio da Praia" });
	});

	it("cada campo cai no seu próprio valor guardado", () => {
		saveHomeLocation({ district: "Bertioga", church: "" });
		saveHomeLocation({ district: "", church: "Centro" });
		expect(resolveReportedHomeLocation()).toEqual({ district: "Bertioga", church: "Centro" });
	});

	it("valor gravado antes desta versão (ou vindo do sync) também é guardado ao apagar", () => {
		setUserPreference("home.location", { district: "Distrito Antigo", church: "IASD Antiga" });
		saveHomeLocation({ district: "", church: "" });
		expect(resolveReportedHomeLocation()).toEqual({ district: "Distrito Antigo", church: "IASD Antiga" });
	});

	it("o valor guardado sobrevive a reload (fica em user_data)", () => {
		saveHomeLocation({ district: "Bertioga", church: "Rio da Praia" });
		saveHomeLocation({ district: "", church: "" });
		const stored = JSON.parse(localStorage.getItem("user_data") ?? "{}");
		expect(stored["home.locationLastKnown"]).toEqual({ district: "Bertioga", church: "Rio da Praia" });
	});
});
