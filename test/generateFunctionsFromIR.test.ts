import fs from "fs";
import os from "os";
import path from "path";
import { generateFunctionsFromIR } from "../src/generateFunctionsFromIR";
import { IrFunctionFile } from "../src/irTypes";

/** Generate one function file into a throwaway dir and return its source. */
function render(ir: IrFunctionFile): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-render-"));
  try {
    generateFunctionsFromIR([ir], dir);
    return fs.readFileSync(
      path.join(dir, ir.function.tag.toLowerCase(), `${ir.function.name}.ts`),
      "utf-8",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const genericBody = {
  errorHandling: { type: "generic" as const, genericMessage: "API call failed" },
  postProcessing: { dataField: "data" },
};

describe("generateFunctionsFromIR", () => {
  it("embeds path parameters in the URL template instead of a params object", () => {
    const code = render({
      function: {
        name: "orbitShip",
        tag: "Fleet",
        parameters: [
          {
            name: "shipSymbol",
            type: "string",
            required: true,
            comment: "The symbol of the ship.",
            in: "path",
          },
        ],
        returnType: "OrbitShipResponse",
        body: {
          apiCall: {
            method: "POST",
            path: "/my/ships/{shipSymbol}/orbit",
            params: { shipSymbol: "shipSymbol" },
            query: {},
          },
          ...genericBody,
        },
      },
    });

    expect(code).toContain(
      "path: `/my/ships/${encodeURIComponent(shipSymbol)}/orbit`",
    );
    expect(code).not.toContain("params:");
  });

  it("keeps query parameters as an object and assembles body fields", () => {
    const code = render({
      function: {
        name: "transferCargo",
        tag: "Fleet",
        parameters: [
          { name: "shipSymbol", type: "string", required: true, in: "path" },
          {
            name: "tradeSymbol",
            fieldName: "tradeSymbol",
            type: "TradeSymbol",
            required: true,
            in: "body",
          },
          {
            name: "units",
            fieldName: "units",
            type: "number",
            required: true,
            in: "body",
          },
        ],
        returnType: "TransferCargoResponse",
        body: {
          apiCall: {
            method: "POST",
            path: "/my/ships/{shipSymbol}/transfer",
            params: { shipSymbol: "shipSymbol" },
            query: {},
            body: "requestBody",
          },
          ...genericBody,
        },
      },
    });

    expect(code).toContain(
      "path: `/my/ships/${encodeURIComponent(shipSymbol)}/transfer`",
    );
    expect(code).not.toContain("params:");
    expect(code).toContain("const requestBody = {");
    expect(code).toContain("tradeSymbol: tradeSymbol,");
    expect(code).toContain("units: units,");
  });

  it("leaves paths without parameters as plain string literals", () => {
    const code = render({
      function: {
        name: "getSystems",
        tag: "Systems",
        parameters: [
          { name: "page", type: "number", required: false, in: "query" },
        ],
        returnType: "Array<System>",
        body: {
          apiCall: {
            method: "GET",
            path: "/systems",
            params: {},
            query: { page: "page" },
          },
          ...genericBody,
        },
      },
    });

    expect(code).toContain("path: '/systems',");
    expect(code).toContain("query: {");
    expect(code).not.toContain("params:");
  });

  it("passes a direct (non-object) body through as the request body", () => {
    const code = render({
      function: {
        name: "extractResourcesWithSurvey",
        tag: "Fleet",
        parameters: [
          { name: "shipSymbol", type: "string", required: true, in: "path" },
          {
            name: "survey",
            fieldName: "survey",
            type: "Survey",
            required: true,
            in: "body",
          },
        ],
        returnType: "ExtractResourcesWithSurveyResponse",
        body: {
          apiCall: {
            method: "POST",
            path: "/my/ships/{shipSymbol}/extract/survey",
            params: { shipSymbol: "shipSymbol" },
            query: {},
            body: "requestBody",
            bodyKind: "direct",
          },
          ...genericBody,
        },
      },
    });

    expect(code).toContain(
      "path: `/my/ships/${encodeURIComponent(shipSymbol)}/extract/survey`",
    );
    expect(code).toContain("const requestBody = survey;");
    expect(code).not.toContain("params:");
  });
});
