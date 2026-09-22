/**
 * Deterministic structural validation.
 *
 * Nothing in this file is AI. It is published check-digit arithmetic
 * (Verhoeff for Aadhaar, ICAO 9303 for passports) plus format grammar for
 * driving licences. A pass proves a number is well-formed — never that the
 * document or the holder is genuine.
 */

export type CheckItem = {
  check: string;
  label: string;
  passed: boolean | null;
  detail: string;
  kind: "deterministic" | "ai";
};

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Verhoeff checksum — the scheme UIDAI uses for the 12-digit Aadhaar number. */
export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split("").reverse();
  reversed.forEach((ch, i) => {
    const row = D[c];
    const permRow = P[i % 8];
    if (!row || !permRow) return;
    c = row[permRow[Number(ch)] ?? 0] ?? 0;
  });
  return c === 0;
}

/** ICAO 9303 check digit over an MRZ field (weights 7-3-1). */
export function icaoCheckDigit(field: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) {
    const ch = field[i] ?? "";
    let value: number;
    if (ch >= "0" && ch <= "9") value = Number(ch);
    else if (ch >= "A" && ch <= "Z") value = ch.charCodeAt(0) - 55;
    else value = 0; // '<' filler
    sum += value * (weights[i % 3] ?? 1);
  }
  return sum % 10;
}

export const icaoValid = (field: string, digit: string) =>
  /^\d$/.test(digit) && icaoCheckDigit(field) === Number(digit);

export function aadhaarChecks(fields: Record<string, string>): CheckItem[] {
  const raw = (fields["aadhaar_number"] ?? "").replace(/\D/g, "");
  if (!raw) {
    return [
      {
        check: "aadhaar_format",
        label: "Number readable",
        passed: null,
        detail: "No 12-digit sequence was read. Recapture with the number in frame.",
        kind: "deterministic",
      },
    ];
  }
  const first = raw[0] ?? "0";
  return [
    {
      check: "aadhaar_format",
      label: "12-digit format",
      passed: raw.length === 12,
      detail:
        raw.length === 12 ? "Twelve digits present." : `Read ${raw.length} digits, expected 12.`,
      kind: "deterministic",
    },
    {
      check: "aadhaar_leading_digit",
      label: "Issued range",
      passed: /[2-9]/.test(first),
      detail: /[2-9]/.test(first)
        ? "Leading digit is inside the issued range (2-9)."
        : "Aadhaar numbers never begin with 0 or 1.",
      kind: "deterministic",
    },
    {
      check: "aadhaar_verhoeff",
      label: "Verhoeff check digit",
      passed: raw.length === 12 && verhoeffValid(raw),
      detail:
        raw.length === 12 && verhoeffValid(raw)
          ? "Verhoeff checksum valid — the number is internally consistent."
          : "Verhoeff checksum failed — this number cannot have been issued as printed.",
      kind: "deterministic",
    },
  ];
}

export function passportChecks(fields: Record<string, string>): CheckItem[] {
  const line2 = fields["mrz_line2"] ?? "";
  if (line2.length < 28) {
    return [
      {
        check: "passport_mrz",
        label: "Machine-readable zone",
        passed: null,
        detail: "The MRZ strip was not readable. Recapture with the two bottom lines flat and lit.",
        kind: "deterministic",
      },
    ];
  }
  const number = line2.slice(0, 9);
  const numberCd = line2.slice(9, 10);
  const dob = line2.slice(13, 19);
  const dobCd = line2.slice(19, 20);
  const expiry = line2.slice(21, 27);
  const expiryCd = line2.slice(27, 28);
  const composite = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
  const compositeCd = line2.slice(43, 44);

  const items: CheckItem[] = [
    {
      check: "passport_number_cd",
      label: "Passport number check digit",
      passed: icaoValid(number, numberCd),
      detail: icaoValid(number, numberCd)
        ? "ICAO 9303 check digit matches the passport number."
        : "Passport number check digit does not match (ICAO 9303).",
      kind: "deterministic",
    },
    {
      check: "passport_dob_cd",
      label: "Date of birth check digit",
      passed: icaoValid(dob, dobCd),
      detail: icaoValid(dob, dobCd)
        ? "Date of birth is consistent with its check digit."
        : "Date of birth check digit does not match.",
      kind: "deterministic",
    },
    {
      check: "passport_expiry_cd",
      label: "Expiry check digit",
      passed: icaoValid(expiry, expiryCd),
      detail: icaoValid(expiry, expiryCd)
        ? "Expiry date is consistent with its check digit."
        : "Expiry check digit does not match.",
      kind: "deterministic",
    },
  ];

  if (compositeCd) {
    items.push({
      check: "passport_composite_cd",
      label: "Composite check digit",
      passed: icaoValid(composite, compositeCd),
      detail: icaoValid(composite, compositeCd)
        ? "Composite check digit over the whole MRZ matches."
        : "Composite check digit fails — at least one MRZ field is altered or misread.",
      kind: "deterministic",
    });
  }

  const expiryDate = mrzDate(expiry);
  if (expiryDate) {
    const live = expiryDate.getTime() > Date.now();
    items.push({
      check: "passport_expiry_window",
      label: "Validity window",
      passed: live,
      detail: live
        ? `Valid until ${expiryDate.toLocaleDateString()}.`
        : `Expired on ${expiryDate.toLocaleDateString()}.`,
      kind: "deterministic",
    });
  }

  const visualPassNo = fields["visual_passport_number"];
  if (visualPassNo) {
    const mrzNo = number.replace(/</g, "");
    const match = mrzNo === visualPassNo.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    items.push({
      check: "passport_mrz_vs_visual_number",
      label: "MRZ vs visual passport number",
      passed: match,
      detail: match
        ? "MRZ passport number matches the visual zone number."
        : `MRZ passport number (${mrzNo}) conflicts with visual zone (${visualPassNo}).`,
      kind: "deterministic",
    });
  }

  return items;
}

/**
 * Visa sticker (ICAO MRV-A / MRV-B machine-readable zone).
 * Same 7-3-1 arithmetic as a passport, but an MRV carries no composite digit.
 */
export function visaChecks(fields: Record<string, string>): CheckItem[] {
  const line2 = fields["mrz_line2"] ?? "";
  if (line2.length < 28) {
    return [
      {
        check: "visa_mrz",
        label: "Visa machine-readable zone",
        passed: null,
        detail:
          "The two MRZ lines on the visa sticker were not readable. Recapture them flat and lit.",
        kind: "deterministic",
      },
    ];
  }
  const number = line2.slice(0, 9);
  const numberCd = line2.slice(9, 10);
  const dob = line2.slice(13, 19);
  const dobCd = line2.slice(19, 20);
  const expiry = line2.slice(21, 27);
  const expiryCd = line2.slice(27, 28);

  const items: CheckItem[] = [
    {
      check: "visa_number_cd",
      label: "Visa number check digit",
      passed: icaoValid(number, numberCd),
      detail: icaoValid(number, numberCd)
        ? "ICAO 9303 check digit matches the visa document number."
        : "Visa number check digit does not match (ICAO 9303).",
      kind: "deterministic",
    },
    {
      check: "visa_dob_cd",
      label: "Date of birth check digit",
      passed: icaoValid(dob, dobCd),
      detail: icaoValid(dob, dobCd)
        ? "Date of birth is consistent with its check digit."
        : "Date of birth check digit does not match.",
      kind: "deterministic",
    },
    {
      check: "visa_expiry_cd",
      label: "Valid-until check digit",
      passed: icaoValid(expiry, expiryCd),
      detail: icaoValid(expiry, expiryCd)
        ? "Expiry date is consistent with its check digit."
        : "Expiry check digit does not match.",
      kind: "deterministic",
    },
  ];

  const expiryDate = mrzDate(expiry);
  if (expiryDate) {
    const live = expiryDate.getTime() > Date.now();
    items.push({
      check: "visa_expiry_window",
      label: "Visa still valid",
      passed: live,
      detail: live
        ? `Visa is valid until ${expiryDate.toLocaleDateString()}.`
        : `Visa expired on ${expiryDate.toLocaleDateString()} — overstay risk.`,
      kind: "deterministic",
    });
  }

  const holderType = (fields["mrz_line1"] ?? "").slice(0, 2);
  if (/^V/.test(holderType)) {
    items.push({
      check: "visa_mrz_type",
      label: "MRV document code",
      passed: true,
      detail: `Machine-readable visa header "${holderType}" recognised.`,
      kind: "deterministic",
    });
  }
  return items;
}

function mrzDate(yymmdd: string): Date | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy < 70 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, mm - 1, dd));
}

const STATE_CODES = new Set([
  "AN",
  "AP",
  "AR",
  "AS",
  "BR",
  "CH",
  "CG",
  "DD",
  "DL",
  "DN",
  "GA",
  "GJ",
  "HR",
  "HP",
  "JK",
  "JH",
  "KA",
  "KL",
  "LA",
  "LD",
  "MH",
  "ML",
  "MN",
  "MP",
  "MZ",
  "NL",
  "OD",
  "OR",
  "PB",
  "PY",
  "RJ",
  "SK",
  "TN",
  "TR",
  "TS",
  "UK",
  "UA",
  "UP",
  "WB",
]);

export function dlChecks(fields: Record<string, string>): CheckItem[] {
  const raw = (fields["dl_number"] ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!raw) {
    return [
      {
        check: "dl_format",
        label: "Licence number readable",
        passed: null,
        detail: "No licence number pattern was read from the capture.",
        kind: "deterministic",
      },
    ];
  }
  const state = raw.slice(0, 2);
  const rto = raw.slice(2, 4);
  const year = Number(raw.slice(4, 8));
  const nowYear = new Date().getFullYear();
  return [
    {
      check: "dl_format",
      label: "RTO number grammar",
      passed: /^[A-Z]{2}\d{2}(19|20)\d{2}\d{6,7}$/.test(raw),
      detail: /^[A-Z]{2}\d{2}(19|20)\d{2}\d{6,7}$/.test(raw)
        ? "Matches the SS RR YYYY NNNNNNN national grammar."
        : "Does not match the national SS RR YYYY NNNNNNN licence grammar.",
      kind: "deterministic",
    },
    {
      check: "dl_state_code",
      label: "State code",
      passed: STATE_CODES.has(state),
      detail: STATE_CODES.has(state)
        ? `State code ${state} is a valid issuing region.`
        : `${state || "??"} is not a recognised state code.`,
      kind: "deterministic",
    },
    {
      check: "dl_rto_code",
      label: "RTO office code",
      passed: /^\d{2}$/.test(rto) && Number(rto) > 0,
      detail:
        /^\d{2}$/.test(rto) && Number(rto) > 0
          ? `RTO office code ${rto} is well-formed.`
          : "RTO office code is missing or zero.",
      kind: "deterministic",
    },
    {
      check: "dl_issue_year",
      label: "Issue year plausibility",
      passed: Number.isFinite(year) && year >= 1950 && year <= nowYear,
      detail:
        Number.isFinite(year) && year >= 1950 && year <= nowYear
          ? `Issue year ${year} is plausible.`
          : "Issue year is outside the plausible range.",
      kind: "deterministic",
    },
  ];
}

export function consistencyChecks(fields: Record<string, string>): CheckItem[] {
  const items: CheckItem[] = [];

  const dobStr = fields["dob"] || fields["date_of_birth"];
  const issueStr = fields["issue_date"] || fields["date_of_issue"];
  const expiryStr = fields["expiry_date"] || fields["date_of_expiry"] || fields["valid_until"];

  const parseDate = (d?: string): Date | null => {
    if (!d) return null;
    const match = d.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
    if (match && match[1] && match[2] && match[3]) {
      return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    }
    const isoMatch = d.match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
    if (isoMatch && isoMatch[1] && isoMatch[2] && isoMatch[3]) {
      return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
    }
    return null;
  };

  const dob = parseDate(dobStr);
  const issue = parseDate(issueStr);
  const expiry = parseDate(expiryStr);

  if (dob && issue) {
    const valid = dob.getTime() < issue.getTime();
    items.push({
      check: "consistency_dob_vs_issue",
      label: "Date of birth vs issue date",
      passed: valid,
      detail: valid
        ? "Date of birth precedes issue date."
        : "Date of birth cannot be after issue date.",
      kind: "deterministic",
    });
  }

  if (issue && expiry) {
    const valid = issue.getTime() < expiry.getTime();
    items.push({
      check: "consistency_issue_vs_expiry",
      label: "Issue date vs expiry date",
      passed: valid,
      detail: valid
        ? "Issue date precedes expiry date."
        : "Expiry date precedes or matches issue date.",
      kind: "deterministic",
    });
  }

  if (dob && expiry) {
    const valid = dob.getTime() < expiry.getTime();
    items.push({
      check: "consistency_dob_vs_expiry",
      label: "Date of birth vs expiry date",
      passed: valid,
      detail: valid
        ? "Date of birth precedes expiry date."
        : "Date of birth cannot be after or on expiry date.",
      kind: "deterministic",
    });
  }

  return items;
}

export const DISCLAIMER =
  "Structural validation is deterministic arithmetic, not AI. A pass means the number is well-formed; it does not prove the document is genuine. The officer remains the decision-maker.";
