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
    return `export type ${cls.name} = ${baseType};`;
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
  const members = (cls.members || []).map((m) => {
    const value = typeof m.value === "string" ? `"${m.value}"` : String(m.value);
    return `  ${m.name} = ${value},`;
  });
  return `export enum ${cls.name} {\n${members.join("\n")}\n}`;
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
