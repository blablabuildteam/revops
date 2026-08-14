/**
 * Sanity checks for the 2026 tax model against figures published by the
 * Belastingdienst and KVK. Run with: npx tsx scripts/verify-dutch-tax.ts
 */
import {
  algemeneHeffingskorting,
  arbeidskorting,
  box1Tax,
  box2Tax,
  bvTax,
  findBvAdvantageRange,
  partnerIncomeTax,
  personalPartnerTax,
  vpbTax,
  zvwSelfEmployed,
} from "../src/lib/dutch-tax";

let failures = 0;

function near(label: string, actual: number, expected: number, tolerance = 1) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failures++;
  const status = ok ? "PASS" : "FAIL";
  console.log(
    `[${status}] ${label}: got ${actual.toFixed(2)}, expected ~${expected.toFixed(2)}`,
  );
}

console.log("\n--- Box 1 brackets ---");
near("tax at bracket 1 ceiling (38,883)", box1Tax(38_883), 38_883 * 0.3575);
near(
  "tax at bracket 2 ceiling (78,426)",
  box1Tax(78_426),
  38_883 * 0.3575 + (78_426 - 38_883) * 0.3756,
);
near(
  "tax at 100,000",
  box1Tax(100_000),
  38_883 * 0.3575 + (78_426 - 38_883) * 0.3756 + (100_000 - 78_426) * 0.495,
);

console.log("\n--- Tax credits ---");
near("AHK below phase-out", algemeneHeffingskorting(25_000), 3_115);
near("AHK is zero at top bracket", algemeneHeffingskorting(78_426), 0, 2);
near("arbeidskorting peaks at 45,592", arbeidskorting(45_592), 5_685);
near("arbeidskorting is zero at 132,920", arbeidskorting(132_920), 0);

console.log("\n--- Zvw ---");
near("Zvw on 38,237 taxable profit", zvwSelfEmployed(38_237), 1_854, 2);
near("Zvw is capped at 79,409", zvwSelfEmployed(150_000), 79_409 * 0.0485);

console.log("\n--- Entrepreneur with 45,000 profit ---");
// Reference: profit 45,000 -> taxable profit 38,237 after 1,200
// zelfstandigenaftrek and 12.7% mkb-winstvrijstelling.
const solo = partnerIncomeTax(45_000, { urencriterium: true });
near("taxable profit", solo.taxableProfit, 38_237, 2);
near("Zvw", solo.zvw, 1_854, 2);
console.log(
  `       income tax ${solo.incomeTax.toFixed(0)}, total due ${solo.totalDue.toFixed(0)}, ` +
    `effective ${(solo.effectiveRate * 100).toFixed(1)}%, marginal ${(solo.marginalRate * 100).toFixed(1)}%`,
);
if (solo.incomeTax < 5_000 || solo.incomeTax > 6_000) {
  failures++;
  console.log("[FAIL] income tax outside the expected 5,000-6,000 range");
} else {
  console.log("[PASS] income tax within the expected 5,000-6,000 range");
}

console.log("\n--- Deduction rate cap above the top bracket ---");
const high = partnerIncomeTax(120_000, { urencriterium: true });
if (high.deductionRateAdjustment <= 0) {
  failures++;
  console.log("[FAIL] expected a rate adjustment above 78,426");
} else {
  console.log(
    `[PASS] rate adjustment applied: ${high.deductionRateAdjustment.toFixed(0)}`,
  );
}
console.log(
  `       effective ${(high.effectiveRate * 100).toFixed(1)}%, marginal ${(high.marginalRate * 100).toFixed(1)}%`,
);

console.log("\n--- Corporate tax ---");
near("VPB at 200,000", vpbTax(200_000), 38_000);
near("VPB at 300,000", vpbTax(300_000), 38_000 + 100_000 * 0.258);
near("box 2 at threshold", box2Tax(68_843), 68_843 * 0.245);
near("box 2 above threshold", box2Tax(100_000), 68_843 * 0.245 + 31_157 * 0.31);

console.log("\n--- BV, two directors, full payout ---");
const bv = bvTax(200_000, { partners: 2, extraAnnualCost: 2_500 });
console.log(
  `       salaries ${bv.dgaSalaryTotal.toFixed(0)}, employer Zvw ${bv.employerZvw.toFixed(0)}, ` +
    `VPB base ${bv.vpbBase.toFixed(0)}, VPB ${bv.vpb.toFixed(0)}`,
);
console.log(
  `       net to partners ${bv.totalNet.toFixed(0)}, effective ${(bv.effectiveRate * 100).toFixed(1)}%`,
);
if (bv.dgaSalaryTotal !== 116_000) {
  failures++;
  console.log("[FAIL] expected 2 x 58,000 statutory salary");
} else {
  console.log("[PASS] statutory salary applied for both directors");
}

console.log("\n--- BV advantage band (2 partners, holding-style retain) ---");
for (const extraAnnualCost of [0, 2_500, 5_000]) {
  const range = findBvAdvantageRange({
    partners: 2,
    urencriterium: true,
    extraAnnualCost,
    payout: "salary_only",
  });
  const from = range.from === null ? "never" : `EUR ${range.from.toLocaleString("nl-NL")}`;
  const to = range.to === null ? "no upper bound" : `EUR ${range.to.toLocaleString("nl-NL")}`;
  console.log(
    `       extra BV cost ${extraAnnualCost}: BV wins from ${from} up to ${to} ` +
      `(peak +${range.peakAdvantage.toFixed(0)} at ${range.peakProfit.toLocaleString("nl-NL")})`,
  );
}

console.log("\n--- Profit sweep holding-style (retain after VPB) ---");
for (const profit of [
  80_000, 120_000, 160_000, 180_000, 200_000, 250_000, 300_000, 400_000, 500_000,
  600_000, 800_000, 1_000_000,
]) {
  const perPartner = partnerIncomeTax(profit / 2, { urencriterium: true });
  const vofNet = (profit / 2 - perPartner.totalDue) * 2;
  const bvScenario = bvTax(profit, {
    partners: 2,
    extraAnnualCost: 2_500,
    payout: "salary_only",
  });
  const delta = bvScenario.economicNet - vofNet;
  console.log(
    `       profit ${String(profit).padStart(7)}: VOF ${vofNet.toFixed(0).padStart(7)}, ` +
      `BV wealth ${bvScenario.economicNet.toFixed(0).padStart(7)} ` +
      `(cash ${bvScenario.totalNet.toFixed(0)} + retained ${bvScenario.retainedInBv.toFixed(0)}), ` +
      `diff ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`,
  );
}

console.log("\n--- Personal income stacks with VOF ---");
const stacked = personalPartnerTax(
  40_000,
  {
    salary: 12_000,
    ww: 2_900 * 8,
    other: 3_000,
    withheld: 8_000,
    provisionalPaid: 2_000,
  },
  { urencriterium: true },
);
console.log(
  `       box1 ${stacked.taxableBox1.toFixed(0)}, IB ${stacked.incomeTax.toFixed(0)}, ` +
    `Zvw ${stacked.zvw.toFixed(0)}, due ${stacked.totalDue.toFixed(0)}, ` +
    `still to reserve ${stacked.stillToReserve.toFixed(0)}`,
);
if (stacked.taxableBox1 <= stacked.taxableProfit) {
  failures++;
  console.log("[FAIL] taxable box 1 should include salary/WW/other on top of VOF");
} else {
  console.log("[PASS] taxable box 1 includes personal income");
}
if (stacked.stillToReserve !== Math.max(0, stacked.totalDue - 8_000 - 2_000)) {
  failures++;
  console.log("[FAIL] stillToReserve should subtract withholdings and VA");
} else {
  console.log("[PASS] stillToReserve = due − withheld − VA");
}
// WW must not inflate arbeidskorting base beyond salary+other+VOF taxable
const withoutWw = personalPartnerTax(
  40_000,
  { salary: 12_000, ww: 0, other: 3_000, withheld: 0, provisionalPaid: 0 },
  { urencriterium: true },
);
if (Math.abs(stacked.arbeidskorting - withoutWw.arbeidskorting) > 1) {
  failures++;
  console.log("[FAIL] WW should not change arbeidskorting");
} else {
  console.log("[PASS] WW excluded from arbeidskorting base");
}

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
