// src/config/swagger.js
function buildOpenApiSpec(baseUrl = "http://localhost:8080") {
  return {
    openapi: "3.0.3",
    info: {
      title: "G-SUPERMARKET API",
      version: "1.0.0",
      description: "API for G-SUPERMARKET e-commerce (Express + MySQL + Payment webhook).",
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", example: "Nguyen An" },
            email: { type: "string", example: "an@gmail.com" },
            phone: { type: "string", example: "0901111111" },
            password: { type: "string", example: "StrongPass#1" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", example: "an@gmail.com" },
            password: { type: "string", example: "StrongPass#1" },
          },
        },
        RefreshRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string", example: "eyJhbGciOi..." },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
            role: { type: "string", example: "CUSTOMER" },
          },
        },
        RegisterResponse: {
          type: "object",
          properties: {
            userId: { type: "number", example: 123 },
            message: { type: "string", example: "REGISTERED" },
          },
        },
        MeResponse: {
          type: "object",
          properties: {
            id: { type: "number", example: 3 },
            name: { type: "string", example: "Nguyen An" },
            email: { type: "string", example: "an@gmail.com" },
            phone: { type: "string", example: "0901111111" },
            role: { type: "string", example: "CUSTOMER" },
            status: { type: "string", example: "ACTIVE" },
          },
        },
      },
    },
    paths: {
      "/api/auth/register": {
        post: {
          summary: "Register customer",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } },
          },
          responses: {
            201: {
              description: "Registered",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterResponse" } } },
            },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            409: { description: "Email exists", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/api/auth/login": {
        post: {
          summary: "Login",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } },
          },
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } },
            401: { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            403: { description: "User blocked", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/api/auth/refresh": {
        post: {
          summary: "Refresh token (stateless)",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } },
          },
          responses: {
            200: { description: "New tokens", content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } },
            401: { description: "Invalid refresh token", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/api/auth/me": {
        get: {
          summary: "Get current user",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/MeResponse" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/health": {
        get: { summary: "Health check", tags: ["System"], responses: { 200: { description: "OK" } } },
      },
    },
  };
}

module.exports = { buildOpenApiSpec };