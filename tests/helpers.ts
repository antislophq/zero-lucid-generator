import type { LucidModel } from '@adonisjs/lucid/types/model'

type MockColumn = {
  columnName: string
  isPrimary?: boolean
}

type MockRelation = {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany' | 'hasManyThrough'
  localKey: string
  foreignKey: string
  relatedModel: () => LucidModel
  // manyToMany
  pivotTable?: string
  pivotForeignKey?: string
  pivotRelatedForeignKey?: string
  relatedKey?: string
  // hasManyThrough
  throughModel?: () => LucidModel
  throughLocalKey?: string
  throughForeignKey?: string
  bootError?: string
}

export function createMockModel(opts: {
  name: string
  table: string
  primaryKey?: string
  columns?: Record<string, MockColumn>
  relations?: Record<string, MockRelation>
}): LucidModel {
  const $columnsDefinitions = new Map(
    Object.entries(opts.columns ?? {}).map(([attr, col]) => [
      attr,
      { columnName: col.columnName, isPrimary: col.isPrimary ?? false },
    ]),
  )

  const $relationsDefinitions = new Map(
    Object.entries(opts.relations ?? {}).map(([name, rel]) => [
      name,
      {
        boot() {
          if (rel.bootError) throw new Error(rel.bootError)
        },
        type: rel.type,
        localKey: rel.localKey,
        foreignKey: rel.foreignKey,
        relatedModel: rel.relatedModel,
        pivotTable: rel.pivotTable,
        pivotForeignKey: rel.pivotForeignKey,
        pivotRelatedForeignKey: rel.pivotRelatedForeignKey,
        relatedKey: rel.relatedKey,
        throughModel: rel.throughModel,
        throughLocalKey: rel.throughLocalKey,
        throughForeignKey: rel.throughForeignKey,
      },
    ]),
  )

  return {
    name: opts.name,
    table: opts.table,
    primaryKey: opts.primaryKey ?? 'id',
    $columnsDefinitions,
    $relationsDefinitions,
  } as unknown as LucidModel
}
