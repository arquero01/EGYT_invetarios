import { z } from 'zod';
import {
  ORIGENES_SERIAL,
  TIPOS_EQUIPO,
  UNIDADES_CAPACIDAD,
  UNIDADES_MEDIDA,
} from './catalogos.ts';
import { errorValidacion, type DetalleError, type ErrorDominio } from './errores.ts';
import type { CodigoMensaje } from './mensajes.ts';
import { esFechaFutura, esFechaValida, normalizarNit, normalizarSerial } from './utilidades.ts';

/**
 * Toda escritura del sistema es un "comando": una operación con un id único
 * generado en el dispositivo. Así la misma operación se puede hacer en línea o
 * guardarse sin conexión y enviarse después, y si llega dos veces se aplica
 * una sola (idempotencia).
 */

// Mensajes por defecto de Zod en español (los propios se definen abajo).
z.config(z.locales.es());

// ── Piezas reutilizables ──────────────────────────────────────────────────

const OBLIGATORIO = 'Es obligatorio';

const texto = (max: number) =>
  z
    .string({ error: OBLIGATORIO })
    .trim()
    .min(1, OBLIGATORIO)
    .max(max, `Máximo ${max} caracteres`);

const id = z.uuid({ error: 'Debe ser un identificador UUID válido' });

const digitos = (min: number, max: number, nombre: string) =>
  z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v.replace(/[\s.]/g, '') : v),
    z
      .string({ error: OBLIGATORIO })
      .regex(
        new RegExp(`^\\d{${min},${max}}$`),
        min === max ? `${nombre} debe tener ${min} dígitos` : `${nombre} debe tener entre ${min} y ${max} dígitos`,
      ),
  );

const fechaPasada = z
  .string({ error: OBLIGATORIO })
  .refine(esFechaValida, 'Debe ser una fecha válida con formato AAAA-MM-DD')
  .refine((f) => !esFechaFutura(f), 'No puede ser una fecha futura');

const ubicacion = z.object({
  vereda: texto(100),
  municipio: texto(100),
  departamento: texto(100),
});

// ── Payloads por comando ──────────────────────────────────────────────────

/** RF-01 */
export const crearProyecto = z.object({
  proyectoId: id,
  nombre: texto(100),
  ...ubicacion.shape,
  fechaInicio: fechaPasada,
  descripcion: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});

/** RF-08: datos de la factura de compra. */
export const datosCompra = z.object({
  proveedor: texto(150),
  nit: z
    .string({ error: OBLIGATORIO })
    .refine((v) => normalizarNit(v) !== null, 'NIT inválido (solo dígitos; si incluye dígito de verificación, debe ser correcto)'),
  // Las facturas electrónicas de la DIAN llevan prefijo (p. ej. "FE-1234"),
  // por eso se acepta texto y no solo números.
  numeroFactura: z
    .string({ error: OBLIGATORIO })
    .trim()
    .regex(/^[A-Za-z0-9-]{1,30}$/, 'Número de factura inválido (letras, números y guiones; máximo 30)'),
  fechaCompra: fechaPasada,
});

/** RF-06, RF-07, RF-08 */
export const registrarIngreso = z
  .object({
    equipoId: id,
    tipo: z.enum(TIPOS_EQUIPO, { error: 'Tipo de equipo no permitido' }),
    marca: texto(80),
    modelo: texto(80),
    origenSerial: z.enum(ORIGENES_SERIAL, { error: 'Debe ser PROVEEDOR o EMPRESA' }),
    /** Obligatorio si el serial viene del proveedor; se omite si lo asigna la empresa. */
    serial: z.string().trim().max(60, 'Máximo 60 caracteres').optional(),
    potencia: z.number({ error: 'Debe ser un número' }).positive('Debe ser mayor a cero'),
    unidad: z.enum(UNIDADES_CAPACIDAD, { error: `Unidad no permitida (${UNIDADES_CAPACIDAD.join(', ')})` }),
    proyectoId: id,
    /** RL-02: bodega a la que llega el equipo. */
    bodegaId: id,
    compra: datosCompra,
    valorPagado: z.number({ error: 'Debe ser un número' }).positive('Debe ser mayor a cero'),
  })
  .superRefine((d, ctx) => {
    if (d.origenSerial === 'PROVEEDOR') {
      if (!d.serial) {
        ctx.addIssue({ code: 'custom', path: ['serial'], message: OBLIGATORIO });
      } else if (normalizarSerial(d.serial).startsWith('EGT-')) {
        ctx.addIssue({ code: 'custom', path: ['serial'], message: 'El prefijo EGT- está reservado para seriales asignados por la empresa' });
      }
    } else if (d.serial) {
      ctx.addIssue({ code: 'custom', path: ['serial'], message: 'El serial de la empresa lo asigna el sistema; no debe enviarse' });
    }
  });

/** RF-03 */
export const cambiarProyecto = z.object({
  equipoId: id,
  proyectoId: id,
});

/** RF-11, RF-12 */
export const instalarEquipo = z.object({
  equipoId: id,
  instalacionId: id,
  usuario: z.object({
    nombre: texto(150),
    cedula: digitos(6, 10, 'La cédula'),
    telefono: digitos(10, 10, 'El teléfono'),
  }),
  ubicacion,
  fechaInstalacion: fechaPasada,
  tecnico: texto(150),
});

/** RF-13 */
export const retirarEquipo = z.object({
  equipoId: id,
  motivo: z.string({ error: OBLIGATORIO }).trim().min(10, 'Debe tener al menos 10 caracteres').max(500, 'Máximo 500 caracteres'),
});

/** RF-14 */
export const enviarAMantenimiento = z.object({
  equipoId: id,
  motivo: texto(500),
});

/** Supuesto: salida de mantenimiento de vuelta a stock (no definida en el documento). */
export const finalizarMantenimiento = z.object({
  equipoId: id,
  observacion: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});

/** RF-15 */
export const darDeBaja = z.object({
  equipoId: id,
  motivo: texto(500),
});
