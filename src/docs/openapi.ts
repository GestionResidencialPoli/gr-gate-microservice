const errorResponses = {
  "400": { description: "SOLICITUD_INVALIDA: el cuerpo o los parametros no son validos" },
  "401": { description: "NO_AUTENTICADO: falta la cookie access_token o es invalida" },
  "403": { description: "ACCESO_DENEGADO por rol, o CSRF_INVALIDO en una mutacion" },
};

const aforo = {
  type: "object",
  properties: {
    total: { type: "integer" },
    ocupados: { type: "integer" },
    disponibles: { type: "integer" },
    sobrecupo: { type: "boolean" },
    estado: { type: "string", enum: ["DISPONIBLE", "POCOS_CUPOS", "COMPLETO"] },
    actualizadoEn: { type: "string", format: "date-time" },
  },
};

const pagina = [
  { name: "page", in: "query", schema: { type: "integer", default: 0 } },
  { name: "size", in: "query", schema: { type: "integer", default: 20 } },
];

const openapi = {
  openapi: "3.0.3",
  info: {
    title: "GR Gate Microservice",
    version: "1.0.0",
    description:
      "API de porteria: visitas y aforo del parqueadero de visitantes. Autenticacion por la cookie access_token emitida por gr-user-microservice; las mutaciones exigen el encabezado X-XSRF-TOKEN igual a la cookie XSRF-TOKEN. Las respuestas exitosas vienen envueltas en { payload } y los errores en { error: { code, message, details? } }.",
  },
  servers: [{ url: "/api/v1" }],
  components: { schemas: { Aforo: aforo } },
  paths: {
    "/porteria/aforo": {
      get: {
        summary: "Contador de cupos del parqueadero de visitantes (VIGILANTE, ADMINISTRACION)",
        responses: {
          "200": { description: "Aforo", content: { "application/json": { schema: { $ref: "#/components/schemas/Aforo" } } } },
          ...errorResponses,
        },
      },
    },
    "/porteria/aforo/total": {
      put: {
        summary: "Configurar el total de cupos (solo ADMINISTRACION)",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { total: { type: "integer", minimum: 1 } } } } },
        },
        responses: {
          "200": { description: "{ aforo, advertencia } con advertencia SOBRECUPO_TRANSITORIO si hay mas vehiculos dentro que el nuevo total" },
          ...errorResponses,
        },
      },
    },
    "/porteria/aforo/cambios": {
      get: {
        summary: "Historico de cambios del total de cupos (solo ADMINISTRACION)",
        parameters: pagina,
        responses: { "200": { description: "Pagina de cambios" }, ...errorResponses },
      },
    },
  },
};

export default openapi;
