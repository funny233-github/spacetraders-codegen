import fs from "fs";
import path from "path";
import {
  IrFunctionDefinition,
  IrApiCall,
  IrErrorHandling,
  IrDataProcessor,
} from "./generateIrFunction";
import { IrFunctionFile, IrResponse } from "./irTypes";
import { renderField, renderIsValid } from "./renderIr";
import { IrType } from "./irTypes";

/**
 * Generate TypeScript function implementations from per-function IR files.
 *
 * Each entry carries its own local response type (R1). Non-object responses
 * (R2 scalar/void, R3 $ref) have no response type and validate nothing.
 */
export function generateFunctionsFromIR(
  functionIrFiles: IrFunctionFile[],
  outputDir: string,
): void {
  // Copy shared modules (client and errors) to root target directory once.
  const rootDir = outputDir;
  const sharedDir = path.join(__dirname, "..", "src", "shared");
  for (const fileName of ["client.ts", "errors.ts"]) {
    const srcPath = path.join(sharedDir, fileName);
    const destPath = path.join(rootDir, fileName);
    if (fs.existsSync(srcPath)) {
      fs.writeFileSync(destPath, fs.readFileSync(srcPath, "utf-8"), "utf-8");
    }
  }

  // Generate one file per function definition.
  for (const ir of functionIrFiles) {
    const func = ir.function;
    // Determine tag from IR definition (use tag field).
    const tag = func.tag || "default";
    const tagDir = path.join(outputDir, tag.toLowerCase());
    if (!fs.existsSync(tagDir)) {
      fs.mkdirSync(tagDir, { recursive: true });
    }

    const content = generateFunctionContent(ir);
    const outputPath = path.join(tagDir, `${func.name}.ts`);
    fs.writeFileSync(outputPath, content, "utf-8");

    console.log(`Generated TypeScript function: ${outputPath}`);
  }

  console.log(`Total functions generated: ${functionIrFiles.length}`);
}

/**
 * Generate TypeScript module content for a single function (with its local
 * response type when present).
 */
function generateFunctionContent(ir: IrFunctionFile): string {
  const func = ir.function;
  const responseType = ir.responseType;
  const lines: string[] = [];

  // Determine auth scheme and import appropriate client.
  // SpaceTraders marks auth as optional with an empty security entry `{}`;
  // when present, the endpoint needs no token and uses the base HttpClient.
  let clientType = "HttpClient";
  if (func.security) {
    const optional = func.security.some((s) => Object.keys(s).length === 0);
    if (!optional) {
      for (const scheme of func.security) {
        if (scheme["AgentToken"]) {
          clientType = "AgentTokenClient";
          break;
        } else if (scheme["AccountToken"]) {
          clientType = "AccountTokenClient";
          break;
        }
      }
    }
  }

  // Collect named (non-primitive) types referenced in the signature so they can
  // be imported from the shared types module. Without this, a return/param type
  // like `Agent` or `Array<System>` would be referenced but never imported.
  const namedTypes = collectNamedTypes(func, responseType);

  // Import statements (relative path from subdirectory). `clientType` is always
  // used as the `http` parameter type.
  lines.push(`import { ${clientType} } from "../client";`);
  lines.push('import { ApiError } from "../errors";');
  if (namedTypes.length > 0) {
    lines.push(`import { ${namedTypes.join(", ")} } from "../types";`);
  }
  lines.push("");

  // Local response type (R1): defined in this file, not imported.
  if (responseType) {
    lines.push(renderLocalType(responseType));
    lines.push("");
  }

  // Add comment if exists.
  if (func.comment) {
    lines.push(`/** ${func.comment} */`);
  }

  // Generate function signature and body.
  const clientTypeForBody = clientType;
  const signature = generateFunctionSignature(func, clientTypeForBody);
  lines.push(signature + " {");
  const body = generateFunctionBody(func, responseType);
  const indentedBody = body
    .split("\n")
    .map((line) => "  " + line)
    .join("\n");
  lines.push(indentedBody);
  lines.push("}");

  return lines.join("\n");
}

/** Render the local response type (class with is_valid, or interface). */
function renderLocalType(responseType: IrResponse): string {
  const keyword = responseType.kind === "class" ? "class" : "interface";
  const fields = responseType.fields.map(renderField).join("\n");
  const body = `export ${keyword} ${responseType.name} {\n${fields}\n}\n`;
  if (keyword === "class") {
    return body + renderIsValid(responseType.fields);
  }
  return body;
}

/**
 * Collect the named (non-primitive) type names referenced in a function's
 * signature. For R1 (local response type) the return type is local (not
 * imported); its field refs are collected. For R2/R3 the return type may be a
 * global ref. Handles nested `Array<X>` by descending into the element type.
 */
function collectNamedTypes(
  func: IrFunctionDefinition,
  responseType?: IrResponse,
): string[] {
  const primitives = new Set([
    "string",
    "number",
    "boolean",
    "object",
    "any",
    "unknown",
    "void",
  ]);
  const names = new Set<string>();

  const addTypeStr = (typeStr: string): void => {
    const arrayMatch = typeStr.match(/^Array<(.+)>$/);
    if (arrayMatch) {
      addTypeStr(arrayMatch[1]);
      return;
    }
    if (!primitives.has(typeStr)) {
      names.add(typeStr);
    }
  };

  if (responseType) {
    // R1: return type is the local type name; collect refs from its fields.
    for (const field of responseType.fields) {
      collectTypeRefs(field.type, names);
    }
  } else {
    // R2/R3: return type may be a global ref.
    addTypeStr(func.returnType);
  }

  for (const param of func.parameters) {
    addTypeStr(param.type);
  }

  return Array.from(names).sort();
}

/** Collect all `ref` type names reachable from an IrType node. */
function collectTypeRefs(type: IrType, acc: Set<string>): void {
  switch (type.kind) {
    case "ref":
      acc.add(type.name);
      break;
    case "array":
      collectTypeRefs(type.items, acc);
      break;
    case "object":
      for (const f of type.fields || []) collectTypeRefs(f.type, acc);
      if (type.mapValue) collectTypeRefs(type.mapValue, acc);
      break;
  }
}

/**
 * Generate TypeScript function signature with consistent formatting
 */
function generateFunctionSignature(
  func: IrFunctionDefinition,
  clientType: string,
): string {
  const funcName = func.name;
  // Return the data directly (not wrapped in ApiResponse) for better API ergonomics
  const returnType = `Promise<${func.returnType}>`;

  // Build each parameter as a block, optionally preceded by a JSDoc comment so
  // the parameter's OpenAPI description is preserved in the generated signature.
  const paramBlocks: string[] = [];
  paramBlocks.push(`http: ${clientType}`);

  for (const param of func.parameters) {
    const optionalModifier = param.required ? "" : "?";
    const decl = `${param.name}${optionalModifier}: ${param.type}`;
    paramBlocks.push(
      param.comment ? `/** ${param.comment} */\n  ${decl}` : decl,
    );
  }

  if (paramBlocks.length === 1) {
    return `export async function ${funcName}(${paramBlocks[0]}): ${returnType}`;
  }

  // Multi-line formatting with consistent indentation; comments stay attached
  // to their parameter and share its indent level.
  let signature = `export async function ${funcName}(`;
  for (const block of paramBlocks) {
    signature += `\n  ${block},`;
  }
  signature = signature.slice(0, -1); // Remove trailing comma
  signature += `\n): ${returnType}`;
  return signature;
}

/**
 * Generate TypeScript function body
 */
function generateFunctionBody(
  func: IrFunctionDefinition,
  responseType?: IrResponse,
): string {
  const lines: string[] = [];
  const validate = responseType?.kind === "class";

  // Generate request body object if needed
  const requestCode = generateRequestBodyCode(func);
  if (requestCode) {
    lines.push(requestCode);
  }
  // Add blank line after request body for readability
  if (requestCode) {
    lines.push("");
  }

  const apiCallCode = generateApiCallCode(func.body.apiCall, func.returnType);
  lines.push(apiCallCode);

  const errorHandlingCode = generateErrorHandlingCode(func.body.errorHandling);
  lines.push(errorHandlingCode);

  // Validate the returned data against its OpenAPI constraints when the local
  // response type is a class (has an is_valid() method). The API returns a plain
  // object, so instantiate the class and copy the data over before is_valid().
  if (validate) {
    lines.push("if (response.data === null || response.data === undefined) {");
    lines.push(`  throw new Error('${func.returnType}: expected data');`);
    lines.push("}");
    lines.push(`const data = new ${func.returnType}();`);
    lines.push(`Object.assign(data, response.data);`);
    lines.push(`data.is_valid();`);
    lines.push("");
    // Return the validated class instance
    lines.push("return data;");
    return lines.join("\n");
  }

  // For now, return response.data for the success case
  if (func.body.postProcessing) {
    const postProcessCode = generatePostProcessingCode(
      func.body.postProcessing,
    );
    lines.push(postProcessCode);
  } else {
    // Return the full response (ApiResponse<T>) to match function signature
    lines.push("return response;");
  }

  return lines.join("\n");
}

/**
 * Generate code for request body object if needed
 */
function generateRequestBodyCode(func: IrFunctionDefinition): string | null {
  const apiCall = func.body.apiCall;

  // Check if we need a request body
  if (!apiCall.body) {
    return null;
  }

  // Identify which parameters are NOT path/query parameters
  const pathParams = new Set(Object.values(apiCall.params || {}));
  const queryParams = new Set(Object.values(apiCall.query || {}));

  const bodyParams: string[] = [];
  for (const param of func.parameters) {
    if (!pathParams.has(param.name) && !queryParams.has(param.name)) {
      // Use the original field name when the variable was renamed to avoid a
      // path/query collision (e.g. var `shipSymbolBody` -> field `shipSymbol`).
      const field = param.fieldName || param.name;
      bodyParams.push(`${field}: ${param.name}`);
    }
  }

  // If no body parameters but body is expected, generate empty object
  if (bodyParams.length === 0) {
    return "const requestBody: Record<string, never> = {};";
  }

  // Generate request object creation
  const lines: string[] = [`const requestBody = {`];
  for (const entry of bodyParams) {
    lines.push(`  ${entry},`);
  }
  lines.push("};");

  return lines.join("\n");
}

/**
 * Generate TypeScript code for API call using HttpClient post method
 */
function generateApiCallCode(apiCall: IrApiCall, returnType?: string): string {
  // Build request object as formatted string
  let req = `{
    path: '${apiCall.path}'`;

  // Add path parameters if they exist (for URL substitution)
  if (apiCall.params && Object.keys(apiCall.params).length > 0) {
    req += `,\n    params: {`;
    const paramLines: string[] = [];
    for (const key of Object.keys(apiCall.params)) {
      paramLines.push(`      ${key}: ${apiCall.params![key]}`);
    }
    req += `\n${paramLines.join(",\n")}\n    }`;
  }

  // Add query parameters (e.g. pagination for list endpoints)
  if (apiCall.query && Object.keys(apiCall.query).length > 0) {
    req += `,\n    query: {`;
    const queryLines: string[] = [];
    for (const key of Object.keys(apiCall.query)) {
      queryLines.push(`      ${key}: ${apiCall.query![key]}`);
    }
    req += `\n${queryLines.join(",\n")}\n    }`;
  }

  if (apiCall.body) {
    req += `,\n    body: ${apiCall.body}`;
  }

  req += `\n  }`;

  // Dispatch to the matching HttpClient method. Every HTTP verb maps to a
  // client method so POST/PUT/PATCH/DELETE are sent with the correct verb
  // (previously every non-GET call was emitted as http.post).
  const clientMethod = HTTP_CLIENT_METHODS[apiCall.method] ?? "post";
  const call = returnType
    ? `http.${clientMethod}<${returnType}>`
    : `http.${clientMethod}`;
  return `const response = await ${call}(${req});`;
}

// Maps an OpenAPI HTTP method to the HttpClient method that sends it.
const HTTP_CLIENT_METHODS: Record<string, string> = {
  GET: "get",
  POST: "post",
  PUT: "put",
  PATCH: "patch",
  DELETE: "delete",
};

/**
 * Generate TypeScript code for error handling
 */
function generateErrorHandlingCode(errorHandling: IrErrorHandling): string {
  if (errorHandling.type === "generic") {
    // Extract status and raw from the error in response
    return `if (!response.ok) {\n  const err = response.error!;\n  throw new ApiError(err.status, err.raw, "${errorHandling.genericMessage}");\n}`;
  } else if (errorHandling.type === "specific") {
    const lines: string[] = [];
    for (const err of errorHandling.specificErrors || []) {
      // Check the original HTTP status via response.error.status
      lines.push(
        `if (!response.ok && response.error!.status === ${err.code}) {\n  throw new ApiError(response.error!.status, response.error!.raw, "${err.message}");\n}`,
      );
    }
    return lines.join("\n");
  }
  return "";
}

/**
 * Generate TypeScript code for post-processing
 */
function generatePostProcessingCode(processor: IrDataProcessor): string {
  if (processor.type === "simple") {
    return `return response.${processor.dataField};`;
  } else if (processor.type === "transform") {
    return `return ${processor.transformFunction}(response.data);`;
  } else if (processor.type === "custom" && processor.customCode) {
    return processor.customCode.join("\n");
  }
  return "return response.data;";
}
