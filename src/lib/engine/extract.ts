/** Field extraction from recognised text. Pure string work, runs on device. */

export type DocumentType = "aadhaar" | "passport" | "visa" | "dl";

const NOISE = new Set([
  "GOVERNMENT",
  "INDIA",
  "UNIQUE",
  "IDENTIFICATION",
  "AUTHORITY",
  "AADHAAR",
  "MERA",
  "MERI",
  "PEHCHAN",
  "REPUBLIC",
  "PASSPORT",
  "DRIVING",
  "LICENCE",
  "LICENSE",
  "TRANSPORT",
  "DEPARTMENT",
  "UNION",
  "DOB",
  "YOB",
  "MALE",
  "FEMALE",
  "PHOTO",
  "SIGNATURE",
  "ADDRESS",
  "TYPE",
  "CODE",
  "SURNAME",
  "GIVEN",
  "NAMES",
  "NATIONALITY",
  "SEX",
  "DATE",
  "BIRTH",
  "ISSUE",
  "EXPIRY",
  "VALID",
]);

const cleanLine = (line: string) =>
  line
    .replace(/[^A-Za-z .'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function guessName(lines: string[]): string | undefined {
  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (cleaned.length < 5 || cleaned.length > 40) continue;
    const words = cleaned.split(" ").filter((w) => w.length > 1);
    if (words.length < 2 || words.length > 4) continue;
    if (words.some((w) => NOISE.has(w.toUpperCase()))) continue;
    if (!words.every((w) => /^[A-Za-z.'-]+$/.test(w))) continue;
    return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  return undefined;
}

const DIGIT_ALTS: Record<string, string[]> = {
  O: ["0"],
  Q: ["0"],
  D: ["0"],
  I: ["1"],
  L: ["1"],
  Z: ["2"],
  S: ["5"],
  B: ["8"],
  G: ["6", "9"],
};

/** Normalise an MRZ line to the 44-char TD3 alphabet. */
function normaliseMrz(line: string) {
  return line
    .toUpperCase()
    .replace(/[«»~—–_\s]/g, "<")
    .replace(/[^A-Z0-9<]/g, "<")
    .padEnd(44, "<")
    .slice(0, 44);
}

function mrzLines(lines: string[]): { l1?: string | undefined; l2?: string | undefined } {
  const candidates = lines.map(normaliseMrz).filter((l) => (l.match(/</g) ?? []).length >= 4);
  const l1 = candidates.find((l) => /^[PV][<A-Z]/.test(l));
  const l2 =
    candidates.find((l) => l !== l1 && /^[A-Z0-9<]{9}\d/.test(l)) ??
    candidates.find((l) => l !== l1);
  return { l1, l2 };
}

export function extractFields(type: DocumentType, text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const fields: Record<string, string> = {};
  const repairs: string[] = [];

  const name = guessName(lines);
  if (name) fields["name"] = name;

  const dob = text.match(/\b(\d{2})[/\-.](\d{2})[/\-.](\d{4})\b/);
  if (dob) fields["date_of_birth"] = `${dob[1]}/${dob[2]}/${dob[3]}`;

  const gender = text.match(/\b(male|female|transgender)\b/i);
  if (gender) fields["gender"] = (gender[1] ?? "").replace(/^./, (c) => c.toUpperCase());

  if (type === "aadhaar") {
    const num = text.match(/\b(\d{4})\s?(\d{4})\s?(\d{4})\b/);
    if (num) fields["aadhaar_number"] = `${num[1]}${num[2]}${num[3]}`;
  }

  if (type === "dl") {
    const dl = text
      .toUpperCase()
      .replace(/\s|-/g, "")
      .match(/\b([A-Z]{2}\d{2}(?:19|20)\d{2}\d{6,7})\b/);
    if (dl) fields["dl_number"] = dl[1] ?? "";
  }

  if (type === "passport" || type === "visa") {
    const { l1, l2 } = mrzLines(lines);
    if (l1) {
      fields["mrz_line1"] = l1;
      const names = l1.slice(5).split("<<");
      if (names[0]) fields["surname"] = names[0].replace(/</g, " ").trim();
      if (names[1]) fields["given_names"] = names[1].replace(/</g, " ").trim();
      fields["issuing_state"] = l1.slice(2, 5).replace(/</g, "");
    }
    if (l2) {
      let repaired = l2;
      // Digit-only zones in TD3 line 2: repair confusable glyphs deterministically.
      const digitZones: [number, number][] = [
        [9, 10],
        [13, 20],
        [21, 28],
        [43, 44],
      ];
      for (const [start, end] of digitZones) {
        for (let i = start; i < end; i += 1) {
          const ch = repaired[i] ?? "";
          const alt = DIGIT_ALTS[ch]?.[0];
          if (alt && !/\d/.test(ch)) {
            repaired = repaired.slice(0, i) + alt + repaired.slice(i + 1);
            repairs.push(`position ${i + 1}: ${ch} → ${alt}`);
          }
        }
      }
      fields["mrz_line2"] = repaired;
      fields["passport_number"] = repaired.slice(0, 9).replace(/</g, "");
      fields["nationality"] = repaired.slice(10, 13).replace(/</g, "");
      const dobRaw = repaired.slice(13, 19);
      if (/^\d{6}$/.test(dobRaw)) {
        fields["date_of_birth"] =
          `${dobRaw.slice(4, 6)}/${dobRaw.slice(2, 4)}/${dobRaw.slice(0, 2)}`;
      }
      const exp = repaired.slice(21, 27);
      if (/^\d{6}$/.test(exp)) {
        fields["expiry"] = `${exp.slice(4, 6)}/${exp.slice(2, 4)}/${exp.slice(0, 2)}`;
      }
      const sex = repaired[20];
      if (sex === "M" || sex === "F") fields["gender"] = sex === "M" ? "Male" : "Female";
      if (fields["surname"] || fields["given_names"]) {
        fields["name"] = [fields["given_names"], fields["surname"]]
          .filter(Boolean)
          .join(" ")
          .trim();
      }
    }
  }

  return { fields, repairs };
}

export function maskNumber(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) return value;
  return `${"•".repeat(compact.length - 4)}${compact.slice(-4)}`;
}

export const DOC_LABEL: Record<DocumentType, string> = {
  aadhaar: "Aadhaar",
  passport: "Passport",
  visa: "Visa",
  dl: "Driving Licence",
};

export const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  surname: "Surname",
  given_names: "Given names",
  date_of_birth: "Date of birth",
  gender: "Gender",
  aadhaar_number: "Aadhaar number",
  passport_number: "Document number",
  visa_number: "Visa number",
  dl_number: "Licence number",
  nationality: "Nationality",
  issuing_state: "Issuing state",
  expiry: "Expiry",
};

export const HIDDEN_FIELDS = new Set(["mrz_line1", "mrz_line2"]);

/**
 * Digit-level repair for Aadhaar readings.
 *
 * Verhoeff detects every single-digit error, so for a failing number each
 * position has exactly one value that would make it valid. We only accept a
 * repair when that value is a known OCR look-alike of what was read AND the
 * whole search yields exactly one such candidate. A genuinely altered digit
 * either has no look-alike explanation or produces ambiguity, and stays a
 * failure.
 */
const DIGIT_CONFUSION: Record<string, string[]> = {
  "0": ["8", "6", "9"],
  "1": ["7", "4"],
  "2": ["7", "3"],
  "3": ["8", "9", "5"],
  "4": ["9", "1"],
  "5": ["6", "3", "8"],
  "6": ["5", "8", "0"],
  "7": ["1", "2"],
  "8": ["6", "3", "0", "5", "9"],
  "9": ["4", "3", "8", "0"],
};

export function repairAadhaarNumber(
  raw: string,
  isValid: (n: string) => boolean,
): { value: string; note: string } | null {
  if (raw.length !== 12 || isValid(raw)) return null;
  const found: { value: string; note: string }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const ch = raw[i] ?? "";
    for (const alt of DIGIT_CONFUSION[ch] ?? []) {
      const candidate = raw.slice(0, i) + alt + raw.slice(i + 1);
      if (isValid(candidate))
        found.push({ value: candidate, note: `digit ${i + 1}: ${ch} → ${alt}` });
    }
  }
  const unique = new Set(found.map((f) => f.value));
  if (unique.size !== 1) return null;
  return found[0] ?? null;
}
