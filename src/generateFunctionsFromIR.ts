import fs from "fs";
import path from "path";
import {
  IrFunctionJson,
  IrFunctionDefinition,
  IrApiCall,
  IrErrorHandling,
  IrDataProcessor,
} from "./generateIrFunction";
import { getValidatedTypeNames } from "./generateTypesFromIR";

/**
 * Generate TypeScript function implementations from IR function definitions
 */
export function generateFunctionsFromIR(
  irPath: string,
  outputDir: string,
  classIrPath?: string,
): void {
  let irData: IrFunctionJson;
  try {
    const raw = fs.readFileSync(irPath, "utf-8");
    irData = JSON.parse(raw) as IrFunctionJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read IR file '${irPath}': ${message}`);
  }

  // Types that get an is_valid() method (read from the class IR when available).
  const validatedTypes = collectValidatedTypes(classIrPath);

  // Copy shared modules (client and errors) to root target directory once
  const rootDir = outputDir;
  const sharedDir = path.join(__dirname, "..", "src", "shared");
  for (const fileName of ["client.ts", "errors.ts"]) {
    const srcPath = path.join(sharedDir, fileName);
    const destPath = path.join(rootDir, fileName);
    if (fs.existsSync(srcPath)) {
      const content = fs.readFileSync(srcPath, "utf-8");
      fs.writeFileSync(destPath, content, "utf-8");
    }
  }

  // Generate functions for each function definition
  for (const func of irData.functions) {
    // Determine tag from IR definition (use tag field)
    const tag = func.tag || "default";

    // Create tag directory under the outputDir
    const tagDir = path.join(outputDir, tag.toLowerCase());

    if (!fs.existsSync(tagDir)) {
      fs.mkdirSync(tagDir, { recursive: true });
    }

    // Generate content for this single function
    const content = generateFunctionContent(func, validatedTypes);

    // Write to file - one file per function
    // Use function name as filename (lowercase)
    const fileName = func.name.toLowerCase() + ".ts";
    const outputPath = path.join(tagDir, fileName);
    fs.writeFileSync(outputPath, content, "utf-8");

    console.log(`Generated TypeScript function: ${outputPath}`);
  }

  console.log(`Total functions generated: ${irData.functions.length}`);
}

/**
 * Read the class IR and return the set of type names that have an is_valid()
 * method. Returns an empty set when the path is missing or unreadable.
 */
function collectValidatedTypes(classIrPath?: string): Set<string> {
  if (!classIrPath) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(classIrPath, "utf-8"));
    return getValidatedTypeNames(data.classes || []);
  } catch {
    return new Set();
  }
}

/**
 * Generate TypeScript module content for a single function
 */
function generateFunctionContent(
  func: IrFunctionDefinition,
  validatedTypes: Set<string>,
): string {
  const lines: string[] = [];

  // Determine auth scheme and import appropriate client
  let clientType = "HttpClient";
  if (func.security) {
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

  // Collect named (non-primitive) types referenced in the signature so they can
  // be imported from the shared types module. Without this, a return/param type
  // like `Agent` or `Array<System>` would be referenced but never imported.
  const namedTypes = collectNamedTypes(func);

  // Import statements (use relative path from subdirectory).
  // `ApiResponse` is intentionally not imported: functions return the unwrapped
  // data (Promise<T>), never the ApiResponse<T> wrapper, so the import would be
  // unused. `clientType` is always used as the `http` parameter type.
  lines.push(`import { ${clientType} } from "../client";`);
  lines.push('import { ApiError } from "../errors";');
  if (namedTypes.length > 0) {
    lines.push(`import { ${namedTypes.join(", ")} } from "../types";`);
  }
  lines.push("");

  // Add comment if exists
  if (func.comment) {
    lines.push(`/** ${func.comment} */`);
  }

  // Generate function signature and body
  const functionCode = generateFunctionCode(func, clientType, validatedTypes);
  lines.push(functionCode);

  return lines.join("\n");
}

/**
 * Generate TypeScript code for a single function with proper indentation
 */
function generateFunctionCode(
  func: IrFunctionDefinition,
  clientType: string,
  validatedTypes: Set<string>,
): string {
  const lines: string[] = [];

  const signature = generateFunctionSignature(func, clientType);
  lines.push(signature + " {"); // Add opening brace on same line as signature

  const bodyCode = generateFunctionBody(func, validatedTypes);
  // Ensure each line in body is indented by 2 spaces
  const indentedBody = bodyCode
    .split("\n")
    .map((line) => "  " + line)
    .join("\n");
  lines.push(indentedBody);

  lines.push("}");

  return lines.join("\n");
}

/**
 * Collect the named (non-primitive) type names referenced in a function's
 * signature (return type plus every parameter type). Handles nested
 * `Array<X>` by descending into the element type. Primitives
 * (string, number, boolean, object, any, unknown) are excluded.
 */
function collectNamedTypes(func: IrFunctionDefinition): string[] {
  const primitives = new Set([
    "string",
    "number",
    "boolean",
    "object",
    "any",
    "unknown",
  ]);
  const names = new Set<string>();

  const addType = (typeStr: string): void => {
    const arrayMatch = typeStr.match(/^Array<(.+)>$/);
    if (arrayMatch) {
      addType(arrayMatch[1]);
      return;
    }
    if (!primitives.has(typeStr)) {
      names.add(typeStr);
    }
  };

  addType(func.returnType);
  for (const param of func.parameters) {
    addType(param.type);
  }

  return Array.from(names).sort();
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
  validatedTypes: Set<string>,
): string {
  const lines: string[] = [];

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

  // Validate the returned data against its OpenAPI constraints when the return
  // type has an is_valid() method. The API returns a plain object, so instantiate
  // the class and copy the data over before calling is_valid().
  if (validatedTypes.has(func.returnType)) {
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

  // Use http.post for POST/PUT, http.get for GET, etc.
  if (apiCall.method === "GET") {
    return returnType
      ? `const response = await http.get<${returnType}>(${req});`
      : `const response = await http.get(${req});`;
  } else {
    return returnType
      ? `const response = await http.post<${returnType}>(${req});`
      : `const response = await http.post(${req});`;
  }
}

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
