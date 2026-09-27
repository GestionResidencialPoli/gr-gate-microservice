export type EstadoAforo = "DISPONIBLE" | "POCOS_CUPOS" | "COMPLETO";

export interface AforoRow {
  id: number;
  total: number;
  ocupados: number;
  sobrecupo_permitido: number;
  actualizado_en: Date;
}

export interface AforoDto {
  total: number;
  ocupados: number;
  disponibles: number;
  sobrecupo: boolean;
  estado: EstadoAforo;
  actualizadoEn: string;
}

export interface CambioAforoRow {
  id: string;
  total_anterior: number;
  total_nuevo: number;
  ocupados_en_el_cambio: number;
  cambiado_por_user_id: string;
  cambiado_por_email: string;
  cambiado_en: Date;
}

export interface CambioAforoDto {
  id: number;
  totalAnterior: number;
  totalNuevo: number;
  ocupadosEnElCambio: number;
  cambiadoPor: { userId: number; email: string };
  cambiadoEn: string;
}

export interface Responsable {
  userId: number;
  email: string;
}
