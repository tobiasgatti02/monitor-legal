import { describe, expect, it } from "vitest";
import { parseMevEmail } from "./mev-email";

const sample = `---------- Forwarded message ---------
De: Mesa de Entradas Virtual <mev@scba.gov.ar>
Date: vie, 2 oct 2026
Subject: Tribunal de Trabajo Nº 1 - Causa: 39656 - AGRÉGUESE
To: <estudio@example.com>

| **Organismo:** | Tribunal de Trabajo Nº 1 Bahía Blanca |
| **Carátula:** | PERSONA A C/ EMPRESA B S/ DESPIDO |
| **Nro de causa:** | 39656 |
| **Fecha:** | 01/10/2026 11:56:18 |
| **Descripción:** | AGRÉGUESE Y TÉNGASE PRESENTE |
| **Estado:** | En Letra |

Expte. 39656.-
Proveyendo los escritos, agréguese la constancia.
`;

describe("parseMevEmail", () => {
  it("extrae un aviso reenviado sin alterar la fecha de MEV", () => {
    expect(parseMevEmail(sample)).toMatchObject({
      court: "Tribunal de Trabajo Nº 1 Bahía Blanca",
      caseNumber: "39656",
      caseTitle: "PERSONA A C/ EMPRESA B S/ DESPIDO",
      description: "AGRÉGUESE Y TÉNGASE PRESENTE",
      status: "En Letra",
      sourceDate: "2026-10-01T11:56:18-03:00",
      title: "MEV · Causa 39656 · AGRÉGUESE Y TÉNGASE PRESENTE",
    });
  });

  it("no clasifica texto sin remitente declarado o con datos incompletos", () => {
    expect(parseMevEmail(sample.replace("mev@scba.gov.ar", "otro@example.com"))).toBeNull();
    expect(parseMevEmail(sample.replace("01/10/2026", "31/02/2026"))).toBeNull();
    expect(parseMevEmail(sample.replace("| **Nro de causa:** | 39656 |", ""))).toBeNull();
  });
});
