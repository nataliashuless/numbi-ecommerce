import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMarketingCity, marketingWeekday } from '../lib/marketing/distributions.ts'

test('Bogota spelling case accents and district suffixes share one city', () => {
  for (const city of ['Bogotá', 'Bogota', 'BOGOTÁ', 'Bogotá D.C.', 'Bogota DC', 'Santa Fe de Bogotá', 'Bogota Distrito Capital']) assert.equal(normalizeMarketingCity(city), 'Bogotá')
  assert.equal(normalizeMarketingCity('Medellin'), 'Medellín')
  assert.equal(normalizeMarketingCity('  CALI '), 'Cali')
})
test('missing city remains explicit and is never assigned to Bogota', () => {
  for (const city of [null, undefined, '', '  ']) assert.equal(normalizeMarketingCity(city), 'Sin ciudad registrada')
})
test('weekday preserves the previously resolved Colombian calendar date', () => {
  assert.equal(marketingWeekday('2026-09-07'), 'Lunes')
  assert.equal(marketingWeekday('2026-09-13'), 'Domingo')
})
