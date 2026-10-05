// Exact decimal arithmetic only. No legal formulas, indices or automatic procedural deadlines.
export function minorUnits(amount: string) {
  if (!/^-?\d{1,18}(?:\.\d{1,2})?$/.test(amount))
    throw Error("INVALID_DECIMAL_AMOUNT");
  const negative = amount.startsWith("-"),
    [whole, fraction = ""] = amount.replace("-", "").split(".");
  return (
    (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))) *
    (negative ? -1n : 1n)
  );
}
export function decimalAmount(units: bigint) {
  const absolute = units < 0n ? -units : units;
  return `${units < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function arithmeticScenario(amounts: string[], rateBasisPoints: number) {
  if (
    !Number.isSafeInteger(rateBasisPoints) ||
    rateBasisPoints < 0 ||
    rateBasisPoints > 100000
  )
    throw Error("INVALID_RATE");
  const total = amounts.reduce((sum, v) => sum + minorUnits(v), 0n),
    numerator = total * BigInt(rateBasisPoints),
    absolute = numerator < 0n ? -numerator : numerator;
  const rounded = ((absolute + 5000n) / 10000n) * (numerator < 0n ? -1n : 1n);
  return {
    total: decimalAmount(total),
    rateAmount: decimalAmount(rounded),
    ruleVersion: "arithmetic-v1",
    rounding: "nearest cent; ties away from zero",
    legalCalculationActive: false,
    source: "Aritmética sintética; porcentaje aportado por el usuario",
    inputs: { amounts, rateBasisPoints },
  };
}
