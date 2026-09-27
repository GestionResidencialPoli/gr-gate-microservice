const openapi = {
  openapi: "3.0.3",
  info: {
    title: "GR Gate Microservice",
    version: "1.0.0",
    description:
      "API de porteria: visitas y aforo del parqueadero de visitantes. Autenticacion por la cookie access_token emitida por gr-user-microservice; las mutaciones exigen el encabezado X-XSRF-TOKEN igual a la cookie XSRF-TOKEN.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {},
};

export default openapi;
