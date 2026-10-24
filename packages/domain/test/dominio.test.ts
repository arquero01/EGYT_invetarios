import { describe, expect, it } from 'vitest';
import {
  accionesPermitidas,
  digitoVerificacionNit,
  esFechaFutura,
  esFechaValida,
  evaluarTransicion,
  fechaColombia,
  normalizarBusqueda,
  normalizarNit,
  normalizarSerial,
  transicion,
} from '../src/index.ts';

describe('máquina de estados', () => {
  it('solo instala desde En stock', () => {
    expect(evaluarTransicion('EN_STOCK', 'INSTALAR')).toEqual({ ok: true, estado: 'INSTALADO' });

    const r = evaluarTransicion('EN_MANTENIMIENTO', 'INSTALAR');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('RF-11');
  });

  it('retirar solo desde Instalado', () => {
    expect(evaluarTransicion('INSTALADO', 'RETIRAR')).toEqual({ ok: true, estado: 'EN_STOCK' });
    expect(evaluarTransicion('EN_STOCK', 'RETIRAR').ok).toBe(false);
  });

  it('no envía a mantenimiento dos veces', () => {
    const r = evaluarTransicion('EN_MANTENIMIENTO', 'ENVIAR_A_MANTENIMIENTO');
    if (!r.ok) expect(r.error.codigo).toBe('MANT-YA');
    else throw new Error('debía fallar');
  });

  it('un equipo dado de baja no admite ninguna acción', () => {
    expect(accionesPermitidas('DADO_DE_BAJA')).toEqual([]);

    const retiro = evaluarTransicion('DADO_DE_BAJA', 'RETIRAR');
    if (!retiro.ok) expect(retiro.error.codigo).toBe('RF-15');

    const mantenimiento = evaluarTransicion('DADO_DE_BAJA', 'ENVIAR_A_MANTENIMIENTO');
    if (!mantenimiento.ok) expect(mantenimiento.error.codigo).toBe('RF-14');
  });

  it('transicion() lanza el error en lugar de devolverlo', () => {
    expect(() => transicion('DADO_DE_BAJA', 'INSTALAR')).toThrow('Un equipo dado de baja no puede modificarse');
  });

  it('muestra solo los botones válidos', () => {
    expect(accionesPermitidas('EN_STOCK')).toEqual(['INSTALAR', 'ENVIAR_A_MANTENIMIENTO', 'DAR_DE_BAJA', 'CAMBIAR_PROYECTO']);
    expect(accionesPermitidas('INSTALADO')).toEqual(['RETIRAR', 'ENVIAR_A_MANTENIMIENTO', 'DAR_DE_BAJA']);
  });
});

describe('utilidades', () => {
  it('calcula el dígito de verificación del NIT (DIAN 800197268-4)', () => {
    expect(digitoVerificacionNit('800197268')).toBe(4);
    expect(normalizarNit('800.197.268-4')).toEqual({ numero: '800197268', dv: 4 });
    expect(normalizarNit('800197268-5')).toBeNull();
    expect(normalizarNit('80019726A')).toBeNull();
  });

  it('usa la fecha de Colombia, no la UTC', () => {
    // 2026-03-01 02:00 UTC = 2026-02-28 9:00 p. m. en Bogotá
    expect(fechaColombia(new Date('2026-03-01T02:00:00Z'))).toBe('2026-02-28');
    expect(esFechaFutura('2026-03-01', new Date('2026-03-01T02:00:00Z'))).toBe(true);
  });

  it('rechaza fechas que no existen', () => {
    expect(esFechaValida('2026-02-28')).toBe(true);
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('28/02/2026')).toBe(false);
  });

  it('normaliza seriales y búsquedas', () => {
    expect(normalizarSerial(' jk 2024 001 ')).toBe('JK2024001');
    expect(normalizarBusqueda('  María LÓPEZ ')).toBe('maria lopez');
  });
});