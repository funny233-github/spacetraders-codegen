// Shared rendering of the `IrType` tree to TypeScript. Used by both the global
// types generator and the per-function generator (which also renders a local
// response type).

import { IrType, IrObjectType, IrField2 } from "./irTypes";

/** Render an `IrType` node to a TypeScript type string. */
export function renderIrType(type: IrType): string {
  switch (type.kind) {
    case "ref":
      return type.name;
    case "primitive":
      return type.type;
    case "enum":
      return type.values.map((v) => `"${v}"`).join(" | ");
    case "array":
      return `Array<${renderIrType(type.items)}>`;
    case "object":
      return renderObjectType(type);
  }
}

function renderObjectType(type: IrObjectType): string {
  // Map type: `{ [k: string]: mapValue }` when only additionalProperties is set.
  if (type.mapValue && (!type.fields || type.fields.length === 0)) {
    return `{ [k: string]: ${renderIrType(type.mapValue)} }`;
  }
  const fields = (type.fields || []).map(renderField).join("\n");
  return `{\n${fields}\n}`;
}

export function renderField(field: IrField2): string {
  const optional = field.optional ? "?" : "";
  const type = renderIrType(field.type);
  const annotations = renderConstraintAnnotations(field);
  if (annotations.length === 0) {
    // Preserve existing output exactly when there are no constraints.
    const comment = field.description ? `  /** ${field.description} */\n` : "";
    return `${comment}  ${field.name}${optional}: ${type};`;
  }
  // Fields carrying OpenAPI constraints get a multi-line JSDoc block so the
  // constraints are visible on hover (@minLength, @format, ...) — matching
  // redocly's client. The block base (`/**`/`*/`) aligns with the field name
  // at 2-space indent, with ` *` continuation lines one deeper.
  const body: string[] = [];
  if (field.description) body.push(field.description);
  body.push(...annotations);
  const lines = body.map((b) => `   * ${b}`);
  return `  /**\n${lines.join("\n")}\n   */\n  ${field.name}${optional}: ${type};`;
}

/**
 * Render OpenAPI constraint annotations for a field, in a stable order. The
 * set of constraints mirrors the ones used by `renderIsValid` (see
 * collectFieldChecks), so the hover annotations and the runtime validation
 * stay in sync.
 */
export function renderConstraintAnnotations(field: IrField2): string[] {
  const a: string[] = [];
  if (field.minLength !== undefined) a.push(`@minLength ${field.minLength}`);
  if (field.maxLength !== undefined) a.push(`@maxLength ${field.maxLength}`);
  if (field.minimum !== undefined) a.push(`@minimum ${field.minimum}`);
  if (field.maximum !== undefined) a.push(`@maximum ${field.maximum}`);
  if (field.pattern !== undefined) a.push(`@pattern ${field.pattern}`);
  if (field.format !== undefined) a.push(`@format ${field.format}`);
  return a;
}

/**
 * Render the `is_valid()` method for a constrained object type. Emits a
 * per-field check for every constraint (min/max, pattern, format, enum) and
 * recurses into nested objects and array items. Returns an empty string when
 * the type has no constraints (so callers keep a plain interface).
 */
export function renderIsValid(fields: IrField2[]): string {
  const checks: string[] = [];
  for (const field of fields) {
    collectFieldChecks(
      field,
      `this.${field.name}`,
      field.name,
      "    ",
      checks,
    );
  }
  if (checks.length === 0) return "";
  return `
  /** Validate this instance against its OpenAPI constraints. Throws if invalid. */
  is_valid(): void {
${checks.join("\n")}
  }
`;
}

/** Collect per-field validation checks into `out` (mutated). */
function collectFieldChecks(
  field: IrField2,
  expr: string,
  pathLabel: string,
  indent: string,
  out: string[],
  parentGuard: string = "",
): void {
  // Optional fields are only checked when present, so guard each condition.
  // `parentGuard` carries the undefined-checks of optional ancestors so that
  // accessing a nested property (e.g. `this.stats.agents`) typechecks under
  // strict null checks.
  const optionalGuard = field.optional ? `${expr} !== undefined && ` : "";
  const fullGuard = parentGuard + optionalGuard;
  const push = (cond: string, msg: string): void => {
    // Parenthesize the condition when guarded, so `a && b || c` parses as
    // `a && (b || c)` instead of `(a && b) || c`.
    const wrapped = fullGuard ? `(${cond})` : cond;
    out.push(`${indent}if (${fullGuard}${wrapped}) {`);
    out.push(`${indent}  throw new Error('${pathLabel}: ${msg}');`);
    out.push(`${indent}}`);
  };

  const t = field.type;

  if (t.kind === "primitive") {
    if (field.minLength !== undefined)
      push(
        `typeof ${expr} !== 'string' || ${expr}.length < ${field.minLength}`,
        `expected string with minLength ${field.minLength}`,
      );
    if (field.maxLength !== undefined)
      push(
        `typeof ${expr} !== 'string' || ${expr}.length > ${field.maxLength}`,
        `expected string with maxLength ${field.maxLength}`,
      );
    if (field.minimum !== undefined)
      push(
        `typeof ${expr} !== 'number' || ${expr} < ${field.minimum}`,
        `expected number >= ${field.minimum}`,
      );
    if (field.maximum !== undefined)
      push(
        `typeof ${expr} !== 'number' || ${expr} > ${field.maximum}`,
        `expected number <= ${field.maximum}`,
      );
    if (field.pattern !== undefined)
      push(
        `typeof ${expr} !== 'string' || !/${field.pattern}/.test(${expr})`,
        `expected to match pattern ${field.pattern}`,
      );
    if (field.format === "int32" || field.format === "int64")
      push(
        `typeof ${expr} !== 'number' || !Number.isInteger(${expr})`,
        "expected integer",
      );
  } else if (t.kind === "enum") {
    const literals = t.values.map((v) => JSON.stringify(v)).join(", ");
    push(
      `![${literals}].includes(${expr} as any)`,
      `expected one of ${t.values.join(", ")}`,
    );
  } else if (t.kind === "object") {
    for (const child of t.fields || []) {
      collectFieldChecks(
        child,
        `${expr}.${child.name}`,
        `${pathLabel}.${child.name}`,
        indent + "  ",
        out,
        fullGuard,
      );
    }
  } else if (t.kind === "array") {
    // Validate each array item against the item schema's constraints.
    const itemChecks: string[] = [];
    collectFieldChecks(
      { name: "_item", type: t.items, optional: false },
      `${expr}[i]`,
      `${pathLabel}[i]`,
      "      ",
      itemChecks,
    );
    if (itemChecks.length > 0) {
      out.push(`${indent}if (Array.isArray(${expr})) {`);
      out.push(`${indent}  for (let i = 0; i < ${expr}.length; i++) {`);
      for (const c of itemChecks) out.push(c);
      out.push(`${indent}  }`);
      out.push(`${indent}}`);
    }
  }
}
