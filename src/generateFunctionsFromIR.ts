import fs from 'fs';
import path from 'path';
import { IrFunctionJson, IrFunctionDefinition, IrApiCall, IrErrorHandling, IrDataProcessor } from './generateIrFunction';

/**
 * Generate TypeScript function implementations from IR function definitions
 */
export function generateFunctionsFromIR(irPath: string, outputDir: string): void {
  const irData: IrFunctionJson = JSON.parse(fs.readFileSync(irPath, 'utf-8'));

  // Generate functions for each function definition
  for (const func of irData.functions) {
    // Determine tag from IR definition (use tag field)
    const tag = func.tag || 'default';

    // Create tag directory under the outputDir
    const tagDir = path.join(outputDir, tag.toLowerCase());

    if (!fs.existsSync(tagDir)) {
      fs.mkdirSync(tagDir, { recursive: true });
    }

    // Generate content for this single function
    const content = generateFunctionContent(func);

    // Write to file - one file per function
    // Use function name as filename (lowercase)
    const fileName = func.name.toLowerCase() + '.ts';
    const outputPath = path.join(tagDir, fileName);
    fs.writeFileSync(outputPath, content, 'utf-8');

    console.log(`Generated TypeScript function: ${outputPath}`);
  }

  console.log(`Total functions generated: ${irData.functions.length}`);
}

/**
 * Generate TypeScript module content for a single function
 */
function generateFunctionContent(func: IrFunctionDefinition): string {
  const lines: string[] = [];

  // Import statements
  lines.push('import { HttpClient } from "./client";');
  lines.push('import { ApiResponse, ApiError } from "./errors";');
  lines.push('');

  // Add comment if exists
  if (func.comment) {
    lines.push(`/** ${func.comment} */`);
  }

  // Generate function signature and body
  const functionCode = generateFunctionCode(func);
  lines.push(functionCode);

  return lines.join('\n');
}

/**
 * Generate TypeScript code for a single function with proper indentation
 */
function generateFunctionCode(func: IrFunctionDefinition): string {
  const lines: string[] = [];

  const signature = generateFunctionSignature(func);
  lines.push(signature + ' {');  // Add opening brace on same line as signature

  const bodyCode = generateFunctionBody(func);
  // Ensure each line in body is indented by 2 spaces
  const indentedBody = bodyCode.split('\n').map(line => '  ' + line).join('\n');
  lines.push(indentedBody);

  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate TypeScript function signature with consistent formatting
 */
function generateFunctionSignature(func: IrFunctionDefinition): string {
  const funcName = func.name;
  const returnType = `Promise<ApiResponse<${func.returnType}>>`;

  const params: string[] = [];
  params.push('http: HttpClient');

  for (const param of func.parameters) {
    const optionalModifier = param.required ? '' : '?';
    params.push(`${param.name}${optionalModifier}: ${param.type}`);
  }

  if (params.length === 1) {
    return `export async function ${funcName}(${params[0]}): ${returnType}`;
  } else {
    // Multi-line formatting with consistent indentation
    let signature = `export async function ${funcName}(`;
    for (const param of params) {
      signature += `\n  ${param},`;
    }
    signature = signature.slice(0, -1); // Remove trailing comma
    signature += `\n): ${returnType}`;
    return signature;
  }
}

/**
 * Generate TypeScript function body
 */
function generateFunctionBody(func: IrFunctionDefinition): string {
  const lines: string[] = [];

  // Generate request body object if needed
  const requestCode = generateRequestBodyCode(func);
  if (requestCode) {
    lines.push(requestCode);
  }
  // Add blank line after request body for readability
  if (requestCode) {
    lines.push('');
  }

  const apiCallCode = generateApiCallCode(func.body.apiCall);
  lines.push(apiCallCode);

  const errorHandlingCode = generateErrorHandlingCode(func.body.errorHandling);
  lines.push(errorHandlingCode);

  const postProcessCode = generatePostProcessingCode(func.body.postProcessing);
  lines.push(postProcessCode);

  return lines.join('\n');
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
      bodyParams.push(param.name);
    }
  }

  if (bodyParams.length === 0) {
    return null;
  }

  // Generate request object creation
  const lines: string[] = [`const requestBody = {`];
  for (const name of bodyParams) {
    lines.push(`  ${name}: ${name},`);
  }
  lines.push('};');

  return lines.join('\n');
}

/**
 * Generate TypeScript code for API call
 */
function generateApiCallCode(apiCall: IrApiCall): string {
  const method = apiCall.method.toLowerCase();

  let url = apiCall.path;
  if (apiCall.params && Object.keys(apiCall.params).length > 0) {
    for (const [key, value] of Object.entries(apiCall.params)) {
      url = url.replace(`{${key}}`, `\${${value}}`);
    }
  }

  const configLines: string[] = [];
  if (apiCall.body) {
    configLines.push(`body: ${apiCall.body}`);
  }

  let configStr = '';
  if (configLines.length > 0) {
    configStr = `, {\n  ${configLines.join(',\n  ')}\n}`;
  }

  return `const response = await http.request('${method}', \`${url}\`${configStr});`;
}

/**
 * Generate TypeScript code for error handling
 */
function generateErrorHandlingCode(errorHandling: IrErrorHandling): string {
  if (errorHandling.type === 'generic') {
    return `if (!response.ok) {\n  throw new ApiError(response, "${errorHandling.genericMessage}");\n}`;
  } else if (errorHandling.type === 'specific') {
    const lines: string[] = [];
    for (const err of errorHandling.specificErrors || []) {
      lines.push(`if (response.status === ${err.code}) {\n  throw new ApiError(response, "${err.message}");\n}`);
    }
    return lines.join('\n');
  }
  return '';
}

/**
 * Generate TypeScript code for post-processing
 */
function generatePostProcessingCode(processor: IrDataProcessor): string {
  if (processor.type === 'simple') {
    return `return response.${processor.dataField};`;
  } else if (processor.type === 'transform') {
    return `return ${processor.transformFunction}(response.data);`;
  } else if (processor.type === 'custom' && processor.customCode) {
    return processor.customCode.join('\n');
  }
  return 'return response.data;';
}
