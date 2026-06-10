import { describe, expect, it } from 'vitest'
import {
  isTsTypeOptional,
  tsTypeToZeroType,
} from '../src/schema-transformer.js'

describe('tsTypeToZeroType', () => {
  it('maps string to string()', () => {
    expect(tsTypeToZeroType('string')).toBe('string()')
  })

  it('maps number to number()', () => {
    expect(tsTypeToZeroType('number')).toBe('number()')
  })

  it('maps boolean to boolean()', () => {
    expect(tsTypeToZeroType('boolean')).toBe('boolean()')
  })

  it('maps DateTime to number()', () => {
    expect(tsTypeToZeroType('DateTime')).toBe('number()')
  })

  it('maps Date to number()', () => {
    expect(tsTypeToZeroType('Date')).toBe('number()')
  })

  it('maps object to json()', () => {
    expect(tsTypeToZeroType('object')).toBe('json()')
  })

  it('maps unknown to json()', () => {
    expect(tsTypeToZeroType('unknown')).toBe('json()')
  })

  it('maps any to json()', () => {
    expect(tsTypeToZeroType('any')).toBe('json()')
  })

  it('falls back to json() for unrecognised types', () => {
    expect(tsTypeToZeroType('Buffer')).toBe('json()')
    expect(tsTypeToZeroType('Record<string, unknown>')).toBe('json()')
  })

  it('strips | null from a union and maps the base type', () => {
    expect(tsTypeToZeroType('string | null')).toBe('string()')
    expect(tsTypeToZeroType('number | null')).toBe('number()')
    expect(tsTypeToZeroType('DateTime | null')).toBe('number()')
  })

  it('strips | undefined from a union and maps the base type', () => {
    expect(tsTypeToZeroType('string | undefined')).toBe('string()')
    expect(tsTypeToZeroType('boolean | undefined')).toBe('boolean()')
  })

  it('strips both | null | undefined', () => {
    expect(tsTypeToZeroType('string | null | undefined')).toBe('string()')
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
