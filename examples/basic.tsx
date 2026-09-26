/**
 * @powerduck/oas-document — basic usage example
 *
 * Run this in a React 18+ app with the package installed.
 */

import { OasDocument } from "@powerduck/oas-document/react";
import "@powerduck/oas-document/react/index.css";
import "@powerduck/tree/react/index.css";

/** A minimal OpenAPI 3.1 document used for the demo. */
const petStoreSpec = {
  openapi: "3.1.0",
  info: {
    title: "Pet Store API",
    version: "1.0.0",
    description:
      "A sample API demonstrating **@powerduck/oas-document**.\n\n" +
      "Features:\n" +
      "- Auto-upgrade to OAS 3.2\n" +
      "- Tree navigation\n" +
      "- Schema exploration\n" +
      "- Code examples",
  },
  servers: [{ url: "https://petstore.example.com/v1", description: "Example server" }],
  tags: [
    { name: "pets", description: "Pet management operations" },
    { name: "store", description: "Store inventory" },
  ],
  "x-tagGroups": [
    { name: "Core", tags: ["pets"] },
    { name: "Admin", tags: ["store"] },
  ],
  paths: {
    "/pets": {
      get: {
        summary: "List all pets",
        operationId: "listPets",
        tags: ["pets"],
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Maximum number of results",
            schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
          {
            name: "status",
            in: "query",
            required: false,
            description: "Filter by pet status",
            schema: {
              type: "string",
              enum: ["available", "pending", "sold"],
              default: "available",
            },
          },
        ],
        responses: {
          "200": {
            description: "A list of pets",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Pet" },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a pet",
        operationId: "createPet",
        tags: ["pets"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NewPet" },
            },
          },
        },
        responses: {
          "201": {
            description: "Pet created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
          "400": { description: "Invalid input" },
        },
      },
    },
    "/pets/{petId}": {
      get: {
        summary: "Get a pet by ID",
        operationId: "getPet",
        tags: ["pets"],
        parameters: [
          {
            name: "petId",
            in: "path",
            required: true,
            description: "The pet's unique identifier",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The requested pet",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
          "404": { description: "Pet not found" },
        },
      },
      delete: {
        summary: "Delete a pet",
        operationId: "deletePet",
        tags: ["pets"],
        parameters: [
          {
            name: "petId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "204": { description: "Pet deleted" },
          "404": { description: "Pet not found" },
        },
      },
    },
    "/store/inventory": {
      get: {
        summary: "Get store inventory",
        operationId: "getInventory",
        tags: ["store"],
        description: "Returns pet inventories by status.",
        responses: {
          "200": {
            description: "Inventory counts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    available: { type: "integer" },
                    pending: { type: "integer" },
                    sold: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "string", format: "uuid", description: "Unique identifier" },
          name: { type: "string", description: "The pet's name", example: "Rex" },
          status: {
            type: "string",
            enum: ["available", "pending", "sold"],
            default: "available",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for categorization",
          },
          createdAt: { type: "string", format: "date-time", readOnly: true },
        },
      },
      NewPet: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "The pet's name" },
          status: {
            type: "string",
            enum: ["available", "pending", "sold"],
            default: "available",
          },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export default function BasicExample() {
  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <OasDocument
        input={petStoreSpec}
        defaultOperationId="listPets"
        style={{ height: "100%" }}
      />
    </div>
  );
}
