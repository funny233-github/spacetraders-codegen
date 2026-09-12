import {
  generateIrClass,
  SchemaLike,
  ExtendedSpec,
} from "../src/generateIrClass";
import { Endpoint } from "../src/extractEndpoint";
import { OpenApiSpec } from "../src/mergeSpec";

// Helper to create a mock endpoint
function createMockEndpoint(
  operationId?: string,
  endpointName: string = "test",
  responseSchema?: unknown,
): Endpoint {
  return {
    path: "/test",
    method: "POST",
    summary: "Test endpoint",
    description: "A test endpoint",
    endpointName,
    tags: ["test"],
    operationId,
    requestBodySchema: null,
    responseSchema,
    responses: undefined,
  };
}

// Helper to create a mock OpenAPI spec with components
function createMockSpec(schemas: Record<string, unknown> = {}): OpenApiSpec {
  return {
    openapi: "3.0.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {},
    components: { schemas },
  };
}

describe("generateIrClass", () => {
  describe("interface generation", () => {
    it("should generate interface from object schema", () => {
      const schema: SchemaLike = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "integer" },
          active: { type: "boolean" },
        },
        required: ["name", "age"],
        description: "User schema",
      };

      const spec = createMockSpec({ User: schema });
      const endpoint = createMockEndpoint();

      // Reference the User schema
      (endpoint.responseSchema as any) = { $ref: "User" };

      const result = generateIrClass(endpoint, spec);

      expect(result.classes).toHaveLength(1);
      const userClass = result.classes[0];

      expect(userClass.name).toBe("User");
      expect(userClass.kind).toBe("interface");
      expect(userClass.comment).toBe("User schema");
      expect(userClass.fields).toHaveLength(3);

      const nameField = userClass.fields?.find((f) => f.name === "name");
      expect(nameField).toBeDefined();
      expect(nameField?.type).toBe("string");
      expect(nameField?.required).toBe(true);

      const ageField = userClass.fields?.find((f) => f.name === "age");
      expect(ageField).toBeDefined();
      expect(ageField?.type).toBe("number");
      expect(ageField?.required).toBe(true);

      const activeField = userClass.fields?.find((f) => f.name === "active");
      expect(activeField).toBeDefined();
      expect(activeField?.type).toBe("boolean");
      expect(activeField?.required).toBe(false);
    });

    it("should handle nested object properties with nested fields", () => {
      const schema: SchemaLike = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
          },
        },
      };

      const spec = createMockSpec({ Nested: schema });
      const endpoint = createMockEndpoint();

      // Reference the Nested schema
      (endpoint.responseSchema as any) = { $ref: "Nested" };

      const result = generateIrClass(endpoint, spec);

      expect(result.classes).toHaveLength(1);
      const nestedClass = result.classes[0];

      expect(nestedClass.name).toBe("Nested");
      expect(nestedClass.fields).toHaveLength(1);
      // Nested object should now have type "object" with nested fields
      const userField = nestedClass.fields?.[0];
      expect(userField).toBeDefined();
      if (userField) {
        expect(userField.type).toBe("object");
        expect(userField.fields).toHaveLength(1);
        expect(userField.fields?.[0].name).toBe("name");
        expect(userField.fields?.[0].type).toBe("string");
      }
    });

    it("should handle array properties", () => {
      const schema: SchemaLike = {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
      };

      const spec = createMockSpec({ WithArray: schema });
      const endpoint = createMockEndpoint();

      // Reference the WithArray schema
      (endpoint.responseSchema as any) = { $ref: "WithArray" };

      const result = generateIrClass(endpoint, spec);

      expect(result.classes).toHaveLength(1);
      const arrayClass = result.classes[0];

      expect(arrayClass.name).toBe("WithArray");
      expect(arrayClass.fields?.[0].type).toBe("Array<string>");
    });
  });

  describe("enum generation", () => {
    it("should generate enum from string enum schema", () => {
      const schema: SchemaLike = {
        type: "string",
        enum: ["pending", "active", "inactive"],
        description: "Status enum",
      };

      const spec = createMockSpec({ Status: schema });
      const endpoint = createMockEndpoint();

      // Reference the Status schema from the endpoint
      (endpoint.responseSchema as any) = { $ref: "Status" };

      const result = generateIrClass(endpoint, spec);

      expect(result.classes).toHaveLength(1);
      const statusEnum = result.classes[0];

      expect(statusEnum.name).toBe("Status");
      expect(statusEnum.kind).toBe("enum");
      expect(statusEnum.comment).toBe("Status enum");
      expect(statusEnum.members).toHaveLength(3);

      expect(statusEnum.members?.[0].name).toBe("VALUE_0");
      expect(statusEnum.members?.[0].value).toBe("pending");
    });
  });

  describe("response type interface generation", () => {
    it("should generate response type interface for endpoint", () => {
      const responseSchema: SchemaLike = {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              ship: { type: "string" },
              position: { type: "object" },
            },
            required: ["ship"],
          },
        },
      };

      const endpoint = createMockEndpoint(
        "navigateShip",
        "navigate",
        responseSchema,
      );
      const spec = createMockSpec();

      const result = generateIrClass(endpoint, spec);

      // Now generates multiple interfaces: NavigateShipResponse, Data, Ship, Object
      expect(result.classes.length).toBeGreaterThanOrEqual(1);

      const responseClass = result.classes.find(
        (c) => c.name === "NavigateShipResponse",
      );
      expect(responseClass).toBeDefined();
      expect(responseClass?.kind).toBe("interface");
      // The generated interface has fields from the data schema
      expect(responseClass?.fields).toHaveLength(2);
      expect(
        responseClass?.fields?.find((f) => f.name === "ship"),
      ).toBeDefined();
      expect(
        responseClass?.fields?.find((f) => f.name === "position"),
      ).toBeDefined();
    });

    it("should use operationId for response type name", () => {
      const responseSchema: SchemaLike = {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              ship: { type: "string" },
            },
          },
        },
      };

      const endpoint = createMockEndpoint(
        "getShipDetails",
        "default",
        responseSchema,
      );
      const spec = createMockSpec();

      const result = generateIrClass(endpoint, spec);

      expect(result.classes[0].name).toBe("GetShipDetailsResponse");
    });

    it("should generate an interface for a flat object response (no data wrapper)", () => {
      const responseSchema: SchemaLike = {
        type: "object",
        properties: {
          status: { type: "string" },
          version: { type: "string" },
        },
      };

      const endpoint = createMockEndpoint(
        "get-status",
        "Global",
        responseSchema,
      );
      const spec = createMockSpec();

      const result = generateIrClass(endpoint, spec);

      // getStatus -> GetStatusResponse, built from the flat object itself.
      const responseClass = result.classes.find(
        (c) => c.name === "GetStatusResponse",
      );
      expect(responseClass).toBeDefined();
      expect(responseClass?.kind).toBe("interface");
      expect(
        responseClass?.fields?.find((f) => f.name === "status"),
      ).toBeDefined();
      expect(
        responseClass?.fields?.find((f) => f.name === "version"),
      ).toBeDefined();
    });
  });

  describe("type collection", () => {
    it("should collect referenced types from $ref in endpoint response", () => {
      const spec = createMockSpec({
        Ship: { type: "object", properties: { name: { type: "string" } } },
        Engine: { type: "object", properties: { power: { type: "number" } } },
      });

      const endpoint = createMockEndpoint();
      // Reference the Ship schema in response
      (endpoint.responseSchema as any) = { $ref: "Ship" };

      const result = generateIrClass(endpoint, spec);

      // Should include Ship (referenced) but not Engine (not referenced)
      expect(result.classes.some((c) => c.name === "Ship")).toBe(true);
      expect(result.classes.some((c) => c.name === "Engine")).toBe(false);
    });

    it("should collect nested referenced types through schema traversal", () => {
      // Create a spec with Ship that references Engine
      const spec = createMockSpec({
        Ship: {
          type: "object",
          properties: {
            engine: { $ref: "Engine" },
          },
        },
        Engine: { type: "object", properties: { power: { type: "number" } } },
      });

      const endpoint = createMockEndpoint();
      // Endpoint references Ship
      (endpoint.responseSchema as any) = { $ref: "Ship" };

      const result = generateIrClass(endpoint, spec);

      // Should include Ship (directly referenced from endpoint)
      expect(result.classes.some((c) => c.name === "Ship")).toBe(true);
      // Engine is nested inside Ship and now included via transitive reference collection
      expect(result.classes.some((c) => c.name === "Engine")).toBe(true);
    });
  });

  describe("inline object schema generation", () => {
    it("should generate interfaces for inline object schemas in endpoint response", () => {
      // This test demonstrates the enhancement needed for inline object schemas
      const responseSchema: SchemaLike = {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              ship: { type: "string" },
              position: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                },
              },
            },
            required: ["ship"],
          },
        },
      };

      const endpoint = createMockEndpoint(
        "navigateShip",
        "navigate",
        responseSchema,
      );
      const spec = createMockSpec();

      const result = generateIrClass(endpoint, spec);

      // After enhancement, should generate interfaces for inline objects:
      // - Data (from top-level response object)
      // - Ship (from response.data)
      // - Object (from response.data.position)
      expect(result.classes.length).toBeGreaterThanOrEqual(1);

      // Check that we have the Data interface (for top-level response)
      const dataInterface = result.classes.find((c) => c.name === "Data");
      expect(dataInterface).toBeDefined();

      if (dataInterface) {
        expect(dataInterface.kind).toBe("interface");
        // Data interface should have field 'data' (not ship/position directly)
        expect(dataInterface.fields).toHaveLength(1);
        expect(
          dataInterface.fields?.find((f) => f.name === "data"),
        ).toBeDefined();
      }

      // Check that the 'data' field references the Ship interface
      const dataField = dataInterface?.fields?.find((f) => f.name === "data");
      expect(dataField).toBeDefined();
      if (dataField) {
        // The type should be the Ship interface name
        expect(dataField.type).toBe("Ship");
      }

      // Check that we have the Ship interface (for data object)
      const shipInterface = result.classes.find((c) => c.name === "Ship");
      expect(shipInterface).toBeDefined();

      if (shipInterface) {
        expect(shipInterface.kind).toBe("interface");
        // Ship should have fields: ship and position
        expect(shipInterface.fields).toHaveLength(2);
        const shipField = shipInterface.fields?.find((f) => f.name === "ship");
        const positionField = shipInterface.fields?.find(
          (f) => f.name === "position",
        );
        expect(shipField).toBeDefined();
        expect(positionField).toBeDefined();

        // The 'position' field should reference the X interface (named from first property)
        if (positionField) {
          expect(positionField.type).toBe("X");
        }
      }

      // Check that we have the X interface (for position object, named from first property)
      const xInterface = result.classes.find((c) => c.name === "X");
      expect(xInterface).toBeDefined();

      if (xInterface) {
        expect(xInterface.kind).toBe("interface");
        // X should have fields: x and y
        expect(xInterface.fields).toHaveLength(2);
        const xField = xInterface.fields?.find((f: any) => f.name === "x");
        const yField = xInterface.fields?.find((f: any) => f.name === "y");
        expect(xField).toBeDefined();
        expect(yField).toBeDefined();
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty schema", () => {
      const spec = createMockSpec();
      const endpoint = createMockEndpoint();

      const result = generateIrClass(endpoint, spec);

      expect(result.classes).toHaveLength(0);
    });

    it("should handle schema with no properties", () => {
      const schema: SchemaLike = {
        type: "object",
        description: "Empty object",
      };

      const spec = createMockSpec({ Empty: schema });
      const endpoint = createMockEndpoint();

      // Reference the Empty schema
      (endpoint.responseSchema as any) = { $ref: "Empty" };

      const result = generateIrClass(endpoint, spec);

      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe("Empty");
      expect(result.classes[0].fields).toEqual([]);
    });

    it("should handle integer type as number", () => {
      const schema: SchemaLike = {
        type: "object",
        properties: {
          count: { type: "integer" },
        },
      };

      const spec = createMockSpec({ Count: schema });
      const endpoint = createMockEndpoint();

      // Reference the Count schema
      (endpoint.responseSchema as any) = { $ref: "Count" };

      const result = generateIrClass(endpoint, spec);

      expect(result.classes[0].fields?.[0].type).toBe("number");
    });
  });
});
