import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Path exclusion rules: Skip scanning inside these directories or files
function isExcludedPath(normPath) {
  const parts = normPath.split("/");
  const fileName = path.basename(normPath);

  // 1. Skip excluded directory paths
  const excludedDirs = [
    "tests",
    "fixtures",
    "docs",
    "node_modules",
    ".venv",
    ".venv312",
    "__pycache__",
    ".pytest_cache",
    ".output",
    ".wrangler",
    ".git",
    "playwright-report",
    "test-results",
    "scratch",
  ];

  for (const dir of excludedDirs) {
    if (parts.includes(dir)) {
      return true;
    }
  }

  // 2. Skip *.example and *.md files
  if (fileName.endsWith(".example") || fileName.includes(".example.")) {
    return true;
  }
  if (fileName.endsWith(".md")) {
    return true;
  }

  return false;
}

function isUntrackedLocalEnvFile(normPath) {
  const baseName = path.basename(normPath);
  if (
    baseName === ".env" ||
    baseName === ".env.local" ||
    normPath === "backend/.env" ||
    normPath === "backend/.env.local"
  ) {
    return true;
  }
  return false;
}

const SAFE_CODE_CALLS = [
  "_env_first",
  "os.",
  "process.",
  "getenv",
  "environ",
  "secrets.",
  "authorization",
  "removeprefix",
  "int(",
  "str(",
  "print(",
  "logger.",
  "console.",
];

// Function to detect hardcoded secret literal string assignments in env files and code
function isHardcodedSecretLine(line) {
  const trimmed = line.trim();
  if (
    !trimmed ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  ) {
    return false;
  }

  const isCode = SAFE_CODE_CALLS.some((c) => trimmed.includes(c));

  // Check 1: Env file style assignment KEY=value (SCREAMING_CASE keys only — env file convention)
  // Only fires for lines like ADMIN_PASSCODE=abc123 or export TOKEN=xyz, not bare lowercase assignments
  if (
    !isCode &&
    /^\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:PASSCODE|SECRET|TOKEN|API_KEY)[A-Z0-9_]*\s*=/.test(trimmed)
  ) {
    const rhs = trimmed.split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
    if (
      rhs.length >= 4 &&
      // RHS must not be a function call or reference — no parentheses or known safe prefixes
      !rhs.includes("(") &&
      !rhs.startsWith("$") &&
      !["CHANGE_ME", "YOUR_", "<", "#"].some((p) => rhs.startsWith(p))
    ) {
      return true;
    }
  }

  // Check 2: JS/TS/Python code variable assignment containing hardcoded secret string literal >= 16 chars
  // Variable name must be >= 8 chars containing the secret keyword (rules out generic names like `token`)
  const varMatch = trimmed.match(
    /(?:const|let|var)\s+([a-zA-Z0-9_]{8,})\s*=|\b([a-zA-Z0-9_]{8,})\s*=/,
  );
  if (varMatch) {
    const varName = (varMatch[1] || varMatch[2] || "").toLowerCase();
    const hasSecretKeyword = /passcode|secret|api_key|apikey/.test(varName) ||
      // Allow `token` keyword only when combined with other chars (e.g. adminToken, auth_token)
      /[a-z_]token|token[a-z_]/.test(varName);
    if (!hasSecretKeyword) {
      // Not a secret-bearing variable name — skip
    } else {
      const stringLiterals = trimmed.match(/["']([^"']+)["']/g);
      if (stringLiterals) {
        for (const lit of stringLiterals) {
          const val = lit.slice(1, -1);
          // Ignore placeholders, short strings, uppercase env key names, protocol keywords
          if (
            val.length >= 16 &&
            !/^[A-Z0-9_]+$/.test(val) &&
            !["CHANGE_ME", "YOUR_", "<", "$", "#", "WRONG_PASSCODE", "Bearer"].some(
              (p) => val.startsWith(p) || val.includes(p),
            )
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

console.log("🔒 Running Pre-Commit / Pre-Zip Secret Leak Check...");
let detectedViolations = [];

// 1. Check Git Staged / Tracked files if inside a git repository
try {
  const gitTracked = execSync("git ls-files", {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
  })
    .trim()
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  const gitStaged = execSync("git diff --cached --name-only", {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
  })
    .trim()
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  const trackedOrStaged = new Set([...gitTracked, ...gitStaged]);

  for (const relPath of trackedOrStaged) {
    const normPath = relPath.replace(/\\/g, "/");
    const baseName = path.basename(normPath);

    if (
      (baseName.startsWith(".env") || baseName === ".env") &&
      !normPath.endsWith(".example") &&
      !normPath.includes(".example.")
    ) {
      detectedViolations.push(`Git tracked/staged .env secret file: ${normPath}`);
    }
  }
} catch (e) {
  // Git repository not present
}

// 2. Scan non-excluded codebase source files for secret KEY=value assignments
function scanCodebase(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(rootDir, fullPath);
    const normPath = relPath.replace(/\\/g, "/");

    // Skip self-check script file
    if (normPath === "scripts/verify-no-env-secrets.js") continue;

    if (isExcludedPath(normPath)) continue;

    if (entry.isDirectory()) {
      scanCodebase(fullPath);
    } else if (entry.isFile()) {
      // Skip local untracked .env files (which are ignored by .gitignore and excluded from zip)
      if (isUntrackedLocalEnvFile(normPath)) continue;

      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (isHardcodedSecretLine(line)) {
            detectedViolations.push(
              `Secret assignment match in ${normPath}:${idx + 1} -> "${line.trim()}"`
            );
          }
        });
      } catch (err) {
        // Ignore unreadable binary files
      }
    }
  }
}

scanCodebase(rootDir);

if (detectedViolations.length > 0) {
  console.error(
    "\n❌ HARD STOP: Secret Leak Protection Check Failed Loudly!\n"
  );
  detectedViolations.forEach((v) => console.error(`  - ${v}`));
  console.error(
    "\nAction Required: Remove live secret values from tracked files or unstage secret files before committing/zipping.\n"
  );
  process.exit(1);
}

console.log("✅ [PASS] Secret Check: No tracked or committed secrets detected.");
process.exit(0);
