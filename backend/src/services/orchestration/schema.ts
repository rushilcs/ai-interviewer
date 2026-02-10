import fs from "node:fs";
import path from "node:path";

export type SectionDef = {
  id: string;
  name: string;
  duration_seconds: number;
};

export type InterviewSchemaDef = {
  version: string;
  sections: SectionDef[];
};

const schemaCache = new Map<string, InterviewSchemaDef>();

function schemaPath(version: string): string {
  const base = path.resolve(process.cwd(), "src", "schemas");
  return path.join(base, `${version}.json`);
}

/**
 * Load interview schema by version (e.g. "mle-v1").
 * Caches after first load.
 */
export function loadSchema(version: string): InterviewSchemaDef {
  const cached = schemaCache.get(version);
  if (cached) return cached;

  const filePath = schemaPath(version);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Schema not found: ${version} at ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as InterviewSchemaDef;
  if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error(`Invalid schema ${version}: sections array required`);
  }
  schemaCache.set(version, parsed);
  return parsed;
}

/**
 * Get section definition by id within a schema.
 */
export function getSectionById(schema: InterviewSchemaDef, sectionId: string): SectionDef | undefined {
  return schema.sections.find((s) => s.id === sectionId);
}

/**
 * Get the next section id after the given one, or null if last.
 */
export function getNextSectionId(schema: InterviewSchemaDef, sectionId: string): string | null {
  const idx = schema.sections.findIndex((s) => s.id === sectionId);
  if (idx < 0 || idx >= schema.sections.length - 1) return null;
  return schema.sections[idx + 1].id;
}
