import {
  runPhysicsBenchmarks,
} from "./physics-benchmarks.mjs";

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e5)) return value.toExponential(6);
  return value.toPrecision(8);
}

function formatCheck(check) {
  if (!("actual" in check)) return "";
  const parts = [
    `actual=${formatNumber(check.actual)}`,
    `expected=${formatNumber(check.expected)}`,
  ];
  if ("error" in check) parts.push(`error=${formatNumber(check.error)}`);
  if ("tolerance" in check) parts.push(`tol=${formatNumber(check.tolerance)} ${check.mode ?? "absolute"}`);
  return ` (${parts.join(", ")})`;
}

function printTextReport(result) {
  console.log("Physics benchmark suite");
  console.log(`Cases: ${result.totals.cases}; checks: ${result.totals.passedChecks}/${result.totals.checks} passed`);
  console.log("");

  for (const testCase of result.cases) {
    console.log(`${testCase.pass ? "PASS" : "FAIL"} ${testCase.name}`);
    for (const check of testCase.checks) {
      console.log(`  ${check.pass ? "PASS" : "FAIL"} ${check.name}${formatCheck(check)}`);
    }
  }

  if (!result.ok) {
    console.log("");
    console.log("Failed checks:");
    for (const check of result.failedChecks) {
      console.log(`  - ${check.name}${formatCheck(check)}`);
    }
  }
}

const asJson = process.argv.includes("--json");
const result = runPhysicsBenchmarks();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printTextReport(result);
}

if (!result.ok) process.exitCode = 1;
