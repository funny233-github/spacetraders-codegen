import fs from "fs";
import { IrGlobalType } from "./irTypes";
import { renderField, renderIsValid } from "./renderIr";

interface IrDocument {
  types: IrGlobalType[];
}

/**
 * Generate a single types.ts from the IR (global component types).
 *
 * @param irPath path to types-IR.json
 * @param outputDir directory to write types.ts into
 */
export function generateTypesFromIR(irPath: string, outputDir: string): void {
  const ir = JSON.parse(fs.readFileSync(irPath, "utf-8")) as IrDocument;
  const renderedTypes = ir.types.map(renderGlobalType);
  const typeDeclarations = renderedTypes.join("\n");

  const header = `/**
 * This file was auto-generated from codegen/src/generateTypesFromIR.ts
 * Global component types.
 */
`;
  const output = header + typeDeclarations;
  fs.writeFileSync(`${outputDir}/types.ts`, output);
}

function renderGlobalType(cls: IrGlobalType): string {
  // typeAlias: `export type Name = <baseType>;`
  if (cls.typeSchema) {
    const baseType = inferBaseType(cls.typeSchema);
    const schema = cls.typeSchema as Record<string, unknown>;
    return `${renderSchemaJSDoc(schema, cls.comment)}export type ${cls.name} = ${baseType};`;
  }

  // enum: `export enum Name { ... }` + union type
  if (cls.kind === "enum" || (cls.members && cls.members.length > 0)) {
    return renderEnum(cls);
  }

  // class/interface
  if (cls.kind === "class" || cls.kind === "interface") {
    const keyword = cls.kind === "class" ? "class" : "interface";
    const fields = (cls.fields || []).map(renderField).join("\n");
    const comment = cls.comment ? `  /** ${cls.comment} */\n` : "";
    const body = `export ${keyword} ${cls.name} {\n${comment}${fields}\n}\n`;
    if (keyword === "class") {
      return body + renderIsValid(cls.fields || []);
    }
    return body;
  }

  return "";
}

function renderEnum(cls: IrGlobalType): string {
  const members = cls.members || [];
  const values = members.map((m) =>
    typeof m.value === "string" ? m.value : String(m.value),
  );
  // Literal-union type (like redocly) instead of a TS `enum`: exhaustiveness
  // friendly, no runtime object, and clean hover hints. The `VALUE_n` member
  // names carry no meaning, so the runtime object keys derive from the values.
  const union = values.map((v) => `"${v}"`).join(" | ");
  const entries = members.map((m) => {
    const v = typeof m.value === "string" ? m.value : String(m.value);
    return `  ${sanitizeEnumKey(v)}: "${v}",`;
  });
  return `${renderTypeJSDoc(cls)}export type ${cls.name} = ${union};
export const ${cls.name} = {
${entries.join("\n")}
} as const;`;
}

/** Render a 2-space JSDoc block from a global type's comment (or none). */
function renderTypeJSDoc(cls: IrGlobalType): string {
  if (!cls.comment) return "";
  return `/**\n * ${cls.comment}\n */\n`;
}

/**
 * Render a JSDoc block for a type alias from its raw OpenAPI schema, including
 * constraint annotations (@minLength, @format, ...) so hover matches redocly.
 */
function renderSchemaJSDoc(
  schema: Record<string, unknown>,
  fallbackComment?: string,
): string {
  const body: string[] = [];
  const desc =
    typeof schema.description === "string" ? schema.description : fallbackComment;
  if (desc) body.push(desc);
  if (typeof schema.minLength === "number") body.push(`@minLength ${schema.minLength}`);
  if (typeof schema.maxLength === "number") body.push(`@maxLength ${schema.maxLength}`);
  if (typeof schema.minimum === "number") body.push(`@minimum ${schema.minimum}`);
  if (typeof schema.maximum === "number") body.push(`@maximum ${schema.maximum}`);
  if (typeof schema.pattern === "string") body.push(`@pattern ${schema.pattern}`);
  if (typeof schema.format === "string") body.push(`@format ${schema.format}`);
  if (body.length === 0) return "";
  return `/**\n${body.map((b) => ` * ${b}`).join("\n")}\n */\n`;
}

/** Turn an enum value into a safe runtime object key (e.g. "NEUTRON_STAR"). */
function sanitizeEnumKey(name: string): string {
  const k = name.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(k) ? k : `_${k}`;
}

function inferBaseType(typeSchema: unknown): string {
  const schema = typeSchema as {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
  };

  if (schema.type === "array" && schema.items) {
    const items = schema.items as {
      type?: string;
      properties?: Record<string, unknown>;
    };
    if (items.type === "object" && items.properties) {
      return "Record<string, unknown>";
    }
    return "Array<unknown>";
  }
  if (schema.type === "object" && schema.properties) {
    return "Record<string, unknown>";
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "unknown";
  }
}
