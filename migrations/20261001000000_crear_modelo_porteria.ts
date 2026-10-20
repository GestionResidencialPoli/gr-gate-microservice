import type { Knex } from "knex";

const TIPOS_VISITA = ["SOCIAL", "DOMICILIO", "SERVICIO", "OTRO"];
const TOTAL_INICIAL_CUPOS = 10;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("visitantes", (table) => {
    table.bigIncrements("id").primary();
    table.string("documento", 30).notNullable().unique({ indexName: "ux_visitantes_documento" });
    table.string("nombre", 150).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("visitas", (table) => {
    table.bigIncrements("id").primary();
    table
      .bigInteger("visitante_id")
      .notNullable()
      .references("id")
      .inTable("visitantes")
      .onDelete("RESTRICT")
      .withKeyName("fk_visitas_visitante");
    table.bigInteger("apartamento_id").notNullable();
    table.string("apartamento_torre", 20).notNullable();
    table.string("apartamento_numero", 20).notNullable();
    table.string("tipo_visita", 20).notNullable();
    table.boolean("con_vehiculo").notNullable();
    table.string("placa", 10).nullable();
    table.timestamp("entrada_en", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.bigInteger("vigilante_entrada_user_id").notNullable();
    table.string("vigilante_entrada_email", 254).notNullable();
    table.timestamp("salida_en", { useTz: true }).nullable();
    table.bigInteger("vigilante_salida_user_id").nullable();
    table.string("vigilante_salida_email", 254).nullable();

    table.check("?? = ANY (?)", ["tipo_visita", TIPOS_VISITA], "ck_visitas_tipo");
    table.check("con_vehiculo OR placa IS NULL", [], "ck_visitas_placa_con_vehiculo");
    table.check(
      "(salida_en IS NULL) = (vigilante_salida_user_id IS NULL) AND (salida_en IS NULL) = (vigilante_salida_email IS NULL)",
      [],
      "ck_visitas_salida_completa",
    );
    table.check("salida_en IS NULL OR salida_en >= entrada_en", [], "ck_visitas_salida_posterior");
  });

  await knex.raw(`
    CREATE UNIQUE INDEX ux_visitas_abierta_por_visitante
    ON visitas (visitante_id)
    WHERE salida_en IS NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_visitas_abiertas_entrada
    ON visitas (entrada_en)
    WHERE salida_en IS NULL
  `);
  await knex.raw("CREATE INDEX idx_visitas_entrada ON visitas (entrada_en DESC)");
  await knex.raw("CREATE INDEX idx_visitas_apartamento_entrada ON visitas (apartamento_id, entrada_en DESC)");

  await knex.schema.createTable("aforo_parqueadero", (table) => {
    table.smallint("id").primary();
    table.integer("total").notNullable();
    table.integer("ocupados").notNullable().defaultTo(0);
    table.integer("sobrecupo_permitido").notNullable().defaultTo(0);
    table.timestamp("actualizado_en", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check("id = 1", [], "ck_aforo_unico");
    table.check("total > 0", [], "ck_aforo_total_positivo");
    table.check("ocupados >= 0", [], "ck_aforo_ocupados_no_negativo");
    table.check("sobrecupo_permitido >= 0", [], "ck_aforo_sobrecupo_no_negativo");
    table.check("ocupados <= GREATEST(total, sobrecupo_permitido)", [], "ck_aforo_ocupados_dentro_del_total");
  });

  await knex("aforo_parqueadero").insert({ id: 1, total: TOTAL_INICIAL_CUPOS });

  await knex.schema.createTable("cambios_aforo", (table) => {
    table.bigIncrements("id").primary();
    table.integer("total_anterior").notNullable();
    table.integer("total_nuevo").notNullable();
    table.integer("ocupados_en_el_cambio").notNullable();
    table.bigInteger("cambiado_por_user_id").notNullable();
    table.string("cambiado_por_email", 254).notNullable();
    table.timestamp("cambiado_en", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check("total_nuevo > 0", [], "ck_cambios_aforo_total_nuevo");
  });

  await knex.raw("CREATE INDEX idx_cambios_aforo_fecha ON cambios_aforo (cambiado_en DESC)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("cambios_aforo");
  await knex.schema.dropTable("aforo_parqueadero");
  await knex.schema.dropTable("visitas");
  await knex.schema.dropTable("visitantes");
}
