import { describe, expect, it } from "vitest";
import { parseGmailMevMessage, sameMevCourt } from "./gmail-mev-message";

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

describe("Gmail MEV message", () => {
  const body = `Organismo: Tribunal de Trabajo Nº 1 Bahía Blanca\nCarátula: PERSONA A C/ EMPRESA B S/ DESPIDO\nNro de causa: 39656\nFecha: 01/10/2026 11:56:18\nDescripción: AGRÉGUESE Y TÉNGASE PRESENTE\nEstado: En Letra\nExpte. 39656.-`;
  it("lee una parte de texto y conserva el identificador de Gmail", () => {
    const result = parseGmailMevMessage({
      id: "synthetic-id",
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: "Mesa de Entradas Virtual <mev@scba.gov.ar>" },
          { name: "Subject", value: "Causa 39656" },
        ],
        parts: [{ mimeType: "text/plain", body: { data: encode(body) } }],
      },
    });
    expect(result?.preview.caseNumber).toBe("39656");
    expect(result?.gmailMessageId).toBe("synthetic-id");
  });
  it("lee tablas HTML y rechaza un remitente diferente", () => {
    const html = `<table><tr><td>Organismo:</td><td>Tribunal de Trabajo Nº 1 Bahía Blanca</td></tr><tr><td>Carátula:</td><td>PERSONA A C/ EMPRESA B S/ DESPIDO</td></tr><tr><td>Nro de causa:</td><td>39656</td></tr><tr><td>Fecha:</td><td>01/10/2026 11:56:18</td></tr><tr><td>Descripción:</td><td>AGRÉGUESE Y TÉNGASE PRESENTE</td></tr></table>`;
    const message = {
      id: "synthetic-html",
      payload: {
        mimeType: "text/html",
        headers: [{ name: "From", value: "mev@scba.gov.ar" }],
        body: { data: encode(html) },
      },
    };
    expect(parseGmailMevMessage(message)?.preview.caseNumber).toBe("39656");
    message.payload.headers[0]!.value = "other@example.com";
    expect(parseGmailMevMessage(message)).toBeNull();
  });
  it("exige tribunal coincidente y tolera el error de codificación observado", () => {
    expect(sameMevCourt("Tribunal de Trabajo Nº 1 Bahía Blanca", "Tribunal de Trabajo Nº 1 Bah¡a Blanca")).toBe(true);
    expect(sameMevCourt("Tribunal de Trabajo Nº 1 Bahía Blanca", "Tribunal de Trabajo Nº 2 Bahía Blanca")).toBe(false);
  });
});
