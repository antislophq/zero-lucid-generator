import { describe, expect, it } from 'vitest'
import { isTsTypeOptional, mapTsTypeToZero } from '../src/lucid-to-zero.js'

describe('mapTsTypeToZero', () => {
  it('maps string to string()', () => {
    expect(mapTsTypeToZero('string')).toBe('string()')
  })

  it('maps number to number()', () => {
    expect(mapTsTypeToZero('number')).toBe('number()')
  })

  it('maps boolean to boolean()', () => {
    expect(mapTsTypeToZero('boolean')).toBe('boolean()')
  })

  it('maps DateTime to number()', () => {
    expect(mapTsTypeToZero('DateTime')).toBe('number()')
  })

  it('maps Date to number()', () => {
    expect(mapTsTypeToZero('Date')).toBe('number()')
  })

  it('maps object to json()', () => {
    expect(mapTsTypeToZero('object')).toBe('json()')
  })

  it('maps unknown to json()', () => {
    expect(mapTsTypeToZero('unknown')).toBe('json()')
  })

  it('maps any to json()', () => {
    expect(mapTsTypeToZero('any')).toBe('json()')
  })

  it('falls back to json() for unrecognised types', () => {
    expect(mapTsTypeToZero('Buffer')).toBe('json()')
    expect(mapTsTypeToZero('Record<string, unknown>')).toBe('json()')
  })

  it('strips | null from a union and maps the base type', () => {
    expect(mapTsTypeToZero('string | null')).toBe('string()')
    expect(mapTsTypeToZero('number | null')).toBe('number()')
    expect(mapTsTypeToZero('DateTime | null')).toBe('number()')
  })

  it('strips | undefined from a union and maps the base type', () => {
    expect(mapTsTypeToZero('string | undefined')).toBe('string()')
    expect(mapTsTypeToZero('boolean | undefined')).toBe('boolean()')
  })

  it('strips both | null | undefined', () => {
    expect(mapTsTypeToZero('string | null | undefined')).toBe('string()')
  })
})

describe('isTsTypeOptional', () => {
  it('returns false for non-nullable types', () => {
    expect(isTsTypeOptional('string')).toBe(false)
    expect(isTsTypeOptional('number')).toBe(false)
    expect(isTsTypeOptional('DateTime')).toBe(false)
  })

  it('returns true when type includes null', () => {
    expect(isTsTypeOptional('string | null')).toBe(true)
    expect(isTsTypeOptional('DateTime | null')).toBe(true)
  })

  it('returns true when type includes undefined', () => {
    expect(isTsTypeOptional('string | undefined')).toBe(true)
  })

  it('returns true for null | undefined union', () => {
    expect(isTsTypeOptional('string | null | undefined')).toBe(true)
  })
})
