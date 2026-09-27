export const TIPOS_VISITA = ["SOCIAL", "DOMICILIO", "SERVICIO", "OTRO"] as const;

export type TipoVisita = (typeof TIPOS_VISITA)[number];

export interface VisitanteRow {
  id: string;
  documento: string;
  nombre: string;
  created_at: Date;
  updated_at: Date;
}

export interface VisitaRow {
  id: string;
  visitante_id: string;
  visitante_documento?: string;
  visitante_nombre?: string;
  apartamento_id: string;
  apartamento_torre: string;
  apartamento_numero: string;
  tipo_visita: TipoVisita;
  con_vehiculo: boolean;
  placa: string | null;
  entrada_en: Date;
  vigilante_entrada_user_id: string;
  vigilante_entrada_email: string;
  salida_en: Date | null;
  vigilante_salida_user_id: string | null;
  vigilante_salida_email: string | null;
}

export interface VisitaDto {
  id: number;
  visitante: { id: number; documento: string; nombre: string };
  apartamento: { id: number; torre: string; numero: string };
  tipoVisita: TipoVisita;
  conVehiculo: boolean;
  placa: string | null;
  estado: "ABIERTA" | "CERRADA";
  entrada: { en: string; vigilante: { userId: number; email: string } };
  salida: { en: string; vigilante: { userId: number; email: string } } | null;
  minutosDentro: number;
  posibleOlvido: boolean;
}

export interface IngresoInput {
  documento: string;
  nombre?: string;
  torre: string;
  numero: string;
  tipoVisita: TipoVisita;
  conVehiculo: boolean;
  placa?: string;
  cerrarVisitaAnterior: boolean;
}
