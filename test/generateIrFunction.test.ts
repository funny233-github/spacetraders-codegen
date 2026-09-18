import {
  generateIrFunction,
  IrFunctionDefinition,
} from "../src/generateIrFunction";
import { Endpoint } from "../src/extractEndpoint";

// Helper to create a minimal endpoint for testing
function createTestEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    endpointName: "default",
    method: "POST",
    path: "/test",
    summary: "Test endpoint",
    description: "A test endpoint",
    tags: ["test"],
    ...overrides,
  } as Endpoint;
}

describe("generateIrFunction", () => {
  describe("function name generation", () => {
    it("should derive function name from operationId in camelCase", () => {
      const endpoint = createTestEndpoint({
        endpointName: "test",
        operationId: "navigate-ship",
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].name).toBe("navigateShip");
    });

    it("should use endpointName if operationId is missing", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].name).toBe("get-ship");
    });

    it("should convert kebab-case to camelCase", () => {
      const endpoint = createTestEndpoint({
        endpointName: "fleet",
        operationId: "list-fleets",
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].name).toBe("listFleets");
    });
  });

  describe("parameter extraction", () => {
    it("should extract parameters with correct types", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
        parameters: [
          {
            name: "shipSymbol",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The ship symbol",
          },
          {
            name: "detailLevel",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Detail level",
          },
        ],
      });

      const result = generateIrFunction(endpoint);
      const params = result.functions[0].parameters;

      expect(params).toHaveLength(2);
      expect(params[0]).toEqual({
        name: "shipSymbol",
        type: "string",
        required: true,
        comment: "The ship symbol",
      });
      expect(params[1]).toEqual({
        name: "detailLevel",
        type: "string",
        required: false,
        comment: "Detail level",
      });
    });

    it("should infer array types correctly", () => {
      const endpoint = createTestEndpoint({
        endpointName: "list-ships",
        parameters: [
          {
            name: "shipTypes",
            in: "query",
            required: true,
            schema: {
              type: "array",
              items: { type: "string" },
            },
            description: "List of ship types",
          },
        ],
      });

      const result = generateIrFunction(endpoint);
      const params = result.functions[0].parameters;

      expect(params).toHaveLength(1);
      expect(params[0].type).toBe("Array<string>");
    });

    it("should extract $ref types correctly", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
        parameters: [
          {
            name: "shipSymbol",
            in: "path",
            required: true,
            schema: {
              $ref: "#/components/schemas/ShipSymbol",
            },
          },
        ],
      });

      const result = generateIrFunction(endpoint);
      const params = result.functions[0].parameters;

      expect(params).toHaveLength(1);
      expect(params[0].type).toBe("ShipSymbol");
    });
  });

  describe("API call construction", () => {
    it("should create correct API call for POST with body", () => {
      const endpoint = createTestEndpoint({
        endpointName: "navigate-ship",
        method: "POST",
        path: "/my/ships/{shipSymbol}/navigate",
        requestBodySchema: { type: "object" },
      });

      const result = generateIrFunction(endpoint);
      const apiCall = result.functions[0].body.apiCall;

      expect(apiCall.method).toBe("POST");
      expect(apiCall.path).toBe("/my/ships/{shipSymbol}/navigate");
      expect(apiCall.body).toBe("requestBody");
    });

    it("should create correct API call for GET without body", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
        method: "GET",
        path: "/my/ships/{shipSymbol}",
      });

      const result = generateIrFunction(endpoint);
      const apiCall = result.functions[0].body.apiCall;

      expect(apiCall.method).toBe("GET");
      expect(apiCall.path).toBe("/my/ships/{shipSymbol}");
      expect(apiCall.body).toBeUndefined();
    });

    it("should handle different HTTP methods", () => {
      const endpoint = createTestEndpoint({
        endpointName: "update-ship",
        method: "PUT",
        path: "/my/ships/{shipSymbol}",
      });

      const result = generateIrFunction(endpoint);
      const apiCall = result.functions[0].body.apiCall;

      expect(apiCall.method).toBe("PUT");
    });
  });

  describe("return type inference", () => {
    it("should infer return type from $ref", () => {
      const endpoint = createTestEndpoint({
        endpointName: "navigate-ship",
        responseSchema: {
          $ref: "#/components/schemas/NavigateShipResponse",
        },
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].returnType).toBe("NavigateShipResponse");
    });

    it("should infer return type from object schema", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
        responseSchema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
          },
        },
      });

      const result = generateIrFunction(endpoint);
      // Object schemas now resolve to a function-derived *Response interface
      // (rather than the bare `object`) so callers get a named, typed payload.
      expect(result.functions[0].returnType).toBe("Get-shipResponse");
    });

    it("should infer array return types", () => {
      const endpoint = createTestEndpoint({
        endpointName: "list-ships",
        responseSchema: {
          type: "array",
          items: { type: "object" },
        },
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].returnType).toBe("Array<object>");
    });
  });

  describe("error handling", () => {
    it("should use generic error handling by default", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
      });

      const result = generateIrFunction(endpoint);
      const errorHandling = result.functions[0].body.errorHandling;

      expect(errorHandling.type).toBe("generic");
      expect(errorHandling.genericMessage).toBe("API call failed");
      expect(errorHandling.specificErrors).toBeUndefined();
    });
  });

  describe("data processor", () => {
    it("should extract the response payload by default", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
      });

      const result = generateIrFunction(endpoint);
      const postProcessing = result.functions[0].body.postProcessing;

      expect(postProcessing.dataField).toBe("data");
    });
  });

  describe("comment generation", () => {
    it("should prefer description over summary when both are available", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
        summary: "Get ship details",
        description: "Fetches ship details from the API",
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].comment).toBe(
        "Fetches ship details from the API",
      );
    });

    it("should use description as comment if summary is missing", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
        summary: "",
        description: "Fetches ship details from the API",
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].comment).toBe(
        "Fetches ship details from the API",
      );
    });

    it("should set comment to undefined if both missing", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
        summary: undefined,
        description: undefined,
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].comment).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty parameters array", () => {
      const endpoint = createTestEndpoint({
        endpointName: "ping",
        parameters: [],
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].parameters).toEqual([]);
    });

    it("should handle endpoints without response schema", () => {
      const endpoint = createTestEndpoint({
        endpointName: "ping",
        responseSchema: undefined,
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].returnType).toBe("void");
    });

    it("should handle endpoints without request body", () => {
      const endpoint = createTestEndpoint({
        endpointName: "get-ship",
        requestBodySchema: undefined,
      });

      const result = generateIrFunction(endpoint);
      expect(result.functions[0].body.apiCall.body).toBeUndefined();
    });
  });

  describe("full endpoint simulation", () => {
    it("should correctly handle a realistic navigate-ship endpoint", () => {
      const endpoint: Endpoint = {
        endpointName: "fleet",
        operationId: "navigate-ship",
        method: "POST",
        path: "/my/ships/{shipSymbol}/navigate",
        summary: "Navigate Ship",
        description: "Navigates a ship to a new waypoint or system",
        tags: ["fleet"],
        parameters: [
          {
            name: "shipSymbol",
            in: "path",
            required: true,
            schema: {
              $ref: "#/components/schemas/ShipSymbol",
            },
            description: "The ship symbol to navigate",
          },
        ],
        requestBodySchema: {
          type: "object",
          properties: {
            systemSymbol: { type: "string" },
            waypointSymbol: { type: "string" },
          },
        },
        responseSchema: {
          $ref: "#/components/schemas/NavigateShipResponse",
        },
      };

      const result = generateIrFunction(endpoint);
      const func = result.functions[0];

      // Verify function name
      expect(func.name).toBe("navigateShip");
      expect(func.tag).toBe("fleet");

      // Verify parameters: path param plus request-body fields are all exposed
      // as function params so the generated body is no longer empty.
      expect(func.parameters).toHaveLength(3);
      expect(func.parameters[0].name).toBe("shipSymbol");
      expect(func.parameters[0].type).toBe("ShipSymbol");
      expect(func.parameters[0].required).toBe(true);
      expect(func.parameters[1].name).toBe("systemSymbol");
      expect(func.parameters[1].required).toBe(false);
      expect(func.parameters[2].name).toBe("waypointSymbol");
      expect(func.parameters[2].required).toBe(false);

      // Verify return type
      expect(func.returnType).toBe("NavigateShipResponse");

      // Verify API call
      expect(func.body.apiCall.method).toBe("POST");
      expect(func.body.apiCall.path).toBe("/my/ships/{shipSymbol}/navigate");
      expect(func.body.apiCall.body).toBe("requestBody");

      // Verify comment (operation description, not the short summary)
      expect(func.comment).toBe("Navigates a ship to a new waypoint or system");
    });
  });
});
